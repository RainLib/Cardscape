"""Compare fade widths using source mixing estimates and actual GPU pixels.

All source tracks and GPU particle cycles remain in the report, including why
an envelope cannot be measured. CPU Alpha is never used as the observation.
"""
import argparse
import base64
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image


def crossing(frames, value):
    for a, b in zip(frames, frames[1:]):
        va, vb = a["alphaEstimate"], b["alphaEstimate"]
        if va >= value >= vb and vb != va:
            return a["time"]+(value-va)*(b["time"]-a["time"])/(vb-va)
    return None


def describe(tracks):
    widths, details = [], []
    for track in tracks:
        frames = track["frames"]
        peaks = [i for i, f in enumerate(frames) if f["alphaEstimate"] is not None and f["alphaEstimate"] >= .95]
        status, width = "no opaque estimate", None
        if peaks:
            falling = []
            for f in frames[peaks[-1]:]:
                if f["alphaEstimate"] is None:
                    break
                falling.append(f)
            if len(falling) < 3:
                status = "too few falling observations"
            elif any(b["alphaEstimate"]-a["alphaEstimate"] > .10 for a, b in zip(falling, falling[1:])):
                status = "overlap or non-monotonic estimate"
            else:
                first, last = crossing(falling, .90), crossing(falling, .30)
                if first is None or last is None:
                    status = "threshold crossing not observed"
                else:
                    width = last-first
                    status = "measured"
                    widths.append(width)
        details.append(dict(id=track["id"], status=status, fadeWidth90To30=width, frames=frames))
    return dict(measuredEnvelopes=len(widths),
                fadeWidth90To30Seconds=[float(v) for v in np.percentile(widths, [10, 50, 90])] if widths else [], tracks=details)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_envelope", type=Path)
    parser.add_argument("gpu", type=Path)
    parser.add_argument("samples", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source = json.loads(args.source_envelope.read_text())
    capture = json.loads(args.gpu.read_text())
    sample = json.loads(args.samples.read_text())
    assert capture["schema"] == "cardscape-gpu-emblem-frames/1"
    assert sample["schema"] == "cardscape-emblem-qa-samples/1"
    assert len(capture["frames"]) == len(sample["frames"]) == source["frameCount"] == 77
    assert capture["growthProfile"] == sample["growthProfile"]
    assert capture["version"] == sample["version"]
    profile = sample["growthProfile"] or {}
    seed = sample["config"]["seed"]
    h = lambda i: float((np.sin((i+1)*127.1+seed*311.7)*43758.5453) % 1)
    life = lambda i: profile.get("nominalLife", sample["config"]["lifetime"])*(1-profile.get("lifeJitter", 0)+2*profile.get("lifeJitter", 0)*h(i+467))
    tracks = {}
    for frame, sampled in zip(capture["frames"], sample["frames"]):
        assert frame["time"] == sampled["time"]
        pixels = np.asarray(Image.open(io.BytesIO(base64.b64decode(frame["png"].split(",", 1)[1]))).convert("RGB"), dtype=float)
        height, width = pixels.shape[:2]
        registration = capture["registration"]
        color = np.array([int(sample["config"]["color"][j:j+2], 16) for j in [1, 3, 5]], dtype=float)
        # The QA viewport has a uniform clear color, unlike the source card.
        background = np.array([5., 6., 10.])
        axis = color-background
        for index in range(sampled["count"]):
            if index % 5 >= 2:
                continue
            values = sampled["packed"][index*60:index*60+7]
            x, y, z, size, _, _, birth_seed = values
            root_scale = registration["rootScale"]
            projection = height*1.45*min(1., width/height/.85)/(registration["cameraDistance"]-z*root_scale)
            cx = width*.5+x*root_scale*projection
            cy = height*.5-(y*root_scale+registration["rootY"])*projection+size*root_scale*projection*.015
            radius = size*root_scale*projection*.665
            x0, y0 = np.floor([cx-radius, cy-radius]).astype(int)
            x1, y1 = np.ceil([cx+radius, cy+radius]).astype(int)
            x0, x1 = max(0, x0), min(width, x1)
            y0, y1 = max(0, y0), min(height, y1)
            estimate, count = None, 0
            if x0 < x1 and y0 < y1:
                current = pixels[y0:y1, x0:x1]
                alpha = np.sum((current-background)*axis, axis=2)/np.sum(axis*axis)
                residual = np.linalg.norm(current-(background+alpha[..., None]*axis), axis=2)
                ys, xs = np.mgrid[y0:y1, x0:x1]
                valid = ((xs-cx)**2+(ys-cy)**2 < (radius*.90)**2) & (residual < 8.) & (alpha > .04) & (alpha <= 1.08)
                count = int(valid.sum())
                if count >= max(15, radius**2*.03):
                    estimate = float(np.percentile(alpha[valid], 75))
            cycle = int(np.floor(frame["time"]/life(index)+birth_seed))
            key = f'{index}-{cycle}'
            tracks.setdefault(key, dict(id=key, frames=[]))["frames"].append(dict(time=frame["time"], alphaEstimate=estimate, matchedYellowPixels=count, predictedCenter=[cx, cy], predictedRadius=radius))
    reference = describe(source["tracks"])
    production = describe(list(tracks.values()))
    ref_quantiles, cur_quantiles = reference["fadeWidth90To30Seconds"], production["fadeWidth90To30Seconds"]
    error = float(np.mean(np.abs(np.array(ref_quantiles)-cur_quantiles))) if ref_quantiles and cur_quantiles else None
    result = dict(schema="cardscape-emblem-envelope-comparison/1", sourceInput=str(args.source_envelope),
                  capturesInput=str(args.gpu), samplesInput=str(args.samples), renderer=capture["renderer"],
                  profile=sample["growthProfile"], version=sample["version"], accepted1to1=False,
                  source=reference, production=production, meanAbsoluteFadeWidthQuantileError=error,
                  caveats=source["caveats"]+["Presentation samples are 30 ms apart; threshold crossings are interpolated.",
                        "All tracks and rejection reasons are retained; overlapping colors may inflate the mixing estimate.",
                        "This measures a fade segment, not particle lifetime or complete game cycles."])
    args.output.write_text(json.dumps(result, indent=2)+"\n")
    print(json.dumps({"profile": result["profile"], "source": {k: v for k, v in reference.items() if k != "tracks"}, "production": {k: v for k, v in production.items() if k != "tracks"}, "meanAbsoluteFadeWidthQuantileError": error}))


if __name__ == "__main__":
    main()
