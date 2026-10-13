"""Fixed reference registration, without per-frame motion or color fitting."""
from pathlib import Path
from PIL import Image, ImageDraw
import base64, io, json
import numpy as np

root = Path(__file__).resolve().parents[1] / 'outputs/candy-v63'
registration = {'origin': [67, 125], 'width': 693, 'scale': 693 / 1024}
regions = {'left-core': (74, 250, 91, 580), 'top-core': (538, 131, 623, 148)}

def read(name):
    data = json.loads((root / name).read_text())
    for frame in data['frames']:
        frame['image'] = Image.open(io.BytesIO(base64.b64decode(frame['png'].split(',')[1]))).convert('RGBA')
    return data

def registered(data, frame):
    source = frame['image']
    scale = registration['scale']
    sprite = source.resize((round(source.width * scale), round(source.height * scale)), Image.Resampling.LANCZOS)
    result = Image.new('RGBA', (820, 1100))
    result.paste(sprite, tuple(round(x - data['margin'] * scale) for x in registration['origin']))
    return result

def visible(image):
    data = np.asarray(image).astype(float)
    return data[:, :, :3] * data[:, :, 3:] / 255

first, current = read('iteration-1-gpu-frames.json'), read('gpu-frames.json')
samples = []
for n, time in zip([0, 13, 26, 39, 52, 65, 75], [0, .39, .78, 1.17, 1.56, 1.95, 2.25]):
    reference = Image.open(root / f'BorderCandyCane_Halloween-{n}.png').convert('RGBA')
    for label, data in [('iteration1', first), ('current', current)]:
        frame = next(f for f in data['frames'] if f['time'] == time and f['yaw'] == 0 and f['pitch'] == 0 and f['speed'] > 0)
        candidate = registered(data, frame)
        for name, box in regions.items():
            # Exclude antialiased boundary pixels and underlying card art.
            mask = np.asarray(candidate.crop(box))[:, :, 3] > 254
            ref, val = visible(reference.crop(box)), visible(candidate.crop(box))
            samples.append({'implementation': label, 'time': time, 'region': name, 'pixels': int(mask.sum()), 'meanAbsoluteRGBError': round(float(np.abs(ref - val)[mask].mean()), 3)})

frames = current['frames']
def different(a, b):
    return int(np.any(np.asarray(a['image']) != np.asarray(b['image']), axis=2).sum())
view_delta = np.any(np.abs(visible(frames[0]['image']) - visible(frames[7]['image'])) > .5, axis=2)
margin = current['margin']
center = np.asarray(frames[0]['image'])[margin + 200:margin + 1336, margin + 150:margin + 874, 3]
outside = np.asarray(frames[0]['image'])[:, :, 3].copy()
outside[margin:margin + 1536, margin:margin + 1024] = 0
outside_limit = outside.copy()
outside_limit[max(0, margin - 88):margin + 1624, max(0, margin - 88):margin + 1112] = 0
motion = {'staticTimeDifferentPixels': different(frames[0], frames[2]), 'viewChangedVisiblePixels': int(view_delta.sum()), 'zeroSpeedDifferentPixels': different(frames[-2], frames[-1]), 'centerVisiblePixels': int(np.count_nonzero(center)), 'outsideVisiblePixels': int(np.count_nonzero(outside)), 'outsideLimitPixels': int(np.count_nonzero(outside_limit))}
sheet = Image.new('RGB', (870, 700), '#141a21')
draw = ImageDraw.Draw(sheet)
for i, (label, source) in enumerate([('reference', Image.open(root / 'BorderCandyCane_Halloween-0.png').convert('RGBA')), ('iteration1', registered(first, first['frames'][0])), ('current', registered(current, frames[0]))]):
    crop = source.crop((50, 240, 115, 580)).resize((130, 680))
    sheet.paste(crop, (i * 290 + 35, 20), crop)
    draw.text((i * 290 + 20, 3), label, fill='white')
sheet.save(root / 'reference-current-stripes.png')
means = {label: {region: round(float(np.mean([s['meanAbsoluteRGBError'] for s in samples if s['implementation'] == label and s['region'] == region])), 3) for region in regions} for label in ['iteration1', 'current']}
report = {'schema': 'cardscape-candy-region-comparison/1', 'accepted1to1': False, 'registration': registration, 'regions': regions, 'samples': samples, 'regionalMeanErrors': means, 'motion': motion, 'glErrors': [f['glError'] for f in frames], 'caveats': ['The reference card moves; regional changes do not isolate shader clock animation.', 'Static band layout is based on the inspected short preview, not full-game motion acceptance.', 'No per-frame registration, color or phase fitting.', 'Strip topology, silhouette and full game loop remain unverified.']}
(root / 'region-comparison.json').write_text(json.dumps(report, indent=2))
print(json.dumps({'means': means, 'motion': motion, 'glErrors': report['glErrors']}))
