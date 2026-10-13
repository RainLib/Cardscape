"""QA measurement of the visible Adamantium WebP, not game-cycle verification.

Requires Pillow, numpy, scipy and OpenCV in the QA environment. No production
assets are generated: annotations, tracks and statistics remain in outputs.
"""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.optimize import linear_sum_assignment


def observe(image):
    pixels = np.asarray(image.convert("RGB")).astype(float)
    blue = np.linalg.norm(pixels - [14, 63, 153], axis=2) < 38
    yellow = np.linalg.norm(pixels - [254, 181, 28], axis=2) < 40
    mask = cv2.morphologyEx(((blue | yellow) * 255).astype("uint8"),
                            cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    candidates = []
    for label in range(1, count):
        x, y, width, height, area = stats[label]
        by, bx = np.where((labels == label) & blue)
        if (len(bx) < 30 or yellow[labels == label].sum() < 40 or
                x == 0 or y == 0 or x + width >= image.width or
                y + height >= image.height):
            continue
        matrix = np.column_stack([2 * bx, 2 * by, np.ones(len(bx))])
        cx, cy, c = np.linalg.lstsq(matrix, bx * bx + by * by, rcond=None)[0]
        radius = np.sqrt(max(0, c + cx * cx + cy * cy))
        residual = np.std(np.hypot(bx - cx, by - cy) - radius)
        if radius <= 8 or residual >= 2.5:
            continue
        candidates.append(dict(x=float(cx), y=float(cy), radius=float(radius),
                               ringResidual=float(residual), area=int(area)))
    # Black fins and occlusion can split a single disc into several components.
    unique = []
    for item in sorted(candidates, key=lambda x: -x["area"]):
        if not any(np.hypot(item["x"] - p["x"], item["y"] - p["y"]) <
                   max(item["radius"], p["radius"]) * .85 for p in unique):
            unique.append(item)
    return unique


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    source = Image.open(args.source)
    frames, tracks, active = [], [], []
    elapsed = 0
    for index in range(source.n_frames):
        source.seek(index)
        detections = observe(source)
        frame = dict(index=index, time=elapsed / 1000, detections=detections)
        frames.append(frame)
        matched_tracks, matched_detections = set(), set()
        if active and detections:
            costs = np.zeros((len(active), len(detections)))
            for i, track in enumerate(active):
                last = track["samples"][-1]
                for j, point in enumerate(detections):
                    distance = np.hypot(last["x"] - point["x"], last["y"] - point["y"])
                    size_ratio = max(last["radius"], point["radius"]) / min(last["radius"], point["radius"])
                    costs[i, j] = distance + abs(point["radius"] - last["radius"]) * .8 if distance < 38 and size_ratio < 2 else 10000
            rows, columns = linear_sum_assignment(costs)
            for i, j in zip(rows, columns):
                if costs[i, j] >= 10000:
                    continue
                active[i]["samples"].append(dict(frame=index, time=elapsed / 1000, **detections[j]))
                matched_tracks.add(i)
                matched_detections.add(j)
        next_active = [track for i, track in enumerate(active) if i in matched_tracks]
        for j, point in enumerate(detections):
            if j not in matched_detections:
                track = dict(id=len(tracks), samples=[dict(frame=index, time=elapsed / 1000, **point)])
                tracks.append(track)
                next_active.append(track)
        active = next_active
        elapsed += source.info.get("duration", 0)
    measured = [track for track in tracks if len(track["samples"]) >= 6]
    speeds, durations, radius_changes = [], [], []
    for track in measured:
        samples = track["samples"]
        duration = samples[-1]["time"] - samples[0]["time"]
        durations.append(duration)
        radius_changes.append(samples[-1]["radius"] / samples[0]["radius"])
        for a, b in zip(samples, samples[1:]):
            speeds.append(float(np.hypot(b["x"] - a["x"], b["y"] - a["y"]) / (b["time"] - a["time"])))
    normals, intercepts, flows = [], [], []
    for track in measured:
        samples = track["samples"]
        positions = np.array([[p["x"], p["y"]] for p in samples])
        times = np.array([p["time"] for p in samples])
        velocity = np.linalg.lstsq(np.column_stack([times, np.ones(len(times))]), positions, rcond=None)[0][0]
        velocity /= np.linalg.norm(velocity)
        normal = np.array([-velocity[1], velocity[0]])
        normals.append(normal)
        intercepts.append(float(normal @ positions.mean(axis=0)))
        flows.append((positions, velocity))
    origin = np.linalg.lstsq(normals, intercepts, rcond=None)[0] if normals else np.array([0., 0.])
    radial_errors = np.abs(np.array(normals) @ origin - intercepts) if normals else []
    percentile = lambda values: [float(v) for v in np.percentile(values, [10, 50, 90])] if len(values) else []
    report = dict(schema="cardscape-visible-emblem-measurement/1", source=str(args.source.resolve()),
                  sha256=hashlib.sha256(args.source.read_bytes()).hexdigest(),
                  dimensions=list(source.size), frameCount=source.n_frames, clipMilliseconds=elapsed,
                  accepted1to1=False, fullGameCycleVerified=False,
                  caveats=["Color segmentation and circular-rim fits can miss small, dim, clipped or overlapping glyphs.",
                           "Nearest-neighbor identity is uncertain at births and overlaps; retained tracks require six consecutive detections.",
                           "Visible speeds use WebP presentation timestamps, not verified engine time.",
                           "Track durations are visibility windows, not measured lifetimes; card width normalization requires separate registration."],
                  statistics=dict(retainedTracks=len(measured), visibleSpeedPixelsPerSecondP10P50P90=percentile(speeds),
                                  visibleTrackSecondsP10P50P90=percentile(durations),
                                  radiusEndStartRatioP10P50P90=percentile(radius_changes),
                                  fittedFlowOriginPixels=origin.tolist(),
                                  flowLineDistancePixelsP10P50P90=percentile(radial_errors),
                                  outwardTracks=sum(int(v @ (p[-1] - origin) > 0) for p, v in flows)),
                  tracks=measured, frames=frames)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "reference-motion.json").write_text(json.dumps(report, indent=2) + "\n")
    board = Image.new("RGB", (820, 1000), "#121a22")
    source.seek(0)
    board.paste(source.convert("RGB"))
    draw = ImageDraw.Draw(board)
    for track in measured:
        points = [(p["x"], p["y"]) for p in track["samples"]]
        draw.line(points, fill="#f8e16c", width=2)
        x, y = points[0]
        draw.text((x + 4, y + 4), str(track["id"]), fill="white")
    board.save(args.output / "reference-tracks.png")
    print(json.dumps(report["statistics"]))


if __name__ == "__main__":
    main()
