"""Compare measured WebGL frames using one registration and a shared visible-pixel mask."""
from pathlib import Path
from PIL import Image, ImageDraw
import base64,io,json,sys
import numpy as np
root=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[1]/'outputs/stickers-v65'
registration={'origin':[70,124],'width':690,'scale':690/1024}
def load(name):
 d=json.loads((root/name).read_text())
 for f in d['frames']:f['image']=Image.open(io.BytesIO(base64.b64decode(f['png'].split(',')[1]))).convert('RGBA')
 return d
def registered(d,f):
 s=registration['scale'];im=f['image'];r=Image.new('RGBA',(820,1100));r.paste(im.resize((round(im.width*s),round(im.height*s)),Image.Resampling.LANCZOS),tuple(round(x-d['margin']*s) for x in registration['origin']));return r
def visible(im):
 a=np.asarray(im).astype(float);return a[:,:,:3]*a[:,:,3:]/255
before,after=load('before-gpu-frames.json'),load('gpu-frames.json');samples=[];railSamples=[]
numbers=[0,12,24,36,48,60,74];times=[0,.33,.69,1.05,1.41,1.77,2.19]
timingFile=root/'reference-frame-times.json'
if timingFile.exists():
 timeline=json.loads(timingFile.read_text());records=timeline['frames'] if isinstance(timeline,dict) else timeline
 times=[next(f.get('time',f.get('timeMs',0)/1000) for f in records if f['frame']==n) for n in numbers]
yellow=lambda v:(v[:,:,1]>100)&(v[:,:,0]>.7*v[:,:,1])&(v[:,:,2]<v[:,:,1]*.35)
def coverage(candidate,target):
 hit=int((candidate&target).sum());union=int((candidate|target).sum())
 return {'candidatePixels':int(candidate.sum()),'intersectionPixels':hit,'unionPixels':union,'missingPixels':int((target&~candidate).sum()),'extraPixels':int((candidate&~target).sum()),'iou':round(hit/union,6) if union else None}
for number,time in zip(numbers,times):
 ref=Image.open(root/f'reference-{number}.png').convert('RGBA')
 b=registered(before,next(f for f in before['frames'] if f['time']==time and f['yaw']==0 and f['pitch']==0 and f['speed']>0));a=registered(after,next(f for f in after['frames'] if f['time']==time and f['yaw']==0 and f['pitch']==0 and f['speed']>0))
 railBox=(70,510,91,570);rr=visible(ref.crop(railBox));rb=visible(b.crop(railBox));ra=visible(a.crop(railBox))
 railSamples.append({'time':time,'region':railBox,'beforeRGBError':round(float(np.abs(rr-rb).mean()),3),'afterRGBError':round(float(np.abs(rr-ra).mean()),3)})
 # This window follows the measured moon's ~65px/s translation, not fitted frame poses.
 box=(27,round(210+time*65),73,round(360+time*65));r=visible(ref.crop(box));bv,av=visible(b.crop(box)),visible(a.crop(box));mask=(r[:,:,1]>100)&(r[:,:,0]>.7*r[:,:,1])&(r[:,:,2]<r[:,:,1]*.35)&(np.asarray(b.crop(box))[:,:,3]>240)&(np.asarray(a.crop(box))[:,:,3]>240)
 target=yellow(r)
 samples.append({'referencePixels':int(target.sum()),'referenceMaskBeforeRGBError':round(float(np.abs(r-bv)[target].mean()),3),'referenceMaskAfterRGBError':round(float(np.abs(r-av)[target].mean()),3),'time':time,'region':box,'commonPixels':int(mask.sum()),'beforeMeanRGBError':round(float(np.abs(r-bv)[mask].mean()),3) if mask.any() else None,'afterMeanRGBError':round(float(np.abs(r-av)[mask].mean()),3) if mask.any() else None,'beforeBrightCoverage':coverage(yellow(bv),target),'afterBrightCoverage':coverage(yellow(av),target)})
