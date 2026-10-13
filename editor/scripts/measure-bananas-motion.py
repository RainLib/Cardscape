"""Measure exterior bananas in the official GIF; never import reference pixels into runtime assets."""
import argparse
from pathlib import Path
import json, hashlib
import numpy as np, cv2
from PIL import Image,ImageDraw
from scipy.optimize import linear_sum_assignment
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source',type=Path);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
src=args.source;root=args.output;root.mkdir(parents=True,exist_ok=True)
im=Image.open(src); frames=[];tracks=[];active=[];ms=0
for fi in range(im.n_frames):
 im.seek(fi); a=np.array(im.convert('RGB')).astype(float);y,x=np.mgrid[:im.height,:im.width]
 roi=(x<102)|(x>323)|((y>355)&(x>125)&(x<295))
 mask=((a[:,:,0]>75)&(a[:,:,1]>50)&(a[:,:,1]>a[:,:,0]*.50)&(a[:,:,1]<a[:,:,0]*1.05)&(a[:,:,2]<a[:,:,0]*.52)).astype('uint8')*255
 n,l,stats,cent=cv2.connectedComponentsWithStats(mask);dets=[]
 for i in range(1,n):
  xx,yy,w,h,area=stats[i]
  if area<60 or area>1000 or max(w,h)<12 or max(w,h)>58 or min(w,h)<5 or not roi[round(cent[i][1]),round(cent[i][0])]:continue
  pts=np.column_stack(np.where(l==i)[::-1]);vals,vectors=np.linalg.eigh(np.cov(pts.T)); vec=vectors[:,-1];angle=np.arctan2(vec[1],vec[0]); angle=(angle+np.pi/2)%np.pi-np.pi/2
  dets.append(dict(x=float(cent[i][0]),y=float(cent[i][1]),w=int(w),h=int(h),area=int(area),angle=float(angle),length=float(max(w,h)),box=[int(xx),int(yy),int(w),int(h)]))
 matched=set();new=[]
 if active and dets:
  cost=np.full((len(active),len(dets)),1e6)
  for i,tr in enumerate(active):
   p=tr['samples'][-1]
   for j,d in enumerate(dets):
    distance=np.hypot(p['x']-d['x'],p['y']-d['y'])
    if distance<14 and abs(np.log(d['area']/p['area']))<1.0:cost[i,j]=distance+3*abs(np.log(d['area']/p['area']))
  rows,cols=linear_sum_assignment(cost)
  for i,j in zip(rows,cols):
   if cost[i,j]<1e6:active[i]['samples'].append(dict(frame=fi,time=ms/1000,**dets[j]));new.append(active[i]);matched.add(j)
 for j,d in enumerate(dets):
  if j not in matched:
   tr=dict(id=len(tracks),samples=[dict(frame=fi,time=ms/1000,**d)]);tracks.append(tr);new.append(tr)
 active=new;frames.append(dict(frame=fi,time=ms/1000,detections=dets));ms+=im.info.get('duration',0)
retained=[tr for tr in tracks if len(tr['samples'])>=5]
for tr in retained:
 p=tr['samples'];t=np.array([a['time'] for a in p]);xy=np.array([[a['x'],a['y']] for a in p]);spin=np.unwrap(np.array([a['angle'] for a in p])*2)/2
 fit=np.column_stack([t,np.ones(len(t))]);v=np.linalg.lstsq(fit,xy,rcond=None)[0];av=np.linalg.lstsq(fit,spin,rcond=None)[0];tr['velocityPixelsPerSecond']=v[0].tolist();tr['angularRadiansPerSecond']=float(av[0]);tr['positionRMSE']=float(np.sqrt(np.mean((xy-fit@v)**2)));tr['angleRMSE']=float(np.sqrt(np.mean((spin-fit@av)**2)))
all_retained=retained
retained=[tr for tr in retained if tr['positionRMSE']<=1.5 and tr['angleRMSE']<=.20]
for tr in all_retained:tr['usedForMotionCalibration']=tr in retained
summary=dict(tracks=len(retained),visibleDetectionCountP10P50P90=np.percentile([len(a['detections']) for a in frames],[10,50,90]).tolist(),speedCardWidthsPerSecond=[float(np.linalg.norm(tr['velocityPixelsPerSecond'])/192) for tr in retained],angularRadiansPerSecond=[tr['angularRadiansPerSecond'] for tr in retained])
summary['speedCardWidthsPerSecondP10P50P90']=np.percentile(summary['speedCardWidthsPerSecond'],[10,50,90]).tolist()
summary['absoluteAngularRadiansPerSecondP10P50P90']=np.percentile(np.abs(summary['angularRadiansPerSecond']),[10,50,90]).tolist()
report=dict(schema='cardscape-official-bananas-clip/1',sha256=hashlib.sha256(src.read_bytes()).hexdigest(),frames=frames,tracks=all_retained,summary=summary,cardWidthPixels=192,cardWidthTolerance=5,clipMilliseconds=ms,accepted1to1=False,caveats=['Only full color components whose centroids are exterior are retained; components connected to frame/art are rejected by size.','PCA angle has 180-degree ambiguity; rotations are unwrapped only inside each retained track.','Camera rotates during the clip; screen speeds do not directly establish local card motion.','Short promotional clip does not identify full lifetimes or in-game loop.'])
(root/'bananas-reference-motion.json').write_text(json.dumps(report,indent=2)+'\n')
board=Image.new('RGB',(4*413,3*432));draw=ImageDraw.Draw(board)
for n,fi in enumerate(np.linspace(0,im.n_frames-1,12,dtype=int)):
 im.seek(int(fi));piece=im.convert('RGB');d=ImageDraw.Draw(piece)
 for pt in frames[fi]['detections']:
  xx,yy,w,h=pt['box'];d.rectangle((xx,yy,xx+w,yy+h),outline='cyan');d.text((xx,yy-10),str(pt['area']),fill='white')
 ox=(n%4)*413;oy=(n//4)*432;board.paste(piece,(ox,oy));draw.text((ox+3,oy+3),str(fi),fill='white')
board.save(root/'bananas-detections.png');print(json.dumps(summary,indent=2))
