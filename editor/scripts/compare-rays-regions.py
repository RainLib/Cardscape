"""Compare fixed exposed source regions with actual shared-function GPU frames."""
import argparse
import hashlib
import json
import re
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


def colors(rgb, gate=None):
    if gate:
        value=rgb.max(axis=2)
        return value>gate["lightMinExclusive"],value<gate["darkMaxExclusive"]
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(float)
    purple = (hsv[:, :, 0] > 125) & (hsv[:, :, 0] < 156) & (hsv[:, :, 1] > 105) & (hsv[:, :, 2] > 65) & (hsv[:, :, 2] < 246)
    dark = (hsv[:, :, 2] < 53) & ((hsv[:, :, 0] > 124) | (hsv[:, :, 2] < 22))
    return purple, dark


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("captures", type=Path)
    parser.add_argument("log", type=Path)
    parser.add_argument("prediction", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    data = json.loads(args.input.read_text())
    geometry = json.loads(args.prediction.read_text())
    gate=geometry.get("colorGate")
    rendered_threshold=(gate["lightMinExclusive"]+gate["darkMaxExclusive"])/2 if gate else 65
    log = args.log.read_text()
    assert data["schema"] == "cardscape-rays-gpu-input/1"
    assert '"status":"passed"' in log and not re.search(r"^(?:SHADER ERROR|SCRIPT ERROR|ERROR):", log, re.M)
    source_path = Path(geometry["source"])
    assert hashlib.sha256(source_path.read_bytes()).hexdigest() == data["referenceSha256"] == geometry["sourceSha256"]
    source = Image.open(source_path)
    source.seek(geometry["frame"])
    rgb = np.asarray(source.convert("RGB"))
    height, width = rgb.shape[:2]
    ys, xs = np.mgrid[:height, :width]
    regions = np.zeros((height, width), dtype=np.uint8)
    cv2.fillPoly(regions, [np.array(p, np.int32) for p in geometry["regions"]], 1)
    purple, dark = colors(rgb,gate)
    selected = (regions > 0) & (purple | dark) & (xs % 3 == 0) & (ys % 3 == 0)
    assert int(selected.sum()) == geometry["observedPixels"]
    ox, oy = data["registration"]["origin"]
    w, h = data["registration"]["width"], data["registration"]["height"]
    reference_frames, times, elapsed = [], [], 0
    for index in range(source.n_frames):
        source.seek(index)
        reference_frames.append(np.asarray(source.convert("RGB")))
        times.append(elapsed / 1000)
        elapsed += source.info.get("duration", 0)
    assert len(reference_frames) == len(data["frames"]) == 77
    modes = []
    for mode in data["modes"]:
        meta = json.loads((args.captures / (mode["id"] + "-metadata.json")).read_text())
        assert meta["shaderSha256"] == mode["shaderSha256"] == hashlib.sha256(mode["shader"].encode()).hexdigest()
        assert meta["frames"] == 77 and meta["firstFrameNonempty"] is True
        assert meta["registration"] == data["registration"] and meta["parameters"] == mode["parameters"]
        measurements = []
        previous_reference,previous_rendered,previous_valid=None,None,None
        for index, (reference, frame, time) in enumerate(zip(reference_frames, data["frames"], times)):
            assert abs(time-frame["time"]) < .00001
            filename = args.captures / mode["id"] / f"{index:03d}.png"
            rendered = np.asarray(Image.open(filename).convert("RGB"))
            assert rendered.shape == (h, w, 3)
            truth, dark = colors(reference,gate)
            valid = selected & (truth | dark)
            target = truth[valid]
            observed = rendered[ys[valid]-oy, xs[valid]-ox]
            predicted = np.max(observed, axis=1) > rendered_threshold
            balanced = .5*np.mean(predicted[target] != target[target])+.5*np.mean(predicted[~target] != target[~target])
            temporal_error=None
            if previous_reference is not None:
                shared_valid=valid&previous_valid
                gpu_delta=rendered[ys[shared_valid]-oy,xs[shared_valid]-ox].astype(float)-previous_rendered[ys[shared_valid]-oy,xs[shared_valid]-ox].astype(float)
                source_delta=reference[shared_valid].astype(float)-previous_reference[shared_valid].astype(float)
                temporal_error=float(np.abs(gpu_delta-source_delta).mean())
            measurements.append(dict(index=index, time=time, observedPixels=int(valid.sum()), balancedLabelError=float(balanced), meanAbsoluteRgbDifference=float(np.abs(observed.astype(float)-reference[valid]).mean()), meanAbsoluteTemporalRgbDifference=temporal_error, pngSha256=hashlib.sha256(filename.read_bytes()).hexdigest()))
            previous_reference,previous_rendered,previous_valid=reference,rendered,valid
        errors = [f["balancedLabelError"] for f in measurements]
        modes.append(dict(id=mode["id"], parameters=mode["parameters"], shaderSha256=mode["shaderSha256"], meanBalancedLabelError=float(np.mean(errors)), balancedLabelErrorP10P50P90=np.percentile(errors, [10, 50, 90]).tolist(), meanAbsoluteRgbDifference=float(np.mean([f["meanAbsoluteRgbDifference"] for f in measurements])), meanAbsoluteTemporalRgbDifference=float(np.mean([f["meanAbsoluteTemporalRgbDifference"] for f in measurements if f["meanAbsoluteTemporalRgbDifference"] is not None])), frames=measurements))
    result = dict(schema="cardscape-rays-regional-gpu-comparison/1", version=data["version"], renderer="Godot shared production finish function", source=str(source_path), sourceSha256=data["referenceSha256"], registration=data["registration"], sourceColorGate=gate,renderedLabelThreshold=rendered_threshold,regionCount=len(geometry["regions"]), plannedPixels=geometry["observedPixels"], actualGpuFrames=77*len(modes), accepted1to1=False, fullGameCycleVerified=False, runtimeSceneVerified=False, modes=modes, caveats=geometry["caveats"]+["Fixed spatial sample positions; per-frame source foreground contamination is excluded by the same source-only color gate.", f"The label metric observes bands above {rendered_threshold}/255 brightness, not per-pixel material fidelity.", "Shared-function GPU rendering does not verify the full exported SDK card scene."])
    args.output.write_text(json.dumps(result, indent=2)+"\n")
    board = Image.new("RGB", (900, 900), "#151922")
    draw = ImageDraw.Draw(board)
    for column, label in enumerate(["source aperture"] + [m["id"] for m in modes]):
        for row, index in enumerate([0, 26]):
            if column == 0:
                image = Image.fromarray(reference_frames[index]).crop((ox, oy, ox+w, oy+h))
            else:
                image = Image.open(args.captures / modes[column-1]["id"] / f"{index:03d}.png")
            board.paste(image.convert("RGB").resize((280, 400)), (column*300, row*450+22))
            draw.text((column*300, row*450+4), f'{label} {times[index]:.2f}s', fill="white")
    board.save(args.output.with_suffix(".png"))
    print(json.dumps({"actualGpuFrames": result["actualGpuFrames"], "accepted1to1": False, "modes": [{k: m[k] for k in ["id", "meanBalancedLabelError", "balancedLabelErrorP10P50P90", "meanAbsoluteRgbDifference","meanAbsoluteTemporalRgbDifference"]} for m in modes]}))


if __name__ == "__main__":
    main()
