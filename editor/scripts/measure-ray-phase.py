"""Measure phase advance from actual source/GPU contours, not shader clock values."""
import argparse
import hashlib
import json
import re
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def patterns(points,params):
    q=(points-[params["centerX"],params["centerY"]])*[1,params.get("yScale",1)]
    angle=(np.arctan2(q[:,1],q[:,0])-np.linalg.norm(q,axis=1)**params.get("radiusExponent",1)*params["twist"])*params["count"]
    phase=np.linspace(-np.pi,np.pi,721)[:-1]
    return phase,np.cos(phase[:,None]+angle)>0


def observed_phase(value,phase,pattern,low,high):
    light=value>high
    dark=value<low
    assert light.any() and dark.any()
    errors=.5*np.mean(~pattern[:,light],axis=1)+.5*np.mean(pattern[:,dark],axis=1)
    best=int(np.argmin(errors))
    return dict(phase=float(phase[best]),minimumContourLabelError=float(errors[best]))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input",type=Path)
    parser.add_argument("captures",type=Path)
    parser.add_argument("log",type=Path)
    parser.add_argument("planning",type=Path)
    parser.add_argument("--output",type=Path,required=True)
    a=parser.parse_args()
    data=json.loads(a.input.read_text())
    g=json.loads(a.planning.read_text())
    log=a.log.read_text()
    assert '"status":"passed"' in log and not re.search(r"^(?:SHADER ERROR|SCRIPT ERROR|ERROR):",log,re.M)
    source_path=Path(g["source"])
    assert hashlib.sha256(source_path.read_bytes()).hexdigest()==data["referenceSha256"]==g["sourceSha256"]
    source=Image.open(source_path)
    source.seek(g["frame"])
    rgb=np.asarray(source.convert("RGB"))
    h,w=rgb.shape[:2]
    ys,xs=np.mgrid[:h,:w]
    regions=np.zeros((h,w),np.uint8)
    cv2.fillPoly(regions,[np.asarray(poly,np.int32) for poly in g["regions"]],1)
    gate=g["colorGate"]
    selected=(regions>0)&((rgb.max(2)>gate["lightMinExclusive"])|(rgb.max(2)<gate["darkMaxExclusive"]))&(xs%3==0)&(ys%3==0)
    assert selected.sum()==g["observedPixels"]
    ox,oy=data["registration"]["origin"]
    width,height=data["registration"]["width"],data["registration"]["height"]
    points=np.column_stack([(xs[selected]-ox)/width,(ys[selected]-oy)/height*1.5])
    phase,pattern=patterns(points,g["candidate"])
    source_records=[]
    for i,frame in enumerate(data["frames"]):
        source.seek(i)
        rgb=np.asarray(source.convert("RGB"))
        source_records.append(dict(index=i,time=frame["time"],**observed_phase(rgb.max(2)[selected],phase,pattern,gate["darkMaxExclusive"],gate["lightMinExclusive"])))
    source_advance=np.unwrap([f["phase"] for f in source_records])/g["candidate"]["count"]
    source_advance-=source_advance[0]
    held=[i for i in range(77) if i not in g["trainingFrames"]]
    modes=[]
    for mode in data["modes"]:
        metadata=json.loads((a.captures/(mode["id"]+"-metadata.json")).read_text())
        assert metadata["shaderSha256"]==mode["shaderSha256"]==hashlib.sha256(mode["shader"].encode()).hexdigest()
        assert metadata["frames"]==77 and metadata["firstFrameNonempty"]
        params=mode["parameters"]
        phase,pattern=patterns(points,params)
        frames=[]
        for i,frame in enumerate(data["frames"]):
            file=a.captures/mode["id"]/f"{i:03d}.png"
            rgb=np.asarray(Image.open(file).convert("RGB"))
            assert rgb.shape==(height,width,3)
            value=rgb[ys[selected]-oy,xs[selected]-ox].max(1)
            frames.append(dict(index=i,time=frame["time"],**observed_phase(value,phase,pattern,77.5,77.5),pngSha256=hashlib.sha256(file.read_bytes()).hexdigest()))
        advance=np.unwrap([f["phase"] for f in frames])/params["count"]
        advance-=advance[0]
        errors=(advance-source_advance)*180/np.pi
        intervals=np.asarray(g["trainingFrames"])
        times=np.array([f["time"] for f in data["frames"]])
        source_velocity=np.diff(source_advance[intervals])/np.diff(times[intervals])*180/np.pi
        gpu_velocity=np.diff(advance[intervals])/np.diff(times[intervals])*180/np.pi
        modes.append(dict(id=mode["id"],shaderSha256=mode["shaderSha256"],phaseAdvanceRmsDegrees=float(np.sqrt(np.mean(errors**2))),heldOut70PhaseAdvanceRmsDegrees=float(np.sqrt(np.mean(errors[held]**2))),intervalVelocityRmsDegreesPerSecond=float(np.sqrt(np.mean((gpu_velocity-source_velocity)**2))),sourceIntervalVelocities=source_velocity.tolist(),gpuIntervalVelocities=gpu_velocity.tolist(),frames=[dict(**f,advanceDegrees=float(d*180/np.pi),advanceErrorDegrees=float(e)) for f,d,e in zip(frames,advance,errors)]))
    result=dict(schema="cardscape-rays-contour-phase/1",sourceSha256=g["sourceSha256"],actualGpuFrames=77*len(modes),plannedPixels=g["observedPixels"],sourceGeometry=g["candidate"],sourceFrames=[dict(**f,advanceDegrees=float(v*180/np.pi)) for f,v in zip(source_records,source_advance)],modes=modes,accepted1to1=False,caveats=["Phase advance removes each initial phase; geometry/color errors must be assessed separately.","Source phase is measured against the approximate fitted contour geometry, with source occlusion retained.","Public clip is not a verified full in-game loop or full SDK scene."])
    a.output.write_text(json.dumps(result,indent=2)+"\n")
    print(json.dumps({"actualGpuFrames":result["actualGpuFrames"],"modes":[{k:m[k] for k in ["id","phaseAdvanceRmsDegrees","heldOut70PhaseAdvanceRmsDegrees","intervalVelocityRmsDegreesPerSecond"]} for m in modes],"accepted1to1":False}))


if __name__=="__main__":main()
