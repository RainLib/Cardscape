"""Plan a bounded, continuously differentiable rotation from source contours."""
from pathlib import Path
import json
import cv2
import numpy as np
from PIL import Image
from scipy.optimize import differential_evolution


def main():
    root=Path("outputs/rays-v87")
    g=json.loads((root/"geometry-prediction.json").read_text())
    im=Image.open(g["source"])
    im.seek(26)
    rgb=np.asarray(im.convert("RGB"))
    h,w=rgb.shape[:2]
    ys,xs=np.mgrid[:h,:w]
    regions=np.zeros((h,w),np.uint8)
    cv2.fillPoly(regions,[np.asarray(poly,np.int32) for poly in g["regions"]],1)
    selected=(regions>0)&((rgb.max(2)>100)|(rgb.max(2)<55))&(xs%3==0)&(ys%3==0)
    assert selected.sum()==g["observedPixels"]
    points=np.column_stack([(xs[selected]-103)/632,(ys[selected]-151)/899*1.5])
    p=g["candidate"]
    q=(points-[p["centerX"],p["centerY"]])*[1,p["yScale"]]
    angle=(np.arctan2(q[:,1],q[:,0])-np.linalg.norm(q,axis=1)**p["radiusExponent"]*p["twist"])*p["count"]
    phases=np.linspace(-np.pi,np.pi,721)[:-1]
    patterns=np.cos(phases[:,None]+angle)>0
    records=[]
    for i in g["trainingFrames"]:
        im.seek(i)
        value=np.asarray(im.convert("RGB")).max(2)[selected]
        light=value>100
        dark=value<55
        errors=.5*np.mean(~patterns[:,light],axis=1)+.5*np.mean(patterns[:,dark],axis=1)
        k=np.argmin(errors)
        records.append(dict(index=i,time=i*.03,phase=float(phases[k]),minimumSourceLabelError=float(errors[k])))
    t=np.array([f["time"] for f in records])
    y=np.unwrap([f["phase"] for f in records])
    # Constant angular advance plus bounded sinusoidal easing. No polynomial drift.
    def prediction(p):
        offset,rate,amplitude,frequency,start=p
        return offset+rate*t+amplitude*np.sin(frequency*t+start)
    def loss(p):return float(np.mean((prediction(p)-y)**2))
    fit=differential_evolution(loss,[(-3.5,3.5),(2.,4.5),(-1.5,1.5),(.4,2.5),(-np.pi,np.pi)],seed=487,maxiter=300,popsize=10,tol=.00001,polish=True)
    v=[round(float(n),5) for n in fit.x]
    linear=p["phase"]+p["phaseRate"]*t
    result=dict(predictionOnly=True,gpuVerified=False,sourceSha256=g["sourceSha256"],geometry=p,trainingFrames=g["trainingFrames"],observations=[dict(**f,unwrappedPhase=float(a),predictedPhase=float(b)) for f,a,b in zip(records,y,prediction(v))],candidate=dict(zip(["offset","rate","amplitude","frequency","start"],v)),linearPhaseRms=float(np.sqrt(np.mean((linear-y)**2))),candidatePhaseRms=float(np.sqrt(loss(v))),accepted1to1=False,caveat="Seven source contour phases, approximate aperture and contamination retained. Bounded math beyond the observed clip, not a recovered full game loop. GPU verification required.")
    (root/"eased-phase-prediction.json").write_text(json.dumps(result,indent=2)+"\n")
    print(json.dumps(result))

if __name__=="__main__":main()
