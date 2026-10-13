"""Compare temporal observations, not particle identities or full-game fidelity.

Both inputs must contain real image detections at presentation timestamps.
The current-size report is produced from actual WebGL captures, not CPU samples.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from scipy.optimize import linear_sum_assignment


def analyze(frames, width):
    tracks, active = [], []
    for frame in frames:
        detections = frame["detections"]
        matched_tracks, matched_detections = set(), set()
        if active and detections:
            costs = np.full((len(active), len(detections)), 10000.0)
            for i, track in enumerate(active):
                last = track["samples"][-1]
                for j, point in enumerate(detections):
                    distance = np.hypot(last["x"] - point["x"], last["y"] - point["y"])
                    ratio = max(last["radius"], point["radius"]) / min(last["radius"], point["radius"])
                    if distance < 38 and ratio < 2:
                        costs[i, j] = distance + abs(point["radius"] - last["radius"]) * .8
            rows, columns = linear_sum_assignment(costs)
            for i, j in zip(rows, columns):
                if costs[i, j] < 10000:
                    active[i]["samples"].append(dict(time=frame["time"], **detections[j]))
                    matched_tracks.add(i)
                    matched_detections.add(j)
        next_active = [track for i, track in enumerate(active) if i in matched_tracks]
        for j, point in enumerate(detections):
            if j not in matched_detections:
                track = dict(id=len(tracks), samples=[dict(time=frame["time"], **point)])
                tracks.append(track)
                next_active.append(track)
        active = next_active
    retained = [track for track in tracks if len(track["samples"]) >= 6]
    speeds, durations, growth, rates, acceleration, residuals, normals, intercepts, flows = [], [], [], [], [], [], [], [], []
    for track in retained:
        samples = track["samples"]
        durations.append(samples[-1]["time"] - samples[0]["time"])
        growth.append(samples[-1]["radius"] / samples[0]["radius"])
        for a, b in zip(samples, samples[1:]):
            dt = b["time"] - a["time"]
            if dt <= 0:
                raise ValueError("Image timestamps must strictly increase")
            speeds.append(np.hypot(b["x"] - a["x"], b["y"] - a["y"]) / dt / width)
        positions = np.array([[p["x"], p["y"]] for p in samples])
        times = np.array([p["time"] for p in samples])
        ages = times-times[0]
        radii = np.array([p["radius"] for p in samples])/width
        linear = np.column_stack([ages, np.ones(len(ages))])
        rates.append(float(np.linalg.lstsq(linear, radii, rcond=None)[0][0]))
        quadratic = np.column_stack([ages*ages, ages, np.ones(len(ages))])
        coefficients = np.linalg.lstsq(quadratic, radii, rcond=None)[0]
        acceleration.append(float(coefficients[0]*2))
        residuals.append(float(np.sqrt(np.mean((quadratic @ coefficients-radii)**2))))
        velocity = np.linalg.lstsq(np.column_stack([times, np.ones(len(times))]), positions, rcond=None)[0][0]
        length = np.linalg.norm(velocity)
        if length > 1e-9:
            velocity /= length
            normal = np.array([-velocity[1], velocity[0]])
            normals.append(normal)
            intercepts.append(float(normal @ positions.mean(axis=0)))
            flows.append((positions, velocity))
    origin = np.linalg.lstsq(normals, intercepts, rcond=None)[0] if normals else np.array([0., 0.])
    quantiles = lambda x: [float(v) for v in np.percentile(x, [10, 50, 90])] if x else []
    counts = [len(f["detections"]) for f in frames]
    return dict(retainedTracks=len(retained), speedPerCardWidthPerSecond=quantiles(speeds),
                visibleSeconds=quantiles(durations), radiusGrowth=quantiles(growth),
                radiusRatePerCardWidthPerSecond=quantiles(rates),
                radiusAccelerationPerCardWidthPerSecondSquared=quantiles(acceleration),
                radiusQuadraticResidualPerCardWidth=quantiles(residuals),
                deceleratingGrowthTracks=sum(value < -.01 for value in acceleration),
                detectedCount=quantiles(counts), outwardTracks=sum(int(v @ (p[-1]-origin) > 0) for p, v in flows),
                fittedOriginPixels=origin.tolist(), tracks=retained)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference", type=Path)
    parser.add_argument("production", type=Path)
    parser.add_argument("--reference-width", type=float, default=650)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    reference, production = json.loads(args.reference.read_text()), json.loads(args.production.read_text())
    ref = analyze(reference["frames"], args.reference_width)
    cur = analyze(production["frames"], production["registration"]["cardWidthPixels"])
    errors = {key: float(np.mean(np.abs(np.array(ref[key])-cur[key]))) for key in
              ["speedPerCardWidthPerSecond", "visibleSeconds", "radiusGrowth",
               "radiusRatePerCardWidthPerSecond", "radiusAccelerationPerCardWidthPerSecondSquared"] if ref[key] and cur[key]}
    result = dict(schema="cardscape-emblem-temporal-comparison/1", version=production.get("version"),
                  renderer=production.get("renderer", "WebGL production particle shaders"),
                  growthProfile=production.get("growthProfile"),
                  reference={k: v for k, v in ref.items() if k != "tracks"},
                  production={k: v for k, v in cur.items() if k != "tracks"}, absoluteQuantileErrors=errors,
                  referenceInput=str(args.reference), productionInput=str(args.production),
                  accepted1to1=False, fullGameCycleVerified=False,
                  caveats=["Nearest-neighbor tracks can misassociate overlapping emblems.",
                           "Visibility windows are not lifetimes. Source card width is approximate.",
                           "Background, clipping and occlusion differ. Source WebP speed may differ from the game."],
                  productionTracks=cur["tracks"])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2)+"\n")
    print(json.dumps({k: result[k] for k in ["version", "reference", "production", "absoluteQuantileErrors"]}))


if __name__ == "__main__":
    main()
