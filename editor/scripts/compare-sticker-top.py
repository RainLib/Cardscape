"""Fixed top-region comparison; public pixels remain inspection-only data."""
from pathlib import Path
from PIL import Image, ImageDraw
import base64, io, json, sys
import numpy as np

root = Path(sys.argv[1]).resolve()
scale = 690 / 1024
box = (375, 48, 620, 108)
numbers = [0, 12, 24, 36, 48, 60, 74]
times = [0, .33, .69, 1.05, 1.41, 1.77, 2.19]
timing_file = root / 'reference-frame-times.json'
if timing_file.exists():
    timeline = json.loads(timing_file.read_text())
    records = timeline['frames'] if isinstance(timeline, dict) else timeline
    times = [next(f.get('time', f.get('timeMs', 0) / 1000) for f in records if f['frame'] == number) for number in numbers]

def gpu(name):
    data = json.loads((root / name).read_text())
    result = {}
    for f in data['frames']:
        if f['yaw'] or f['pitch'] or f['speed'] == 0:
            continue
        im = Image.open(io.BytesIO(base64.b64decode(f['png'].split(',')[1]))).convert('RGBA')
        registered = Image.new('RGBA', (820, 1100))
        registered.paste(im.resize((round(im.width * scale), round(im.height * scale)), Image.Resampling.LANCZOS),
                         (round(70 - data['margin'] * scale), round(124 - data['margin'] * scale)))
        result[f['time']] = registered
    return result

def rgb(im):
    data = np.asarray(im).astype(float)
    return data[:, :, :3] * data[:, :, 3:] / 255

def bright(v):
    return (v[:, :, 1] > 95) & (v[:, :, 0] > .3 * v[:, :, 1]) & (v[:, :, 0] < 1.2 * v[:, :, 1]) & (v[:, :, 2] < .35 * v[:, :, 1])

before, after = gpu('before-gpu-frames.json'), gpu('gpu-frames.json')
samples = []
sheet = Image.new('RGB', (2070, 7 * 170), '#11191e')
draw = ImageDraw.Draw(sheet)
for row, (number, time) in enumerate(zip(numbers, times)):
    reference = Image.open(root / f'reference-{number}.png').convert('RGBA')
    target_rgb = rgb(reference.crop(box))
    target = bright(target_rgb)
    sample = {'time': time, 'referencePixels': int(target.sum())}
    for column, (label, im) in enumerate([('reference', reference), ('before', before[time]), ('after', after[time])]):
        tile = im.crop((70, 0, 760, 140))
        background = Image.new('RGB', tile.size, '#080d11')
        background.paste(tile, mask=tile.getchannel('A'))
        sheet.paste(background, (column * 690, row * 170 + 25))
        draw.text((column * 690 + 8, row * 170 + 5), f'{label} {time}s', fill='white')
        if column == 0:
            continue
        values = rgb(im.crop(box))
        candidate = bright(values)
        intersection = int((candidate & target).sum())
        union = int((candidate | target).sum())
        sample[label] = {
            'RGBError': round(float(np.abs(values - target_rgb).mean()), 3),
            'referenceMaskRGBError': round(float(np.abs(values - target_rgb)[target].mean()), 3),
            'intersectionPixels': intersection, 'unionPixels': union,
            'missingPixels': int((target & ~candidate).sum()), 'extraPixels': int((candidate & ~target).sum()),
            'iou': round(intersection / union, 6) if union else None,
        }
    samples.append(sample)
sheet.save(root / 'reference-before-after-top.png')
pooled = {}
for label in ['before', 'after']:
    data = {k: sum(s[label][k] for s in samples) for k in ['intersectionPixels', 'unionPixels', 'missingPixels', 'extraPixels']}
    data['iou'] = round(data['intersectionPixels'] / data['unionPixels'], 6)
    data['meanRGBError'] = round(sum(s[label]['RGBError'] for s in samples) / len(samples), 3)
    data['weightedReferenceMaskRGBError'] = round(sum(s[label]['referenceMaskRGBError'] * s['referencePixels'] for s in samples) / sum(s['referencePixels'] for s in samples), 3)
    pooled[label] = data
report = {
    'schema': 'cardscape-sticker-top-comparison/1', 'accepted1to1': False,
    'registration': {'origin': [70, 124], 'cardWidth': 690, 'scale': scale}, 'region': box,
    'samples': samples, 'pooled': pooled,
    'limitations': [
        'A fixed, mostly unoccluded top window. Not a full border or complete game-loop measurement.',
        'Brightness segmentation combines all species in the region; individual spider/bone fidelity requires separate review.',
        'No per-frame pose, color adjustment or reference pixels are used by the renderer.',
        'Reference includes its own occluders, lighting and compressed preview pixels.',
    ],
}
(root / 'top-region-comparison.json').write_text(json.dumps(report, indent=2))
print(json.dumps({'region': box, 'pooled': pooled, 'samples': [{'time': s['time'], 'beforeIoU': s['before']['iou'], 'afterIoU': s['after']['iou']} for s in samples]}))
