"""Compare actual GPU glyph PNGs against the measured official external bubble.

Matching scale isolates surface/outline; it does not establish emitter fidelity.
Frame 40 guides the design, other retained frames are held out of that fit.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    root = args.directory
    captures = json.loads((root / "webgl-captures.json").read_text())
    reference = json.loads((root / "bubbles-reference-motion.json").read_text())
    assert len(captures["frames"]) == 64 and captures["gpuError"] == 0
    source = Image.open(root / "official-customization-01.gif")
    glyphs = {}
    for mode in ["baseline", "current"]:
        png = base64.b64decode(captures["glyph"][mode].split(",")[1])
        (root / f"bubble-{mode}.png").write_bytes(png)
        glyphs[mode] = np.asarray(Image.open(root / f"bubble-{mode}.png").convert("RGB"))
    target = root / "webgl"
    target.mkdir(exist_ok=True)
    for index, frame in enumerate(captures["frames"]):
        (target / f"{index:03}.png").write_bytes(base64.b64decode(frame["png"].split(",")[1]))
    xy = np.arange(-19, 20).astype("float32")
    x, y = np.meshgrid(xy, xy)
    rows = []
    board = Image.new("RGB", (900, 350), "#15212c")
    draw = ImageDraw.Draw(board)
    samples = reference["tracks"][0]["samples"]
    for point in samples:
        source.seek(point["frame"])
        pixels = np.asarray(source.convert("RGB"))
        observed = cv2.remap(pixels, x + point["x"], y + point["y"], cv2.INTER_LINEAR)
        scale = captures["glyph"]["pixelsPerUVUnit"] * .8375 / point["radius"]
        circle = x * x + y * y <= point["radius"] ** 2
        film = x * x + y * y < (point["radius"] * .55) ** 2
        row = {"frame": point["frame"], "registration": point, "modes": {}}
        if point["frame"] == 40:
            board.paste(Image.fromarray(observed).resize((300, 300)), (0, 40))
            draw.text((8, 10), "Official Jeff / frame 40", fill="white")
        for index, (mode, glyph) in enumerate(glyphs.items(), 1):
            model = cv2.remap(glyph, 120 + x * scale, 120 + y * scale, cv2.INTER_LINEAR)
            error = np.abs(model.astype(float) - observed).mean(axis=2)
            row["modes"][mode] = {"rgbMAE": float(error[circle].mean()),
                                  "filmRGBMAE": float(error[film].mean())}
            if point["frame"] == 40:
                board.paste(Image.fromarray(model).resize((300, 300)), (index * 300, 40))
                draw.text((index * 300 + 8, 10), f'{mode} MAE {error[circle].mean():.2f}', fill="white")
        rows.append(row)
    summary = {}
    for mode in glyphs:
        calibration = next(row for row in rows if row["frame"] == 40)["modes"][mode]
        holdout = [row["modes"][mode] for row in rows if row["frame"] != 40]
        summary[mode] = {"calibration": calibration,
                         "holdoutRGBMAEMean": float(np.mean([v["rgbMAE"] for v in holdout])),
                         "holdoutFilmRGBMAEMean": float(np.mean([v["filmRGBMAE"] for v in holdout]))}
    report = {"schema": "cardscape-bubble-crop-comparison/1", "version": captures["version"],
              "renderer": captures["renderer"], "gpuError": 0, "renderedFrames": 64,
              "sourceSha256": reference["sha256"],
              "captureSha256": hashlib.sha256((root / "webgl-captures.json").read_bytes()).hexdigest(),
              "calibrationFrame": 40, "holdoutFrames": len(rows) - 1,
              "metrics": summary, "samples": rows, "accepted1to1": False,
              "fullGameCycleVerified": False,
              "caveats": ["One moving external bubble; circle fitting and card width are approximate.",
                           "Matched scale does not verify the emitter, lifetime, card composition or all angles.",
                           "Held-out frames belong to the same track, not independent game captures.",
                           "No per-frame opacity fitting; GIF quantization, fading and background affect RGB."]}
    (root / "bubble-comparison.json").write_text(json.dumps(report, indent=2) + "\n")
    board.save(root / "bubble-comparison.png")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
