"""Local point/box prompted segmentation; models and image embeddings stay off the UI thread."""
import base64, hashlib, io, json, math, os, sys, time
from pathlib import Path

ROOT=Path(__file__).resolve().parent
VENDOR=ROOT/'vendor/MobileSAM'
CHECKPOINT=VENDOR/'weights/mobile_sam.pt'
predictor=None
embedding_key=None

def info():
    import importlib.util
    installed=all(importlib.util.find_spec(n) for n in ['torch','torchvision','timm','numpy','cv2','PIL'])
    return {'engine':'MobileSAM','available':installed and CHECKPOINT.is_file() and (VENDOR/'mobile_sam').is_dir(),'local':True,'device':'cpu','checkpointBytes':CHECKPOINT.stat().st_size if CHECKPOINT.is_file() else 0}

def get_predictor():
    global predictor
    if predictor is None:
        if not info()['available']:raise ValueError('MobileSAM 未安装；运行 npm run selection:setup 安装本地智能选区依赖')
        sys.path.insert(0,str(VENDOR))
        import torch
        from mobile_sam import sam_model_registry,SamPredictor
        torch.set_num_threads(min(4,os.cpu_count() or 1))
        # Load official weights as tensors only; never unpickle arbitrary result files.
        model=sam_model_registry['vit_t']()
        model.load_state_dict(torch.load(str(CHECKPOINT),map_location='cpu',weights_only=True))
        model.to('cpu').eval()
        predictor=SamPredictor(model)
    return predictor

def select(args):
    global embedding_key
    import numpy as np,cv2
    from PIL import Image
    encoded=args.get('image','')
    if not isinstance(encoded,str) or len(encoded)>45*1024*1024:raise ValueError('智能选区图像超过输入限制')
    raw=base64.b64decode(encoded.split(',')[-1],validate=True)
    im=Image.open(io.BytesIO(raw))
    if im.width*im.height>16777216 or max(im.size)>8192:raise ValueError('智能选区图像超过 16 MP')
    im=im.convert('RGBA');rgba=np.asarray(im);h,w=rgba.shape[:2]
    points=args.get('points',[]);labels=args.get('labels',[]);box=args.get('box')
    if not isinstance(points,list) or not isinstance(labels,list) or len(points)>64 or len(points)!=len(labels):raise ValueError('智能选区提示点无效')
    if any(not isinstance(p,list) or len(p)!=2 or any(not isinstance(v,(int,float)) or not math.isfinite(v) for v in p) or not(0<=p[0]<w and 0<=p[1]<h) for p in points):raise ValueError('提示点必须位于图像内')
    if any(v not in [0,1] for v in labels):raise ValueError('提示点类型无效')
    if box is not None and (not isinstance(box,list) or len(box)!=4 or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in box) or not(0<=box[0]<box[2]<=w and 0<=box[1]<box[3]<=h)):raise ValueError('智能选区范围无效')
    if not points and box is None:raise ValueError('请点击对象，或拖框圈定对象')
    if points and not any(labels):raise ValueError('至少保留一个前景提示点')
    engine=args.get('engine','sam')
    if engine=='sam':
        import torch
        p=get_predictor();key=hashlib.sha256(raw).hexdigest();cached=key==embedding_key
        # RGB is premultiplied against a neutral canvas; transparent pixels are removed afterwards.
        rgb=np.uint8(rgba[:,:,:3]*(rgba[:,:,3:4]/255.0)+127*(1-rgba[:,:,3:4]/255.0))
        with torch.inference_mode():
            if not cached:p.set_image(rgb);embedding_key=key
            masks,scores,_=p.predict(point_coords=np.asarray(points,dtype=np.float32) if points else None,point_labels=np.asarray(labels,dtype=np.int32) if points else None,box=np.asarray(box,dtype=np.float32) if box else None,multimask_output=True)
        mask=masks[int(np.argmax(scores))].astype(np.uint8)*255;score=float(max(scores))
    elif engine=='grabcut':
        if box is None:raise ValueError('GrabCut 需要先拖框圈定对象')
        scale=min(1,768/max(w,h));sw,sh=round(w*scale),round(h*scale)
        rgb=cv2.resize(rgba[:,:,:3],(sw,sh));state=np.zeros((sh,sw),np.uint8)
        x0,y0,x1,y1=[round(v*scale) for v in box];x0=max(1,x0);y0=max(1,y0);x1=min(sw-1,x1);y1=min(sh-1,y1)
        if x1-x0<3 or y1-y0<3:raise ValueError('对象范围过小')
        state[y0:y1,x0:x1]=cv2.GC_PR_FGD
        for pt,label in zip(points,labels):cv2.circle(state,(round(pt[0]*scale),round(pt[1]*scale)),3,cv2.GC_FGD if label else cv2.GC_BGD,-1)
        cv2.grabCut(rgb,state,None,np.zeros((1,65),np.float64),np.zeros((1,65),np.float64),4,cv2.GC_INIT_WITH_MASK)
        mask=cv2.resize(np.where((state==1)|(state==3),255,0).astype(np.uint8),(w,h),interpolation=cv2.INTER_NEAREST);score=None;cached=False
    else:raise ValueError('不支持的智能选区引擎')
    mask=np.minimum(mask,rgba[:,:,3])
    out=io.BytesIO();Image.fromarray(mask).save(out,format='PNG')
    return {'image':'data:image/png;base64,'+base64.b64encode(out.getvalue()).decode(),'width':w,'height':h,'engine':'MobileSAM' if engine=='sam' else 'OpenCV GrabCut','score':score,'embeddingCached':cached,'activePixels':int(np.count_nonzero(mask))}

for line in sys.stdin:
    request={};started=time.monotonic()
    try:
        if len(line)>64*1024*1024:raise ValueError('智能选区输入过大')
        request=json.loads(line)
        # Third-party import messages must never contaminate the JSON line protocol.
        from contextlib import redirect_stdout
        with redirect_stdout(sys.stderr):
            result=info() if request['op']=='info' else select(request.get('args',{})) if request['op']=='select' else None
        if result is None:raise ValueError('不支持的智能选区操作')
        response={'id':request.get('id'),'ok':True,'result':result,'error':None}
    except Exception as error:response={'id':request.get('id'),'ok':False,'result':None,'error':str(error)}
    response['elapsed_ms']=(time.monotonic()-started)*1000
    print(json.dumps(response,allow_nan=False),flush=True)
