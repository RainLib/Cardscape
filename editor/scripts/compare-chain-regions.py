"""Local public-preview calibration. Never a whole-card or game-loop acceptance score."""
import base64
import io
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

directory = Path(__file__).resolve().parent.parent / 'outputs/chains-v56'
reference = np.asarray(Image.open(directory / 'reference-26.png').convert('RGB'))
capture = json.loads((directory / 'candidate-gpu-frames.json').read_text())
region = (220, 119, 445, 141)
x0, y0, x1, y1 = region
ref = reference[y0:y1, x0:x1]

def visible(rgb):
    return (rgb.min(axis=2) > 70) & (np.ptp(rgb.astype(float), axis=2) < 75)

ref_mask = visible(ref)
ref_distance = distance_transform_edt(~ref_mask)
samples = []
frames = {}
for frame in capture['frames']:
    raw = base64.b64decode(frame['png'].split(',', 1)[1])
    rgba = Image.open(io.BytesIO(raw)).convert('RGBA')
    rgba.save(directory / f"{frame['key']}-{frame['time']}-{frame['yaw']}.png")
    frames[(frame['key'], frame['time'], frame['yaw'])] = np.asarray(rgba)
    if frame['yaw'] != 0 or frame['time'] != .78:
        continue
    # A single uniform card-width projection. No per-link stretching or fitting.
    scaled = np.asarray(rgba.resize((683, 1025), Image.Resampling.LANCZOS)).astype(float)
    scaled_rgb = scaled[:, :, :3] * scaled[:, :, 3:4] / 255
    best = None
    for dx in range(-24, 25):
        for dy in range(-5, 6):
            patch = np.zeros_like(ref, dtype=float)
            src_x = x0-76+dx
            src_y = dy
            start = max(0, src_y)
            end = min(scaled_rgb.shape[0], src_y+y1-y0)
            if end > start:
                patch[start-src_y:end-src_y] = scaled_rgb[start:end, src_x:src_x+x1-x0]
            mask = visible(patch)
            other_distance = distance_transform_edt(~mask)
            precision = float((ref_distance[mask] <= 1.5).mean()) if mask.any() else 0
            recall = float((other_distance[ref_mask] <= 1.5).mean()) if mask.any() else 0
            f1 = 2*precision*recall/(precision+recall) if precision+recall else 0
            if best is None or f1 > best['f1Within1_5px']:
                union = ref_mask | mask
                best = {'key': frame['key'], 'phaseOffsetPixels': dx, 'verticalOffsetPixels': dy,
                        'f1Within1_5px': f1, 'precision': precision, 'recall': recall,
                        'binaryIoU': float((mask & ref_mask).sum()/max(1, union.sum())),
                        'meanAbsoluteRGBError': float(abs(patch-ref).mean()),
                        'referenceVisiblePixels': int(ref_mask.sum()), 'candidateVisiblePixels': int(mask.sum())}
                best_patch = patch
                best_mask = mask
    overlay = np.zeros_like(ref)
    overlay[ref_mask] = [220, 90, 60]
    overlay[best_mask] += np.array([0, 110, 160], dtype=np.uint8)
    Image.fromarray(overlay).resize((900, 88)).save(directory / (frame['key']+'-registration.png'))
    Image.fromarray(best_patch.astype(np.uint8)).resize((900, 88)).save(directory / (frame['key']+'-registered-strip.png'))
    samples.append(best)

motion = []
for key in ['baseline', 'current']:
    a = frames[(key, .78, 0)]
    b = frames[(key, 1.4, 0)]
    tilt = frames[(key, .78, .3)]
    motion.append({'key': key, 'staticTimeDifferentPixels': int(np.any(a != b, axis=2).sum()),
                   'tiltDifferentPixels': int(np.any(a != tilt, axis=2).sum()),
                   'tiltCoverageDifferentPixels': int((a[:,:,3] != tilt[:,:,3]).sum()),
                   'glErrors': [f['glError'] for f in capture['frames'] if f['key'] == key]})
report = {'schema':'cardscape-chain-region-comparison/1', 'accepted1to1':False,
          'region':region, 'projectedCardWidthPixels':683, 'uniformScale':683/1024,
          'threshold':{'minimumRGB':70, 'maximumRGBRange':75}, 'samples':samples, 'motion':motion,
          'caveats':['Single exposed top segment; reference has perspective and illumination differences.',
                     'Phase and vertical registration are independently optimized within one link and five pixels.',
                     'Public 2.31 second loop is not proof of the complete game motion cycle.']}
(directory / 'region-comparison.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
