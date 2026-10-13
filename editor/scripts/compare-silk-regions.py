"""QA-only local silhouette comparison; not whole-scene or motion acceptance."""
import argparse
import base64
import io
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

parser = argparse.ArgumentParser()
parser.add_argument("reference")
parser.add_argument("capture")
parser.add_argument("--output", required=True)
args = parser.parse_args()
capture = json.loads(Path(args.capture).read_text())
reference = np.asarray(Image.open(args.reference).convert("RGB"))
regions = {"left_junction": (113, 545, 160, 620), "right_junction": (665, 392, 736, 510)}
background_regions = {"dark_upper_left": (305, 108, 367, 163),
                      "silver_upper_right": (603, 130, 662, 240),
                      "dark_lower_right": (698, 720, 730, 786)}
origin = capture["origin"]

def silhouette(pixels, threshold):
    rgb = pixels.astype(float)
    return (rgb.min(axis=2) > threshold) & (np.ptp(rgb, axis=2) < 65)

result = {"schema": "cardscape-silk-region-comparison/1", "accepted1to1": False,
          "regions": regions, "samples": [], "backgroundRegions": background_regions,
          "backgroundSamples": [], "thresholds": {"reference": 145, "production": 100},
          "caveats": ["Two exposed junction regions only, approximate front-view registration.",
                      "Contrast thresholds differ because the candidate reflection is not color calibrated.",
                      "Foreground and camera mismatch can bias this measure; it is not a full fidelity score."]}
for frame in capture["frames"]:
    if frame["yaw"] != 0 or frame["time"] != .78:
        continue
    raw = base64.b64decode(frame["png"].split(",", 1)[1])
    pixels = np.asarray(Image.open(io.BytesIO(raw)).convert("RGB"))
    Image.fromarray(pixels).save(Path(args.output).parent / (frame["key"] + "-gpu.png"))
    for name, (x0, y0, x1, y1) in background_regions.items():
        ref_rgb = reference[y0:y1, x0:x1].reshape(-1, 3).mean(axis=0)
        candidate_rgb = pixels[y0-origin[1]:y1-origin[1], x0-origin[0]:x1-origin[0]].reshape(-1, 3).mean(axis=0)
        result["backgroundSamples"].append({"key": frame["key"], "region": name,
            "referenceMeanRGB": ref_rgb.tolist(), "productionMeanRGB": candidate_rgb.tolist(),
            "meanRGBAbsoluteError": float(abs(candidate_rgb-ref_rgb).mean())})
    for name, (x0, y0, x1, y1) in regions.items():
        ref = silhouette(reference[y0:y1, x0:x1], 145)
        candidate = silhouette(pixels[y0-origin[1]:y1-origin[1], x0-origin[0]:x1-origin[0]], 100)
        ref_distance = distance_transform_edt(~ref)
        candidate_distance = distance_transform_edt(~candidate)
        precision = float((ref_distance[candidate] <= 4).mean()) if candidate.any() else 0
        recall = float((candidate_distance[ref] <= 4).mean()) if ref.any() and candidate.any() else 0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
        chamfer = float((ref_distance[candidate].mean() + candidate_distance[ref].mean()) / 2) if ref.any() and candidate.any() else None
        result["samples"].append({"key": frame["key"], "region": name,
            "referenceSilkPixels": int(ref.sum()), "productionSilkPixels": int(candidate.sum()),
            "precisionWithin4px": precision, "recallWithin4px": recall,
            "f1Within4px": f1, "meanTwoWayDistancePixels": chamfer})
        overlay = np.zeros((*ref.shape, 3), dtype=np.uint8)
        overlay[ref] = [250, 110, 90]
        overlay[candidate] += np.array([0, 100, 160], dtype=np.uint8)
        Image.fromarray(overlay).resize((ref.shape[1]*4, ref.shape[0]*4)).save(Path(args.output).parent / (frame["key"] + "-" + name + "-overlay.png"))
Path(args.output).write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
