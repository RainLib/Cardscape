"""Fit two continuous film waves on seven fixed-source-frame bright ribbons."""
from pathlib import Path
import json
import cv2
import numpy as np
from PIL import Image
from scipy.optimize import differential_evolution


def main():
    root = Path("outputs/rays-v87")
    g = json.loads((root/"geometry-prediction.json").read_text())
    def labels(rgb):
        value=rgb.max(axis=2)
        return value>g["colorGate"]["lightMinExclusive"],value<g["colorGate"]["darkMaxExclusive"]
    im = Image.open(g["source"])
    im.seek(26)
    rgb = np.asarray(im.convert("RGB"))
    height,width = rgb.shape[:2]
    ys,xs = np.mgrid[:height,:width]
    regions = np.zeros((height,width),np.uint8)
    cv2.fillPoly(regions,[np.asarray(p,np.int32) for p in g["regions"]],1)
    light,dark = labels(rgb)
    selected = (regions>0)&(light|dark)&(xs%3==0)&(ys%3==0)
    assert selected.sum() == g["observedPixels"]
    points = np.column_stack([(xs[selected]-103)/632,(ys[selected]-151)/899*1.5])
    positions,targets = [],[]
    for i in g["trainingFrames"]:
        im.seek(i)
        rgb = np.asarray(im.convert("RGB"))
        light,_ = labels(rgb)
        valid = light[selected]
        positions.append(np.column_stack([points[valid],np.full(int(valid.sum()),i*.03*.35)]))
        targets.append(rgb[selected][valid]/255.)
    p = np.concatenate(positions)
    target = np.concatenate(targets)
    # Spatial cyan/pink wave plus a broad silver reflection; no frame lookup.
    def features(params):
        film = (p@params[:3])*np.pi*2
        silver = (p@params[3:])*np.pi*2
        return np.column_stack([np.ones(len(p)),np.cos(film),np.sin(film),np.cos(silver),np.sin(silver)])
    def fit(params):
        f = features(params)
        coefficients = np.linalg.lstsq(f,target,rcond=None)[0]
        return coefficients,np.clip(f@coefficients,0,1)
    def loss(params):
        coefficients,predicted = fit(params)
        # Mild bound penalty discourages relying on large canceling coefficients.
        return float(np.mean((target-predicted)**2)+.0001*np.maximum(np.abs(coefficients)-.8,0).sum())
    result = differential_evolution(loss,[(-5,5),(-5,5),(-2,2),(-1.5,1.5),(-1.5,1.5),(-1,1)],seed=287,maxiter=100,popsize=8,tol=.002,polish=True)
    params = [round(float(v),5) for v in result.x]
    coefficients,predicted = fit(params)
    coefficients = np.round(coefficients,5)
    vec = lambda v: "vec3("+",".join(f"{n:.5f}" for n in v)+")"
    film,silver = params[:3],params[3:]
    dot = lambda v: f"dot(p,vec2({v[0]:.5f},{v[1]:.5f}))+finish_time*{v[2]:.5f}"
    body = f"   float film=({dot(film)}-dot(eye,vec2(.80,.60)))*6.283185;\n   float satin=({dot(silver)}-dot(eye,vec2(.45,.75)))*6.283185;\n   ribbon=clamp({vec(coefficients[0])}+{vec(coefficients[1])}*cos(film)+{vec(coefficients[2])}*sin(film)+{vec(coefficients[3])}*cos(satin)+{vec(coefficients[4])}*sin(satin),0.,1.);"
    record = dict(predictionOnly=True,gpuVerified=False,trainingFrames=g["trainingFrames"],sourceSha256=g["sourceSha256"],sourceBrightSamples=len(p),filmCoefficients=film,silverCoefficients=silver,rgbCoefficients=coefficients.tolist(),meanAbsoluteRgbPredictionDifference=float(np.abs(target-predicted).mean()*255),shaderBody=body,accepted1to1=False,caveat="Continuous source-color prediction only; all source-defined bright samples retained, including translucent-wing contamination. GPU comparison required.")
    (root/"color-prediction.json").write_text(json.dumps(record,indent=2)+"\n")
    print(json.dumps(record))

if __name__ == "__main__":main()
