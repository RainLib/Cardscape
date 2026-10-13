"""Measure exterior banana tracks in a public reference video, without importing artwork."""
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
start, end, step, scale = 111. + 1. / 15., 120.5, 4, .5
cap.set(cv2.CAP_PROP_POS_FRAMES, round(start * fps))
frames = []
for index in range(round((end - start) * fps)):
    ok, rgb = cap.read()
    if not ok:
        raise RuntimeError('Reference video ended inside the measured segment')
    if index % step == 0:
        frames.append((start + index / fps, cv2.resize(rgb, None, fx=scale, fy=scale)))
cap.release()
# At 112 seconds the visible common frame is approximately this rectangle.
# These manual anchors define only a measurement coordinate system, not authored geometry.
anchor = min(range(len(frames)), key=lambda i: abs(frames[i][0] - 112.))
base = cv2.cvtColor(frames[anchor][1], cv2.COLOR_BGR2GRAY)
corners = np.float32([[519, 146], [752, 146], [752, 441], [519, 441]]) * scale
feature_mask = np.zeros_like(base)
cv2.rectangle(feature_mask, (265, 90), (371, 215), 255, -1)
sift = cv2.SIFT_create(nfeatures=650)
keypoints, descriptors = sift.detectAndCompute(base, feature_mask)
matcher = cv2.BFMatcher()
tracked, observations, active, photos = [], [], [], []
for fi, (time, bgr) in enumerate(frames):
    grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    current_keypoints, current_descriptors = sift.detectAndCompute(grey, None)
    matches = matcher.knnMatch(descriptors, current_descriptors, k=2)
    good = [m[0] for m in matches if len(m) == 2 and m[0].distance < .72 * m[1].distance]
    if len(good) < 12:
        observations.append(dict(time=time, registrationValid=False, matches=len(good)))
        active = []
        continue
    p = np.float32([keypoints[m.queryIdx].pt for m in good])
    q = np.float32([current_keypoints[m.trainIdx].pt for m in good])
    transform, inliers = cv2.findHomography(p, q, cv2.RANSAC, 1.5)
    if transform is None or int(inliers.sum()) < 10:
        observations.append(dict(time=time, registrationValid=False, matches=len(good)))
        active = []
        continue
    inverse = np.linalg.inv(transform)
    mapped = cv2.perspectiveTransform(p.reshape(-1, 1, 2), transform)[:, 0]
    error = float(np.sqrt(np.mean(np.sum((mapped[inliers[:, 0] == 1] - q[inliers[:, 0] == 1]) ** 2, axis=1))))
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(float)
    mask = ((rgb[:, :, 0] > 90) & (rgb[:, :, 1] > 50)
            & (rgb[:, :, 1] > rgb[:, :, 0] * .5) & (rgb[:, :, 1] < rgb[:, :, 0] * 1.03)
            & (rgb[:, :, 2] < rgb[:, :, 0] * .55)).astype('uint8')
    count, labels, stats, centers = cv2.connectedComponentsWithStats(mask)
    detections = []
    for di in range(1, count):
        x, y, w, h, area = stats[di]
        center = cv2.perspectiveTransform(np.float32([[centers[di]]]), inverse)[0, 0]
        if not (225 < centers[di][0] < 395 and 43 < centers[di][1] < 242):
            continue
        if area < 18 or area > 460 or max(w, h) < 8 or max(w, h) > 47 or min(w, h) < 3:
            continue
        # The gold power badge would otherwise be misclassified as a long-lived banana.
        # These excluded areas also censor real particles crossing a badge.
        if 61 <= center[1] <= 98 and (244 <= center[0] <= 284 or 358 <= center[0] <= 394):
            continue
        # Require an exterior centroid; connected art and badges are rejected by dimensions.
        if corners[0, 0] <= center[0] <= corners[1, 0] and corners[0, 1] <= center[1] <= corners[2, 1]:
            continue
        pixels = np.column_stack(np.where(labels == di)[::-1]).astype(np.float32)
        normalized = cv2.perspectiveTransform(pixels.reshape(-1, 1, 2), inverse)[:, 0]
        _, vectors = np.linalg.eigh(np.cov(normalized.T))
        angle = float(np.arctan2(vectors[1, -1], vectors[0, -1]))
        angle = (angle + np.pi / 2) % np.pi - np.pi / 2
        detections.append(dict(x=float(center[0]), y=float(center[1]), angle=angle,
                               area=int(area), box=[int(x), int(y), int(w), int(h)]))
    matched, following = set(), []
    if active and detections:
        costs = np.full((len(active), len(detections)), 1e6)
        for i, track in enumerate(active):
            last = track['samples'][-1]
            for j, detection in enumerate(detections):
                distance = np.hypot(last['x'] - detection['x'], last['y'] - detection['y'])
                area_change = abs(np.log(detection['area'] / last['area']))
                if distance < 13 and area_change < 1.2:
                    costs[i, j] = distance + 3 * area_change
        rows, cols = linear_sum_assignment(costs)
        for i, j in zip(rows, cols):
            if costs[i, j] < 1e6:
                active[i]['samples'].append(dict(time=time, frame=fi, **detections[j]))
                following.append(active[i])
                matched.add(j)
    for j, detection in enumerate(detections):
        if j not in matched:
            track = dict(id=len(tracked), samples=[dict(time=time, frame=fi, **detection)])
            tracked.append(track)
            following.append(track)
    active = following
    observations.append(dict(time=time, registrationValid=True, matches=len(good), inliers=int(inliers.sum()),
                             registrationRMSEPixels=error / scale, detections=detections))
    if fi % 15 == 0:
        preview = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        draw = ImageDraw.Draw(preview)
        quad = cv2.perspectiveTransform(corners.reshape(-1, 1, 2), transform)[:, 0]
        draw.line([tuple(v) for v in quad] + [tuple(quad[0])], fill='cyan', width=1)
        for detection in detections:
            x, y, w, h = detection['box']
            draw.rectangle((x, y, x + w, y + h), outline='lime')
        draw.text((5, 5), f'{time:.2f}s; exterior detections {len(detections)}', fill='white')
        photos.append(preview)