frames=after['frames'];m=after['margin'];limitCounts=[];centers=[]
for f in frames:
 a=np.asarray(f['image']);limit=a[:,:,3].copy();limit[m-144:m+1536+144,m-144:m+1024+144]=0;limitCounts.append(int(np.count_nonzero(limit)));centers.append(int(np.count_nonzero(a[m+200:m+1336,m+150:m+874,3])))
changed=lambda a,b:int(np.any(abs(visible(a)-visible(b))>.5,axis=2).sum())
motion={'timeChangedVisiblePixels':changed(frames[0]['image'],frames[2]['image']),'viewChangedVisiblePixels':changed(frames[2]['image'],frames[7]['image']),'zeroSpeedDifferentPixels':int(np.any(np.asarray(frames[-2]['image'])!=np.asarray(frames[-1]['image']),axis=2).sum()),'centerVisiblePixels':centers,'outside144Pixels':limitCounts}
sheet=Image.new('RGB',(990,810),'#141a21');draw=ImageDraw.Draw(sheet)
for n,(num,t) in enumerate([(numbers[i],times[i]) for i in [0,2,6]]):
 ref=Image.open(root/f'reference-{num}.png').convert('RGBA')
 b=registered(before,next(f for f in before['frames'] if f['time']==t and f['yaw']==0 and f['pitch']==0));a=registered(after,next(f for f in frames if f['time']==t and f['yaw']==0 and f['pitch']==0))
 for j,(name,im) in enumerate([('reference',ref),('before',b),('after',a)]):
  crop=im.crop((10,240,82,920)).resize((102,760));sheet.paste(crop,(n*330+j*110,30),crop);draw.text((n*330+j*110,6),f'{name} {t}',fill='white')
sheet.save(root/'reference-before-after-left.png')
valid=[s for s in samples if s['commonPixels']];weight=sum(s['commonPixels'] for s in valid);means={name:round(sum(s[name]*s['commonPixels'] for s in valid)/weight,3) for name in ['beforeMeanRGBError','afterMeanRGBError']}
total=sum(s['referencePixels'] for s in samples);referenceMeans={name:round(sum(s[name]*s['referencePixels'] for s in samples)/total,3) for name in ['referenceMaskBeforeRGBError','referenceMaskAfterRGBError']}
pooledCoverage={}
for version in ['beforeBrightCoverage','afterBrightCoverage']:
 pooledCoverage[version]={key:sum(s[version][key] for s in samples) for key in ['candidatePixels','intersectionPixels','unionPixels','missingPixels','extraPixels']}
 pooledCoverage[version]['iou']=round(pooledCoverage[version]['intersectionPixels']/pooledCoverage[version]['unionPixels'],6)
railMeans={key:round(sum(s[key] for s in railSamples)/len(railSamples),3) for key in ['beforeRGBError','afterRGBError']}
report={'schema':'cardscape-sticker-region-comparison/2','accepted1to1':False,'registration':registration,'samples':samples,'railSamples':railSamples,'railMeanErrors':railMeans,'weightedCommonMeanErrors':means,'weightedReferenceMeanErrors':referenceMeans,'pooledBrightCoverage':pooledCoverage,'motion':motion,'glErrors':[f['glError'] for f in frames],'limits':['Reference-mask scores include missing candidate coverage as error; common-mask scores cover only shared opaque pixels. Neither is a full-frame fidelity metric.','Bright-mask IoU penalizes missing and extra yellow pixels using the same fixed color threshold; it is a local segmented ROI metric, not silhouette or material acceptance.','The fixed rail ROI uses all its RGB pixels; it does not isolate reference grain or foreground occluders and is not a full-rim metric.','Top species/lifetime/trajectory, exact sprite silhouettes, metallic normals and full game loop remain unverified.','Reference export crops the outer effects; no artificial reference-edge cutoff was added to the implementation.','Both versions use one fixed registration. No per-frame pose or color remapping.']}
(root/'region-comparison.json').write_text(json.dumps(report,indent=2));print(json.dumps({'referenceMeans':referenceMeans,'commonMeans':means,'brightCoverage':pooledCoverage,'railMeans':railMeans,'motion':motion,'glErrors':report['glErrors']}))
