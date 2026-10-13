"""Compare all captured frames with the decoded reference clock and fixed top ROI."""
from pathlib import Path
from PIL import Image, ImageDraw
import argparse, base64, hashlib, io, json
import numpy as np

parser = argparse.ArgumentParser(description='Compare all 75 registered sticker frames in one fixed region.')
parser.add_argument('directory')
parser.add_argument('--region', default='375,48,620,108', help='Reference-pixel x0,y0,x1,y1')
parser.add_argument('--label', default='sequence', help='Output label; letters, digits and hyphens only')
args = parser.parse_args()
root = Path(args.directory).resolve()
box = tuple(int(n) for n in args.region.split(','))
assert len(box) == 4 and 0 <= box[0] < box[2] <= 820 and 0 <= box[1] < box[3] <= 124
assert args.label and all(c.isascii() and (c.isalnum() or c == '-') for c in args.label)
data = json.loads((root / 'sequence-top-gpu-frames.json').read_text())
timeline = json.loads((root / 'reference-frame-times.json').read_text())
assert timeline['loadBeforeInfo'] is True and len(timeline['frames']) == 75
assert data['timing'] == timeline
source_hashes = data.get('sourceHashes')
if source_hashes:
    assert set(source_hashes) == {'before', 'after'}
    assert all(len(h) == 64 and all(c in '0123456789abcdef' for c in h) for h in source_hashes.values())
    assert source_hashes['before'] == hashlib.sha256((root / 'before-shared.glsl').read_bytes()).hexdigest()
scale = 690 / 1024

def pixels(image):
    a = np.asarray(image.convert('RGBA')).astype(float)
    return a[:, :, :3] * a[:, :, 3:] / 255

def bright(a):
    return (a[:, :, 1] > 95) & (a[:, :, 0] > .3 * a[:, :, 1]) & (a[:, :, 0] < 1.2 * a[:, :, 1]) & (a[:, :, 2] < .35 * a[:, :, 1])

def load_frame(f):
    assert f['glError'] == 0
    return Image.open(io.BytesIO(base64.b64decode(f['png'].split(',')[1]))).convert('RGBA')

def registered(f):
    image = load_frame(f)
    assert image.size == (1408, 192)
    result = Image.new('RGBA', (820, 1100))
    result.paste(image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS),
                 (round(70 - data['margin'] * scale), round(124 - data['margin'] * scale)))
    return result

samples = []
for version in data['versions'].values():
    assert len(version['frames']) == 75
for index, clock in enumerate(timeline['frames']):
    reference = pixels(Image.open(root / f'reference-{index}.png').crop(box))
    target = bright(reference)
    sample = {'frame': index, 'time': clock['time'], 'referencePixels': int(target.sum())}
    for name, version in data['versions'].items():
        frame = version['frames'][index]
        assert frame['referenceFrame'] == index and frame['time'] == clock['time']
        values = pixels(registered(frame).crop(box))
        candidate = bright(values)
        intersection, union = int((candidate & target).sum()), int((candidate | target).sum())
        sample[name] = {
            'intersectionPixels': intersection, 'unionPixels': union,
            'missingPixels': int((target & ~candidate).sum()), 'extraPixels': int((candidate & ~target).sum()),
            'iou': intersection / union if union else None,
            'RGBError': float(np.abs(values - reference).mean()),
            'referenceMaskRGBError': float(np.abs(values - reference)[target].mean()) if target.any() else None,
        }
    samples.append(sample)

def pooled(records):
    result = {}
    for name in ['before', 'after']:
        counts = {k: sum(s[name][k] for s in records) for k in ['intersectionPixels', 'unionPixels', 'missingPixels', 'extraPixels']}
        counts['iou'] = counts['intersectionPixels'] / counts['unionPixels']
        counts['meanRGBError'] = sum(s[name]['RGBError'] for s in records) / len(records)
        counts['weightedReferenceMaskRGBError'] = sum((s[name]['referenceMaskRGBError'] or 0) * s['referencePixels'] for s in records) / sum(s['referencePixels'] for s in records)
        result[name] = counts
    return result

calibration_file = root / 'calibration-frames.json'
anchors = json.loads(calibration_file.read_text()) if calibration_file.exists() else [0, 12, 24]
assert isinstance(anchors, list) and all(isinstance(n, int) and 0 <= n < len(samples) for n in anchors)
heldout = [s for s in samples if s['frame'] not in anchors]
regressions = [s['frame'] for s in samples if s['after']['iou'] < s['before']['iou']]
full = {name: json.loads((root / f'full-{name}-gpu-frames.json').read_text()) for name in ['before', 'after']}
scope = []
for before, after in zip(full['before']['frames'], full['after']['frames']):
    assert [before[k] for k in ['time', 'yaw', 'pitch', 'speed']] == [after[k] for k in ['time', 'yaw', 'pitch', 'speed']]
    b, a = np.asarray(load_frame(before)), np.asarray(load_frame(after))
    diff = abs(a.astype(int) - b.astype(int))[data['margin']:]
    alpha = a[:, :, 3].copy()
    m = data['margin']
    alpha[m-144:m+1536+144, m-144:m+1024+144] = 0
    scope.append({'time': after['time'], 'yaw': after['yaw'], 'pitch': after['pitch'], 'speed': after['speed'],
                  'glError': after['glError'], 'nonTopDifferentPixels': int(np.any(diff != 0, axis=2).sum()),
                  'nonTopMaxChannelDifference': int(diff.max()), 'outside144Pixels': int(np.count_nonzero(alpha)),
                  'centerVisiblePixels': int(np.count_nonzero(a[m+200:m+1336, m+150:m+874, 3]))})
paused = full['after']['frames'][9:11]
assert all(f['speed'] == 0 for f in paused)
paused_diff = int(np.any(np.asarray(load_frame(paused[0])) != np.asarray(load_frame(paused[1])), axis=2).sum())
report = {'schema': 'cardscape-sticker-sequence-comparison/2', 'accepted1to1': False,
          'sourceHashes': source_hashes,
          'clock': timeline, 'region': box, 'registration': {'origin': [70, 124], 'cardWidth': 690, 'scale': scale},
          'all75': pooled(samples), 'calibrationAnchors': anchors,
          'visualReviewComplement': {'frames': len(heldout), 'comparison': pooled(heldout)},
          'regressedFrames': regressions, 'samples': samples, 'scopeRegression': scope,
          'zeroSpeedDifferentPixels': paused_diff,
          'limits': ['The complement excludes declared visual calibration frames. Aggregate and per-frame metrics informed iterative changes, so this is not a blind holdout or independent game footage.',
                     'Brightness masks combine species and compressed/occluded reference pixels; not silhouette or whole-card acceptance.',
                     'The 2.25-second exported preview is not evidence of the full in-game lifetime or loop.',
                     'All versions use one registration, clock and color threshold; no reference pixels are runtime assets.']}
(root / (args.label + '-comparison.json')).write_text(json.dumps(report, indent=2))
print(json.dumps({k: report[k] for k in ['all75', 'visualReviewComplement', 'regressedFrames', 'zeroSpeedDifferentPixels']}))
