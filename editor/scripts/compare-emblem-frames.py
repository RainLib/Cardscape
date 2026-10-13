"""Compare observed reference rims with real GPU QA captures by normalized size.

This reports detector statistics, not a 1:1 fidelity score. Actor backgrounds,
occlusion, card aspect ratio and glyph identities are not matched.
"""
import argparse
import base64
import importlib.util
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location("emblem_measure", Path(__file__).with_name("measure-emblem-motion.py"))
measure = importlib.util.module_from_spec(spec)
spec.loader.exec_module(measure)


def percentiles(values):
    return [float(v) for v in np.percentile(values, [10, 50, 90])] if len(values) else []


def describe(frames, card_width):
    radii = [p["radius"] / card_width for frame in frames for p in frame["detections"]]
    counts = [len(frame["detections"]) for frame in frames]
    return dict(radiusPerCardWidthP10P50P90=percentiles(radii),
                detectedCountP10P50P90=percentiles(counts),
                detectedCountCoefficientOfVariation=float(np.std(counts) / np.mean(counts)) if np.mean(counts) else 0)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference", type=Path)
    parser.add_argument("captures", type=Path)
    parser.add_argument("--reference-width", type=float, default=650)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    reference = json.loads(args.reference.read_text())
    capture = json.loads(args.captures.read_text())
    if capture.get("schema") != "cardscape-gpu-emblem-frames/1":
        raise ValueError("Expected the QA page's GPU capture download")
    frames = []
    for index, frame in enumerate(capture["frames"]):
        pixels = base64.b64decode(frame["png"].split(",", 1)[1], validate=True)
        image = Image.open(io.BytesIO(pixels))
        frames.append(dict(index=index, time=frame["time"], detections=measure.observe(image)))
    ref_summary = describe(reference["frames"], args.reference_width)
    summary = describe(frames, capture["registration"]["cardWidthPixels"])
    error = np.abs(np.asarray(summary["radiusPerCardWidthP10P50P90"]) - ref_summary["radiusPerCardWidthP10P50P90"])
    report = dict(schema="cardscape-emblem-size-comparison/1", version=capture["version"],
                  renderer=capture.get("renderer", "WebGL production particle shaders"),
                  growthProfile=capture.get("growthProfile"),
                  referenceInput=str(args.reference), capturesInput=str(args.captures),
                  accepted1to1=False, reference=ref_summary, production=summary,
                  absoluteRadiusQuantileError=error.tolist(),
                  meanAbsoluteRadiusQuantileError=float(error.mean()),
                  registration=capture["registration"], config=capture["config"],
                  caveats=["Normalized rim sizes only; not a per-pixel or identity-matched comparison.",
                           "Source card width is an approximate front-view registration, not a calibrated camera.",
                           "Different card proportions, background and overlaps can change which glyphs the detector retains.",
                           "Detected counts are incomplete observations, not particle system instance counts."], frames=frames)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: report[k] for k in ["version", "reference", "production", "meanAbsoluteRadiusQuantileError"]}))


if __name__ == "__main__":
    main()
