"""Compare real GPU banana glyphs with a measured official exterior component.

Center, major axis and length registration isolate surface and outline. This is
not an emitter, animation-period, full-card or all-angle fidelity acceptance.
"""
import argparse,base64,hashlib,json
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('directory',type=Path);args=parser.parse_args();root=args.directory
capture=json.loads((root/'webgl-captures.json').read_text());reference=json.loads((root/'bananas-reference-motion.json').read_text());assert capture['gpuError']==0 and len(capture['frames'])==69
source=Image.open(root/'official-customization.gif')
def mask(rgb):
 a=rgb.astype(float);return (a[:,:,0]>75)&(a[:,:,1]>50)&(a[:,:,1]>a[:,:,0]*.50)&(a[:,:,1]<a[:,:,0]*1.05)&(a[:,:,2]<a[:,:,0]*.52)
def geometry(m):
 points=np.column_stack(np.where(m)[::-1]);center=points.mean(0);values,vectors=np.linalg.eigh(np.cov(points.T));axis=vectors[:,-1];angle=(np.arctan2(axis[1],axis[0])+np.pi/2)%np.pi-np.pi/2;axis=np.array([np.cos(angle),np.sin(angle)]);extent=np.ptp(points@axis);return center,angle,extent
models={}
for name in ['baseline','current']:
 (root/f'banana-{name}.png').write_bytes(base64.b64decode(capture['glyph'][name].split(',')[1]));rgb=np.array(Image.open(root/f'banana-{name}.png').convert('RGB'));models[name]=(rgb,*geometry(mask(rgb)))
tracks=[t for t in reference['tracks'] if t['id'] in [3,7]];rows=[];board=Image.new('RGB',(900,350),'#15212c');draw=ImageDraw.Draw(board)
for track,point in [(tr,p) for tr in tracks for p in tr['samples']]:
 source.seek(point['frame']);rgb=np.array(source.convert('RGB'));components,labels,stats,cent=cv2.connectedComponentsWithStats(mask(rgb).astype('uint8'))
 label=min(range(1,components),key=lambda n:np.hypot(cent[n][0]-point['x'],cent[n][1]-point['y']));foreground=labels==label;center,angle,extent=geometry(foreground)
 xy=np.arange(-35,36,dtype='float32');x,y=np.meshgrid(xy,xy);tx=x+center[0];ty=y+center[1]
 observed=cv2.remap(rgb,tx,ty,cv2.INTER_LINEAR);target=cv2.remap(foreground.astype('uint8'),tx,ty,cv2.INTER_NEAREST).astype(bool)
 # Remove neighboring frame and card pixels, retaining the measured component.
 observed[~target]=[2,8,14];row={'track':track['id'],'frame':point['frame'],'registration':point,'modes':{}}
 if point['frame']==12:board.paste(Image.fromarray(observed).resize((300,300)),(0,40));draw.text((8,10),'Official frame 12 / measured component',fill='white')
 for index,(name,(model,mc,ma,me)) in enumerate(models.items(),1):
  rotation=angle-ma+(np.pi if track['id']==3 else 0);scale=extent/me;u=mc[0]+(x*np.cos(rotation)+y*np.sin(rotation))/scale;v=mc[1]+(-x*np.sin(rotation)+y*np.cos(rotation))/scale
  fitted=cv2.remap(model,u.astype('float32'),v.astype('float32'),cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT,borderValue=(2,8,14));pred=mask(fitted);f1=2*np.count_nonzero(pred&target)/max(1,np.count_nonzero(pred)+np.count_nonzero(target));error=np.abs(observed.astype(float)-fitted).mean(2)
  row['modes'][name]={'silhouetteF1':float(f1),'foregroundRGBMAE':float(error[target].mean()),'unionRGBMAE':float(error[pred|target].mean())}
  if point['frame']==12:board.paste(Image.fromarray(fitted).resize((300,300)),(index*300,40));draw.text((index*300+8,10),f'{name} F1 {f1:.3f} / MAE {error[target].mean():.2f}',fill='white')
 rows.append(row)
summary={}
for mode in models:
 calibration=next(r for r in rows if r['frame']==12)['modes'][mode];held=[r['modes'][mode] for r in rows if r['frame'] not in [6,12]];summary[mode]={'designFrame12':calibration,'designFrame6':next(r for r in rows if r['frame']==6)['modes'][mode],'holdoutMeans':{k:float(np.mean([r[k] for r in held])) for k in calibration}}
report={'schema':'cardscape-banana-crop-comparison/1','version':capture['version'],'metrics':summary,'designFrames':[6,12],'poseMatchedFrames':len(rows),'frames':rows,'sourceSha256':reference['sha256'],'captureSha256':hashlib.sha256((root/'webgl-captures.json').read_bytes()).hexdigest(),'actualGPU':True,'accepted1to1':False,'caveats':['Two six-frame exterior tracks, not independent game recordings. Design inspected frames 6 and 12; other ten frames were not used for surface changes.','Pose and length matching isolate glyph shape and surface, not full emitter fidelity.','Threshold segmentation omits dim edge pixels; masked neighbors do not establish card occlusion.','Complete lifecycle and all-angle comparisons remain missing.']}
(root/'banana-comparison.json').write_text(json.dumps(report,indent=2)+'\n');board.save(root/'banana-comparison.png');print(json.dumps(summary,indent=2))
