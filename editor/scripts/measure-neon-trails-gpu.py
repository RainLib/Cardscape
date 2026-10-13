"""Compare visible radial components from fixed-camera GPU captures."""
import argparse
import base64
import io
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.optimize import linear_sum_assignment

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('directory', type=Path)
args = parser.parse_args()
data = json.loads((args.directory / 'webgl-captures.json').read_text())
reference = json.loads((args.directory / 'reference-measurement.json').read_text())
center, width = np.array(data['centerPixels']), data['cardWidthPixels']
mask = np.zeros((720, 1280), dtype='uint8')
for box, value in [((320, 15, 860, 675), 255), ((466, 185, 707, 494), 0),
                   ((435, 156, 529, 247), 0), ((653, 153, 739, 247), 0), ((449, 448, 717, 529), 0)]:
    cv2.rectangle(mask, box[:2], box[2:], value, -1)
results, photos = {}, []
for mode in ['baseline', 'current']:
    captures = [c for c in data['captures'] if c['mode'] == mode]
    quiet = np.array(Image.open(io.BytesIO(base64.b64decode(captures[-1]['png'].split(',')[1]))).convert('RGB'))
    dark = cv2.cvtColor(quiet, cv2.COLOR_RGB2GRAY).astype(float)
    frames, tracks, active = [], [], []
    for capture in captures:
        rgb = np.array(Image.open(io.BytesIO(base64.b64decode(capture['png'].split(',')[1]))).convert('RGB'))
        lum = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(float)
        bright = ((lum > 75) & (rgb.max(axis=2) > 130) & (lum - dark > 28) & (mask > 0)).astype('uint8')
        total, labels, stats, centers = cv2.connectedComponentsWithStats(bright)
        rays = []
        for label in range(1, total):
            if stats[label, cv2.CC_STAT_AREA] < 18:
                continue
            points = np.column_stack(np.where(labels == label)[::-1]).astype(float)
            values, vectors = np.linalg.eigh(np.cov(points.T))
            if values[1] / max(.01, values[0]) < 18:
                continue
            vec, mid = vectors[:, 1], centers[label]
            if np.dot(mid - center, vec) < 0:
                vec = -vec
            if abs((mid - center)[0] * vec[1] - (mid - center)[1] * vec[0]) > 24:
                continue
            radial = np.quantile((points - center) @ vec, [.02, .98])
            if radial[1] < 80 or radial[1] - radial[0] < 12:
                continue
            transverse = np.quantile((points - mid) @ np.array([-vec[1], vec[0]]), [.05, .95])
            rays.append(dict(angle=float(np.arctan2(vec[1], vec[0])), inner=float(radial[0]), outer=float(radial[1]),
                             width=float(transverse[1] - transverse[0])))
        following, used = [], set()
        if active and rays:
            cost = np.full((len(active), len(rays)), 1e6)
            for i, track in enumerate(active):
                previous = track['samples'][-1]
                for j, ray in enumerate(rays):
                    angle = abs(np.arctan2(np.sin(previous['angle'] - ray['angle']), np.cos(previous['angle'] - ray['angle'])))
                    if angle < .035 and abs(previous['outer'] - ray['outer']) < 45:
                        cost[i, j] = angle * 200 + abs(previous['outer'] - ray['outer']) * .05
            rows, cols = linear_sum_assignment(cost)
            for i, j in zip(rows, cols):
                if cost[i, j] < 1e6:
                    active[i]['samples'].append(dict(time=capture['time'], **rays[j]))
                    following.append(active[i])
                    used.add(j)
        for j, ray in enumerate(rays):
            if j not in used:
                track = dict(id=len(tracks), samples=[dict(time=capture['time'], **ray)])
                tracks.append(track)
                following.append(track)
        active = following
        frames.append(dict(time=capture['time'], brightExteriorPixels=int(np.count_nonzero(bright)), detectedRays=len(rays), rays=rays))
        if min(abs(capture['time'] - t) for t in [.3, .5, .7, 1., 1.3, 1.6]) < .0001:
            image = Image.fromarray(rgb)
            draw = ImageDraw.Draw(image)
            for ray in rays:
                vec = np.array([np.cos(ray['angle']), np.sin(ray['angle'])])
                draw.line([tuple(center + vec * ray['inner']), tuple(center + vec * ray['outer'])], fill='lime', width=2)
            draw.text((320, 20), f'{mode}; {capture["time"]:.3f}s; {len(rays)} lines', fill='white')
            photos.append(image.resize((640, 360)))
    retained = []
    for track in tracks:
        samples = track['samples']
        if len(samples) < 5:
            continue
        t = np.array([s['time'] for s in samples])
        out = np.array([s['outer'] for s in samples])
        design = np.column_stack([t - t[0], np.ones(len(t))])
        fit = np.linalg.lstsq(design, out, rcond=None)[0]
        track.update(outerSpeedCardWidthsPerSecond=float(fit[0] / width), outerFitRMSEPixels=float(np.sqrt(np.mean((out - design @ fit) ** 2))))
        if track['outerFitRMSEPixels'] < 5 and track['outerSpeedCardWidthsPerSecond'] > .1:
            retained.append(track)
    summary = dict(exteriorRaysMax=max(f['detectedRays'] for f in frames), peakExteriorPixelsTime=max(frames, key=lambda f: f['brightExteriorPixels'])['time'])
    for name, group in [('early', [t for t in retained if t['samples'][0]['time'] < .7 and len(t['samples']) >= 6]),
                        ('late', [t for t in retained if t['samples'][0]['time'] >= .7])]:
        summary[name + 'Candidates'] = len(group)
        summary[name + 'OuterSpeedCardWidthsPerSecondP10P50P90'] = np.quantile([t['outerSpeedCardWidthsPerSecond'] for t in group], [.1, .5, .9]).tolist() if group else []
    results[mode] = dict(summary=summary, frames=frames, candidates=retained)
report = dict(version=data['version'], referenceSummary=reference['summary'], renderings=results, accepted1to1=False,
              caveats=['Fixed opaque QA window differs from game art, badges and wordmark.',
                       'Identical thresholds do not remove the different source tone mapping.',
                       'Tracks near image boundaries can be censored; inspect overlays.'])
(args.directory / 'gpu-measurement.json').write_text(json.dumps(report, indent=2) + '\n')
board = Image.new('RGB', (3 * 640, 4 * 360))
for i, photo in enumerate(photos):
    board.paste(photo, ((i % 3) * 640, (i // 3) * 360))
board.save(args.directory / 'gpu-detections.jpg')
print(json.dumps({k: v['summary'] for k, v in results.items()}, indent=2))
