"""Measure visible radial trails in official video; no game artwork is imported."""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.optimize import linear_sum_assignment

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
cap = cv2.VideoCapture(str(args.source))
fps = cap.get(cv2.CAP_PROP_FPS)
start, end, step = 181. + 1. / 30., 182.8, 2
cap.set(cv2.CAP_PROP_POS_FRAMES, round(start * fps))
frames = []
for i in range(round((end - start) * fps)):
    ok, bgr = cap.read()
    if not ok:
        raise RuntimeError('Reference ended inside interval')
    if i % step == 0:
        frames.append((start + i / fps, bgr))
cap.release()
anchor = min(range(len(frames)), key=lambda i: abs(frames[i][0] - 181.5))
grey = cv2.cvtColor(frames[anchor][1], cv2.COLOR_BGR2GRAY)
features = np.zeros_like(grey)
cv2.rectangle(features, (500, 215), (672, 452), 255, -1)
sift = cv2.SIFT_create(nfeatures=800)
keys, desc = sift.detectAndCompute(grey, features)
matcher = cv2.BFMatcher()
center, width = np.array([586., 340.]), 222.
# Deliberately conservative: occluding art, cost/power and logo are not trails.
exterior = np.zeros_like(grey)
cv2.rectangle(exterior, (320, 15), (860, 675), 255, -1)
cv2.rectangle(exterior, (466, 185), (707, 494), 0, -1)
cv2.rectangle(exterior, (435, 156), (529, 247), 0, -1)
cv2.rectangle(exterior, (653, 153), (739, 247), 0, -1)
cv2.rectangle(exterior, (449, 448), (717, 529), 0, -1)
def registration(current):
    current_keys, current_desc = sift.detectAndCompute(current, None)
    pairs = matcher.knnMatch(desc, current_desc, k=2)
    good = [pair[0] for pair in pairs if len(pair) == 2 and pair[0].distance < .72 * pair[1].distance]
    if len(good) < 12:
        return None
    a = np.float32([keys[m.queryIdx].pt for m in good])
    b = np.float32([current_keys[m.trainIdx].pt for m in good])
    affine, inliers = cv2.estimateAffinePartial2D(a, b, method=cv2.RANSAC, ransacReprojThreshold=1.5)
    if affine is None or int(inliers.sum()) < 10:
        return None
    scale = np.sqrt(np.linalg.det(affine[:, :2]))
    angle = np.arctan2(affine[1, 0], affine[0, 0])
    if not (.65 < scale < 1.35 and abs(angle) < .20):
        return None
    mapped = a @ affine[:, :2].T + affine[:, 2]
    rmse = float(np.sqrt(np.mean(np.sum((mapped[inliers[:, 0] == 1] - b[inliers[:, 0] == 1]) ** 2, axis=1))))
    return np.linalg.inv(np.vstack([affine, [0, 0, 1]])), rmse

quiet = registration(cv2.cvtColor(frames[-1][1], cv2.COLOR_BGR2GRAY))
if quiet is None:
    raise RuntimeError('Quiet baseline cannot be registered')
reference_dark = cv2.cvtColor(cv2.warpPerspective(frames[-1][1], quiet[0], (1280, 720)), cv2.COLOR_BGR2GRAY).astype(float)
observations, photos, tracks, active = [], [], [], []
for fi, (time, bgr) in enumerate(frames):
    current = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    result = registration(current)
    if result is None:
        observations.append(dict(time=time, registrationValid=False))
        active = []
        continue
    inverse, rmse = result
    aligned = cv2.warpPerspective(bgr, inverse, (1280, 720))
    lum = cv2.cvtColor(aligned, cv2.COLOR_BGR2GRAY).astype(float)
    bright = np.max(aligned.astype(float), axis=2)
    mask = ((lum > 75) & (bright > 130) & (lum - reference_dark > 28) & (exterior > 0)).astype('uint8') * 255
    rays = []
    total, labels, stats, centers = cv2.connectedComponentsWithStats(mask)
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
        cross_distance = abs((mid - center)[0] * vec[1] - (mid - center)[1] * vec[0])
        if cross_distance > 24:
            continue
        radial = np.quantile((points - center) @ vec, [.02, .98])
        if radial[1] < 80 or radial[1] - radial[0] < 12:
            continue
        angle = float(np.arctan2(vec[1], vec[0]))
        normal = np.array([-vec[1], vec[0]])
        transverse = np.quantile((points - mid) @ normal, [.05, .95])
        rays.append(dict(angle=angle, inner=float(radial[0]), outer=float(radial[1]),
                         width=float(transverse[1] - transverse[0]), area=int(len(points))))
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
                active[i]['samples'].append(dict(time=time, **rays[j]))
                following.append(active[i])
                used.add(j)
    for j, ray in enumerate(rays):
        if j not in used:
            track = dict(id=len(tracks), samples=[dict(time=time, **ray)])
            tracks.append(track)
            following.append(track)
    active = following
    observations.append(dict(time=time, registrationValid=True, registrationRMSEPixels=rmse,
                             brightExteriorPixels=int(np.count_nonzero(mask)), detectedRays=len(rays), rays=rays))
    if fi % 4 == 0:
        image = Image.fromarray(cv2.cvtColor(aligned, cv2.COLOR_BGR2RGB))
        draw = ImageDraw.Draw(image)
        for ray in rays:
            direction = np.array([np.cos(ray['angle']), np.sin(ray['angle'])])
            draw.line([tuple(center + direction * ray['inner']), tuple(center + direction * ray['outer'])], fill='lime', width=2)
        draw.text((320, 20), f'{time:.3f}s; {len(rays)} visible radial lines', fill='white')
        photos.append(image.resize((640, 360)))
