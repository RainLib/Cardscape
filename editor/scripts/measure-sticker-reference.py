"""Inspect actual GPU captures against one fixed reference registration; not 1:1 acceptance."""
from pathlib import Path
from PIL import Image, ImageDraw
import base64,io,json
import numpy as np
root=Path(__file__).resolve().parents[1] / 'outputs/stickers-v64'
d=json.loads((root/'iteration-1-gpu-frames.json').read_text())
frames=d['frames']
for f in frames:f['image']=Image.open(io.BytesIO(base64.b64decode(f['png'].split(',')[1]))).convert('RGBA')
m=d['margin'];scale=690/1024
sheet=Image.new('RGB',(660,810),'#141a21');draw=ImageDraw.Draw(sheet)
for n,(frame,time) in enumerate([(0,0),(24,.69),(74,2.19)]):
    ref=Image.open(root/f'reference-{frame}.png').convert('RGBA')
    curr=next(f for f in frames if f['time']==time and f['yaw']==0 and f['pitch']==0)['image']
    reg=Image.new('RGBA',(820,1100));reg.paste(curr.resize((round(curr.width*scale),round(curr.height*scale)),Image.Resampling.LANCZOS),(round(70-m*scale),round(124-m*scale)))
    for j,(label,im) in enumerate([('reference',ref),('current',reg)]):
        crop=im.crop((10,240,82,920)).resize((102,760));sheet.paste(crop,(n*220+j*110,30),crop)
        draw.text((n*220+j*110,6),f'{label} {time}',fill='white')
sheet.save(root/'reference-current-left.png')
a=np.asarray(frames[0]['image']);b=np.asarray(frames[2]['image']);c=np.asarray(frames[7]['image'])
limit=a[:,:,3].copy();limit[m-144:m+1536+144,m-144:m+1024+144]=0
inside=a[m+200:m+1336,m+150:m+874,3]
visible=lambda im:np.asarray(im).astype(float)[:,:,:3]*np.asarray(im).astype(float)[:,:,3:]/255
report={'schema':'cardscape-sticker-motion-inspection/1','accepted1to1':False,'margin':m,'registration':{'origin':[70,124],'width':690,'scale':scale},'motion':{'rawRGBAChangedPixelsAt0And069':int(np.any(a!=b,axis=2).sum()),'motionChangedVisiblePixels':int(np.any(abs(visible(frames[0]['image'])-visible(frames[2]['image']))>.5,axis=2).sum()),'zeroSpeedDifferentPixels':int(np.any(np.asarray(frames[-2]['image'])!=np.asarray(frames[-1]['image']),axis=2).sum()),'viewChangedVisiblePixels':int(np.any(abs(visible(frames[0]['image'])-visible(frames[7]['image']))>.5,axis=2).sum()),'centerVisiblePixels':int(np.count_nonzero(inside)),'outside144PixelBand':int(np.count_nonzero(limit))},'glErrors':[f['glError'] for f in frames],'limitations':['Top icon positions and species order differ from reference.','Current glyph hue and glow need calibration.','Reference card movement and full-game cycle are not isolated.','This is motion/bounds inspection, not 1:1 acceptance.']}
(root/'motion-inspection.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
