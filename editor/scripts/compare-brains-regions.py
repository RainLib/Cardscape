"""Fixed-registration local comparison; this does not establish full 1:1 acceptance."""
from pathlib import Path
from PIL import Image, ImageDraw
import base64, io, json
import numpy as np

root = Path(__file__).resolve().parents[1] / 'outputs/brains-v62'
regions = {'left-clear': (34, 290, 97, 596), 'left-bottom': (26, 730, 86, 894), 'top-clear': (296, 89, 446, 138)}
registration = {'origin': [35, 90], 'width': 744, 'scale': 744 / 1024}

def load(name):
    data = json.loads((root / name).read_text())
    for f in data['frames']:
        f['image'] = Image.open(io.BytesIO(base64.b64decode(f['png'].split(',')[1]))).convert('RGBA')
    return data

def visible(im):
    a = np.asarray(im).astype(float)
    return a[:, :, :3] * a[:, :, 3:] / 255

def registered(data, frame):
    margin = data['margin']
    art = frame['image'].crop((margin, margin, margin + 1024, margin + 1536))
    art = art.resize((744, round(1536 * registration['scale'])), Image.Resampling.LANCZOS)
    target = Image.new('RGBA', (820, 1100))
    target.paste(art, tuple(registration['origin']))
    return target

current = load('gpu-frames.json')
earlier = load('iteration-1-gpu-frames.json')
samples = []
for n, t in zip([0, 13, 26, 39, 52, 65, 75], [0, .39, .78, 1.17, 1.56, 1.95, 2.25]):
    reference = Image.open(root / f'reference-{n}.png').convert('RGBA')
    for label, data in [('iteration1', earlier), ('current', current)]:
        frame = next(f for f in data['frames'] if f['time'] == t and f['yaw'] == 0 and f['pitch'] == 0 and f['speed'] > 0)
        candidate = registered(data, frame)
        for name, box in regions.items():
            ref = visible(reference.crop(box))
            val = visible(candidate.crop(box))
            samples.append({'implementation': label, 'time': t, 'region': name, 'meanAbsoluteRGBError': round(float(np.abs(ref - val).mean()), 3), 'referenceMeanRGB': [round(float(x), 2) for x in ref.mean(axis=(0, 1))], 'candidateMeanRGB': [round(float(x), 2) for x in val.mean(axis=(0, 1))]})

front, later, tilted, still, frozen = current['frames'][0], current['frames'][2], current['frames'][7], current['frames'][-2], current['frames'][-1]
motion = {}
for label, frame in [('time', later), ('view', tilted)]:
    base = later if label == 'view' else front
    delta = np.abs(visible(base['image']) - visible(frame['image']))
    motion[label] = {'changedVisiblePixels': int(np.any(delta > .5, axis=2).sum()), 'changedOverTwoRGBLevels': int(np.any(delta > 2, axis=2).sum()), 'alphaChangedPixels': int(np.any(np.asarray(base['image'])[:, :, 3:] != np.asarray(frame['image'])[:, :, 3:], axis=2).sum())}
motion['zeroSpeedDifferentPixels'] = int(np.any(np.asarray(still['image']) != np.asarray(frozen['image']), axis=2).sum())

im = front['image']
im.save(root / 'candidate-front.png')
reference = Image.open(root / 'reference-0.png').convert('RGBA')
registered_current = registered(current, front)
sheet = Image.new('RGB', (756, 660), '#141a21')
d = ImageDraw.Draw(sheet)
for i, (label, source) in enumerate([('reference', reference), ('iteration1', registered(earlier, earlier['frames'][0])), ('current', registered_current)]):
    crop = source.crop(regions['left-clear'])
    crop = crop.resize((126, 612))
    sheet.paste(crop, (i * 252 + 24, 30), crop)
    d.text((i * 252 + 20, 9), label, fill='white')
sheet.save(root / 'reference-current-folds.png')
report = {'schema': 'cardscape-brains-region-comparison/1', 'accepted1to1': False, 'registration': registration, 'regions': regions, 'samples': samples, 'motion': motion, 'glErrors': [f['glError'] for f in current['frames']], 'caveats': ['New implementation; iteration1 is an earlier attempt, not a previous Brains product.', 'Approximate reference camera registration, fixed for all frames; no color or per-frame phase fitting.', 'The reference card moves; raw regional RGB delta does not isolate shader motion.', 'Fold topology, lighting, full game loop and phase remain unverified.']}
(root / 'region-comparison.json').write_text(json.dumps(report, indent=2))
means = {label: {region: round(float(np.mean([s['meanAbsoluteRGBError'] for s in samples if s['implementation'] == label and s['region'] == region])), 3) for region in regions} for label in ['iteration1', 'current']}
print(json.dumps({'motion': motion, 'regionalMeanErrors': means, 'glErrors': report['glErrors']}))
