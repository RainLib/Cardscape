"""Observe source fade envelopes independently of the opaque-rim detector.

This is QA, not particle generation. Motion/radius extrapolation is explicitly
bounded, and the estimated static background is not a recovered game asset.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("tracks", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source = Image.open(args.source)
    images, timestamps, elapsed = [], [], 0
    for index in range(source.n_frames):
        source.seek(index)
        images.append(np.asarray(source.convert("RGB"), dtype=np.uint8))
        timestamps.append(elapsed / 1000)
        elapsed += source.info.get("duration", 0)
    pixels = np.stack(images)
    background = np.median(pixels, axis=0)
    yellow = np.array([254., 181., 28.])
    report = json.loads(args.tracks.read_text())
    observations = []
    for track in report["tracks"]:
        samples = track["samples"]
        times = np.array([p["time"] for p in samples])
        relative = times-times[0]
        points = np.array([[p["x"], p["y"]] for p in samples])
        motion = np.linalg.lstsq(np.column_stack([relative, np.ones(len(times))]), points, rcond=None)[0]
        radii = np.array([p["radius"] for p in samples])
        curve = np.linalg.lstsq(np.column_stack([relative**2, relative, np.ones(len(times))]), radii, rcond=None)[0]
        frames = []
        for frame_index, time in enumerate(timestamps):
            if time < times[0]-.12 or time > times[-1]+.18:
                continue
            t = time-times[0]
            center = np.array([t, 1.]) @ motion
            radius = max(4., float(np.array([t*t, t, 1.]) @ curve))
            # Only the circular body; pointed black fins have another color.
            x0, y0 = np.floor(center-radius*1.10).astype(int)
            x1, y1 = np.ceil(center+radius*1.10).astype(int)
            x0, x1 = max(0, x0), min(source.width, x1)
            y0, y1 = max(0, y0), min(source.height, y1)
            if x0 >= x1 or y0 >= y1:
                continue
            bg = background[y0:y1, x0:x1]
            current = pixels[frame_index, y0:y1, x0:x1]
            axis = yellow-bg
            magnitude = np.sum(axis*axis, axis=2)
            alpha = np.sum((current-bg)*axis, axis=2)/np.maximum(1., magnitude)
            residual = np.linalg.norm(current-(bg+alpha[..., None]*axis), axis=2)
            ys, xs = np.mgrid[y0:y1, x0:x1]
            body = (xs-center[0])**2+(ys-center[1])**2 < radius**2
            valid = body & (magnitude > 100**2) & (residual < 8.) & (alpha > .04) & (alpha <= 1.08)
            values = alpha[valid]
            # Require an area, not a single bright/compressed pixel.
            estimate = float(np.percentile(values, 75)) if len(values) >= max(15, radius**2*.03) else None
            frames.append(dict(frame=frame_index, time=time, predictedCenter=center.tolist(),
                               predictedRadius=radius, matchedYellowPixels=int(len(values)),
                               alphaEstimate=estimate, extrapolated=bool(time < times[0] or time > times[-1])))
        observations.append(dict(id=track["id"], opaqueDetectorWindow=[float(times[0]), float(times[-1])], frames=frames))
    result = dict(schema="cardscape-emblem-envelope-observation/1", source=str(args.source),
                  sourceSha256=hashlib.sha256(args.source.read_bytes()).hexdigest(),
                  inputTracks=str(args.tracks), frameCount=len(images), tracks=observations,
                  accepted1to1=False, gameLifetimeVerified=False,
                  caveats=["Median pixels estimate a static background; animated background and overlapping glyphs contaminate it.",
                           "Yellow-channel alpha is an estimated mixing coefficient, not the engine Alpha.",
                           "Center and radius outside the opaque detector window are bounded extrapolations, not new verified tracks.",
                           "Do not infer a lifetime or reduce counts solely from opaque-rim detections."])
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output/"source-envelope.json").write_text(json.dumps(result, indent=2)+"\n")
    # Inspectable source pixels follow predicted centers; no source pixels change.
    selected = [t for t in observations if t["id"] in [19, 22, 23, 90]]
    board = Image.new("RGB", (1200, len(selected)*160), "#191c22")
    draw = ImageDraw.Draw(board)
    for row, track in enumerate(selected):
        indices = np.linspace(0, len(track["frames"])-1, 10).round().astype(int)
        for column, at in enumerate(indices):
            frame = track["frames"][at]
            source.seek(frame["frame"])
            x, y = frame["predictedCenter"]
            board.paste(source.crop((round(x)-55, round(y)-55, round(x)+55, round(y)+55)).convert("RGB"), (column*120, row*160+28))
            alpha = frame["alphaEstimate"]
            label = f'{track["id"]} / {frame["time"]:.2f}s'
            draw.text((column*120, row*160+4), label, fill="white")
            draw.text((column*120, row*160+140), f'a={alpha:.2f}' if alpha is not None else 'a=unknown', fill="white")
    board.save(args.output/"source-envelope-strips.png")
    print(json.dumps({"output": str(args.output), "tracks": len(observations), "gameLifetimeVerified": False}))


if __name__ == "__main__":
    main()