retained = [track for track in tracks if len(track['samples']) >= 5]
for track in retained:
    t = np.array([s['time'] for s in track['samples']])
    out = np.array([s['outer'] for s in track['samples']])
    design = np.column_stack([t - t[0], np.ones(len(t))])
    fit = np.linalg.lstsq(design, out, rcond=None)[0]
    track['visibleSpanSeconds'] = float(t[-1] - t[0])
    track['outerSpeedCardWidthsPerSecond'] = float(fit[0] / width)
    track['outerFitRMSEPixels'] = float(np.sqrt(np.mean((out - design @ fit) ** 2)))
valid = [o for o in observations if o['registrationValid']]
candidates = [t for t in retained if t['outerFitRMSEPixels'] < 5 and t['outerSpeedCardWidthsPerSecond'] > .1]
early = [t for t in candidates if t['samples'][0]['time'] < 181.8 and len(t['samples']) >= 6]
late = [t for t in candidates if t['samples'][0]['time'] > 181.8]
summary = dict(sampledFrames=len(frames), registeredFrames=len(valid), tracks=len(retained), motionCandidates=len(candidates),
               registrationRMSEPixelsP10P50P90=np.quantile([o['registrationRMSEPixels'] for o in valid], [.1, .5, .9]).tolist(),
               exteriorRaysMax=max(o['detectedRays'] for o in valid), peakExteriorPixelsTime=max(valid, key=lambda o: o['brightExteriorPixels'])['time'],
               candidateOuterSpeedCardWidthsPerSecondP10P50P90=np.quantile([t['outerSpeedCardWidthsPerSecond'] for t in candidates], [.1, .5, .9]).tolist() if candidates else [])
summary.update(earlyCandidates=len(early), lateCandidates=len(late),
               earlyOuterSpeedCardWidthsPerSecondP10P50P90=np.quantile([t['outerSpeedCardWidthsPerSecond'] for t in early], [.1, .5, .9]).tolist() if early else [],
               lateOuterSpeedCardWidthsPerSecondP10P50P90=np.quantile([t['outerSpeedCardWidthsPerSecond'] for t in late], [.1, .5, .9]).tolist() if late else [])
report = dict(schema='cardscape-neon-trails-reference/1', sourceSha256=hashlib.sha256(args.source.read_bytes()).hexdigest(),
              interval=[start, end], sourceFPS=fps, sampledFPS=fps / step, anchorSeconds=frames[anchor][0],
              manualCenterAtAnchorPixels=center.tolist(), manualCardWidthPixels=width, frames=observations, tracks=retained, summary=summary,
              accepted1to1=False, caveats=['Interior and badges are excluded, so visible count is a lower bound on emitted count.',
              'Outer endpoints may be censored by viewport or brightness threshold; visible span is not lifetime.',
              'Connected components can fragment or merge trails; inspect overlays before using a fit.',
              'Similarity registration uses interior features; live finish and parallax can bias registration.'])
(args.output / 'reference-measurement.json').write_text(json.dumps(report, indent=2) + '\n')
board = Image.new('RGB', (3 * 640, ((len(photos) + 2) // 3) * 360))
for i, photo in enumerate(photos):
    board.paste(photo, ((i % 3) * 640, (i // 3) * 360))
board.save(args.output / 'reference-detections.jpg')
print(json.dumps(summary, indent=2))