retained = [track for track in tracked if len(track['samples']) >= 6]
for track in retained:
    samples = track['samples']
    t = np.array([sample['time'] for sample in samples])
    xy = np.array([[sample['x'], sample['y']] for sample in samples])
    angles = np.unwrap(np.array([sample['angle'] for sample in samples]) * 2) / 2
    design = np.column_stack([t - t[0], np.ones(len(t))])
    motion = np.linalg.lstsq(design, xy, rcond=None)[0]
    angular = np.linalg.lstsq(design, angles, rcond=None)[0]
    track.update(visibleSpanSeconds=float(t[-1] - t[0]), velocityCardWidthsPerSecond=(motion[0] / (233 * scale)).tolist(),
                 angularRadiansPerSecond=float(angular[0]), positionRMSEPixels=float(np.sqrt(np.mean((xy - design @ motion) ** 2)) / scale),
                 angleRMSE=float(np.sqrt(np.mean((angles - design @ angular) ** 2))))
    track['motionCandidate'] = bool(len(samples) >= 8 and track['positionRMSEPixels'] <= 3.
                                and track['angleRMSE'] <= .23
                                and np.linalg.norm(track['velocityCardWidthsPerSecond']) > .055)
valid = [o for o in observations if o['registrationValid']]
candidates = [track for track in retained if track['motionCandidate']]
report = dict(schema='cardscape-reference-bananas-video/1', sourceSha256=hashlib.sha256(args.source.read_bytes()).hexdigest(),
              sourceIntervalSeconds=[start, end], sourceFPS=fps, sampledFPS=fps / step, anchorSeconds=frames[anchor][0],
              manualFrameCornersAtAnchorPixels=(corners / scale).tolist(), frames=observations, tracks=retained,
              summary=dict(sampledFrames=len(frames), registeredFrames=len(valid), retainedTracks=len(retained),
                           motionCandidates=len(candidates),
                           registrationRMSEPixelsP10P50P90=np.percentile([o['registrationRMSEPixels'] for o in valid], [10, 50, 90]).tolist(),
                           visibleSpanSecondsP10P50P90=np.percentile([t['visibleSpanSeconds'] for t in retained], [10, 50, 90]).tolist(),
                           candidateSpeedCardWidthsPerSecondP10P50P90=np.percentile([np.linalg.norm(t['velocityCardWidthsPerSecond']) for t in candidates], [10, 50, 90]).tolist(),
                           candidateAbsoluteAngularRadiansPerSecondP10P50P90=np.percentile([abs(t['angularRadiansPerSecond']) for t in candidates], [10, 50, 90]).tolist(),
                           exteriorDetectionCountP10P50P90=np.percentile([len(o['detections']) for o in valid], [10, 50, 90]).tolist()),
              accepted1to1=False,
              caveats=['Homography follows visible interior features; character parallax and animated finish can bias camera registration.',
                       'Exterior color tracks can stop at frame occlusion, alpha threshold, crossings or connected art; visible span is not particle lifetime.',
                       'Fixed cost/power badge regions are excluded; real particles crossing those regions are censored as well.',
                       'PCA has 180-degree ambiguity and may be biased by the crescent shape.',
                       'This independent longer shot has not yet been used to modify production motion or mark full-cycle acceptance.'])
(args.output / 'bananas-video-measurement.json').write_text(json.dumps(report, indent=2) + '\n')
board = Image.new('RGB', (3 * 640, ((len(photos) + 2) // 3) * 360))
for i, photo in enumerate(photos):
    board.paste(photo, ((i % 3) * 640, (i // 3) * 360))
board.save(args.output / 'bananas-video-detections.jpg')
print(json.dumps(report['summary'], indent=2))
