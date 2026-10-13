"""Measure visible external bubbles in the official Jeff customization GIF.

The fixed exterior ROI excludes artwork, cost/power and most frame pixels.
Measurements are clip evidence, not engine lifetimes or a full game cycle.
No reference pixels become production assets.
"""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.optimize import linear_sum_assignment


def detect(image):
    a = np.asarray(image.convert("RGB")).astype(float)
    y, x = np.mgrid[:image.height, :image.width]
    exterior = (x < 100) | (x > 330) | ((y < 65) & (x > 180) & (x < 285))
    cyan = ((a[:, :, 2] > a[:, :, 0] * 1.4) &
            (a[:, :, 1] > a[:, :, 0] * 1.25) &
            (a[:, :, 2] > a[:, :, 1] * 1.02) &
            (a[:, :, 1] > 25) & (a[:, :, 2] > 40))
    mask = cv2.morphologyEx((cyan & exterior).astype("uint8") * 255,
                            cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    result = []
    for label in range(1, count):
        xx, yy, width, height, area = stats[label]
        if (area < 80 or min(width, height) < 8 or max(width, height) > 50 or
                max(width, height) / min(width, height) > 1.35):
            continue
        points = np.column_stack(np.where(labels == label)[::-1]).astype("float32")
        (cx, cy), radius = cv2.minEnclosingCircle(points)
        if radius < 4 or radius > 24:
            continue
        result.append(dict(x=float(cx), y=float(cy), radius=float(radius), area=int(area)))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    image = Image.open(args.source)
    assert image.size == (432, 432), "ROI belongs only to the recorded official GIF"
    frames, tracks, active = [], [], []
    elapsed = 0
    for index in range(image.n_frames):
        image.seek(index)
        detections = detect(image)
        frames.append(dict(index=index, time=elapsed / 1000, detections=detections))
        matched = set()
        next_active = []
        if active and detections:
            cost = np.full((len(active), len(detections)), 10000.)
            for i, track in enumerate(active):
                previous = track["samples"][-1]
                for j, point in enumerate(detections):
                    distance = np.hypot(previous["x"] - point["x"], previous["y"] - point["y"])
                    if distance < 12 and abs(previous["radius"] - point["radius"]) < 4:
                        cost[i, j] = distance + abs(previous["radius"] - point["radius"])
            rows, columns = linear_sum_assignment(cost)
            for i, j in zip(rows, columns):
                if cost[i, j] < 10000:
                    active[i]["samples"].append(dict(frame=index, time=elapsed / 1000, **detections[j]))
                    next_active.append(active[i])
                    matched.add(j)
        for j, point in enumerate(detections):
            if j not in matched:
                track = dict(id=len(tracks), samples=[dict(frame=index, time=elapsed / 1000, **point)])
                tracks.append(track)
                next_active.append(track)
        active = next_active
        elapsed += image.info.get("duration", 0)
    retained = [t for t in tracks if len(t["samples"]) >= 8 and
                np.hypot(t["samples"][-1]["x"] - t["samples"][0]["x"],
                         t["samples"][-1]["y"] - t["samples"][0]["y"]) > 8]
    velocities, diameters = [], []
    for track in retained:
        samples = track["samples"]
        times = np.array([p["time"] for p in samples])
        positions = np.array([[p["x"], p["y"]] for p in samples])
        velocity = np.linalg.lstsq(np.column_stack([times, np.ones(len(times))]), positions, rcond=None)[0][0]
        track["fittedVelocityPixelsPerSecond"] = velocity.tolist()
        velocities.append(np.linalg.norm(velocity))
        diameters.extend(p["radius"] * 2 for p in samples)
    quantiles = lambda v: np.percentile(v, [10, 50, 90]).tolist() if len(v) else []
    report = dict(schema="cardscape-official-bubbles-clip/1", source=str(args.source.resolve()),
                  sha256=hashlib.sha256(args.source.read_bytes()).hexdigest(),
                  frameCount=image.n_frames, clipMilliseconds=elapsed,
                  registration={"cardWidthPixels": 202, "estimatedTolerancePixels": 4},
                  statistics=dict(retainedMovingTracks=len(retained),
                                  diameterCardWidthsP10P50P90=[v / 202 for v in quantiles(diameters)],
                                  fittedSpeedCardWidthsPerSecondP10P50P90=[v / 202 for v in quantiles(velocities)],
                                  upwardTracks=sum(t["fittedVelocityPixelsPerSecond"][1] < 0 for t in retained)),
                  tracks=retained, frames=frames, accepted1to1=False,
                  fullGameCycleVerified=False,
                  caveats=["Exterior ROI omits occluded, dim, clipped and interior bubbles.",
                           "Two-dimensional card width registration is approximate during camera rotation.",
                           "Presentation timestamps do not independently establish game speed or lifetime.",
                           "Small sample count cannot identify all emitter sites or random distributions."])
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "bubbles-reference-motion.json").write_text(json.dumps(report, indent=2) + "\n")
    image.seek(40)
    board = image.convert("RGB")
    draw = ImageDraw.Draw(board)
    for track in retained:
        points = [(p["x"], p["y"]) for p in track["samples"]]
        draw.line(points, fill="#ffdc64", width=2)
        draw.text(points[0], str(track["id"]), fill="white")
    board.save(args.output / "bubbles-reference-tracks.png")
    print(json.dumps(report["statistics"]))


if __name__ == "__main__":
    main()
