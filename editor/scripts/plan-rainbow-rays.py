"""Plan spiral geometry from fixed source regions, never substitute for GPU QA."""
from pathlib import Path
import hashlib
import json
import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.optimize import differential_evolution

ROOT = Path("outputs/rays-v87")
SOURCE = Path("outputs/snap-reference-2026-10-11/RaysRainbow-motion.webp")
REGIONS = [[(235,160),(425,160),(422,284),(265,284)],[(590,285),(718,285),(718,360),(632,396)],[(704,420),(733,420),(733,820),(701,775)],[(112,510),(200,575),(215,734),(112,811)],[(113,813),(168,813),(134,874),(113,889)]]
REGISTRATION = dict(origin=[103,151],width=632,height=899)
TRAIN = [0,13,26,39,52,65,76]

def labels(rgb):
    value = rgb.max(axis=2)
    return value > 100, value < 55

def main():
    im = Image.open(SOURCE)
    assert im.size == (820,1100) and im.n_frames == 77
    im.seek(26)
    rgb = np.asarray(im.convert("RGB"))
    height,width = rgb.shape[:2]
    ys,xs = np.mgrid[:height,:width]
    region = np.zeros((height,width),np.uint8)
    cv2.fillPoly(region,[np.asarray(p,np.int32) for p in REGIONS],1)
    light,dark = labels(rgb)
    reference_light = light.copy()
    selected = (region>0)&(light|dark)&(xs%3==0)&(ys%3==0)
    points = np.column_stack([(xs[selected]-103)/632,(ys[selected]-151)/899*1.5])
    frames,times,elapsed = [],[],0
    for i in range(im.n_frames):
        im.seek(i)
        frames.append(np.asarray(im.convert("RGB")))
        times.append(elapsed/1000)
        elapsed += im.info.get("duration",0)
    assert elapsed == 2310
    datasets = []
    for i in TRAIN:
        light,dark = labels(frames[i])
        valid = (light|dark)[selected]
        datasets.append((times[i],points[valid],light[selected][valid]))
    def loss(params):
        cx,cy,twist,count,phase,rate,aspect,exponent = params
        errors = []
        for t,p,target in datasets:
            q = (p-[cx,cy])*[1,aspect]
            angle = (np.arctan2(q[:,1],q[:,0])-np.linalg.norm(q,axis=1)**exponent*twist)*round(count)+phase+t*rate
            predicted = np.cos(angle)>0
            errors.append(.5*np.mean(~predicted[target])+.5*np.mean(predicted[~target]))
        return float(np.mean(errors))
    old = [.35,.9,1.1,32,0,0,1,1]
    purple = [.54045,.77825,.71275,31,-.95193,2.57032,1,1]
    first = json.loads((ROOT/"geometry-stage-1.json").read_text())["candidate"]
    initial = [first[k] for k in ["centerX","centerY","twist","count","phase","phaseRate"]]+[1,1]
    fit = differential_evolution(loss,[(.46,.62),(.69,.9),(.4,1.4),(28,35),(-np.pi,np.pi),(1.8,4.5),(.7,1.4),(.6,1.8)],seed=387,maxiter=220,popsize=12,tol=.0005,polish=False,x0=initial)
    p = fit.x.tolist()
    p[3] = round(p[3])
    p = [round(v,5) for v in p]
    keys=["centerX","centerY","twist","count","phase","phaseRate","yScale","radiusExponent"]
    result = dict(schema="cardscape-ray-planning/1",predictionOnly=True,gpuVerified=False,source=str(SOURCE),sourceSha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),frame=26,registration=REGISTRATION,regions=REGIONS,observedPixels=int(selected.sum()),trainingFrames=TRAIN,colorGate=dict(lightMinExclusive=100,darkMaxExclusive=55),baseline=dict(zip(keys,old)),candidate=dict(zip(keys,p)),baselinePredictionError=loss(old),purplePredictionError=loss(purple),candidatePredictionError=loss(p),accepted1to1=False,caveats=["Only fixed exposed regions; no recovered source camera.","Translucent wings and dark clothing can contaminate samples.","Color gate excludes midtones by source pixels only, without seeing candidate pixels.","Seven training frames require all 77 actual GPU frames for verification.","Elliptical registration and radial curvature are approximations, not recovered engine parameters."])
    ROOT.mkdir(exist_ok=True)
    (ROOT/"geometry-prediction.json").write_text(json.dumps(result,indent=2)+"\n")
    board = Image.fromarray(rgb)
    draw = ImageDraw.Draw(board)
    for poly in REGIONS: draw.line(poly+[poly[0]],fill="#7fffd4",width=2)
    for x,y,b in zip(xs[selected],ys[selected],reference_light[selected]):draw.point((int(x),int(y)),fill="#ffabec" if b else "#37c7e1")
    board.save(ROOT/"source-geometry-samples.png")
    print(json.dumps(result))

if __name__ == "__main__":main()
