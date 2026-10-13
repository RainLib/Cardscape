"""Visible rim/spray measurements from real WebGL frames, not 1:1 acceptance."""
import base64
import io
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

directory = Path(__file__).resolve().parent.parent / 'outputs/pax-v61'
capture = json.loads((directory / 'gpu-frames.json').read_text())
frames = {}
for item in capture['frames']:
    image = Image.open(io.BytesIO(base64.b64decode(item['png'].split(',', 1)[1]))).convert('RGBA')
    frames[(item['mode'], item['time'], item['speed'])] = np.asarray(image)
    image.save(directory / f"mode-{item['mode']}-{item['time']}-{item['speed']}.png")

def visible(rgba):
    return rgba[:, :, :3].astype(float)*rgba[:, :, 3:4]/255

motion = []
for mode in range(3):
    a, b = frames[(mode, 0, 1)], frames[(mode, .78, 1)]
    zero_a, zero_b = frames[(mode, 0, 0)], frames[(mode, 100, 0)]
    motion.append({'mode': mode,
                   'visibleRGBChangedPixels': int(np.any(abs(visible(a)-visible(b))>.5, axis=2).sum()),
                   'alphaChangedPixels': int((a[:, :, 3]!=b[:, :, 3]).sum()),
                   'zeroSpeedDifferentPixels': int(np.any(zero_a!=zero_b, axis=2).sum())})
    assert np.array_equal(zero_a, zero_b), 'Zero speed must freeze both print and dust'

# Same cut-corner distance as the rendered material; check emitted support,
# independently from its brightness/color. Do not count RGB under Alpha zero.
y, x = np.indices((1712, 1200))
px, py = (x+.5-88)/1024, (y+.5-88)/1024
qx, qy = abs(px-.5), abs(py-.75)
distance = np.minimum(np.minimum(.5-qx, .75-qy), (1.25-48/1024-qx-qy)*2**-.5)
spray = frames[(2, 0, 1)][:, :, 3]
outside_limit = int(((distance<-.0851)&(spray>0)).sum())
inside = int(((distance>.0001)&(spray>0)).sum())
assert outside_limit == 0 and inside == 0, 'Dust must stay outside and close to the frame'

regions = {'left-print': (74, 530, 96, 810), 'right-print': (744, 540, 767, 970),
           'left-upper-spray': (25, 470, 73, 620), 'left-lower-spray': (25, 820, 73, 970),
           'right-spray': (773, 720, 820, 950), 'top-spray': (568, 62, 627, 110)}
samples = []
scale = 680/1024
sheet = Image.new('RGB', (7*136, 270), '#12171d')
draw = ImageDraw.Draw(sheet)
for column, time in enumerate([0, .39, .78, 1.17, 1.56, 1.95, 2.25]):
    reference = np.asarray(Image.open(directory / f'reference-{round(time/.03)}.png').convert('RGB')).astype(float)
    rgba = Image.fromarray(frames[(0, time, 1)])
    projected = rgba.resize((round(1200*scale), round(1712*scale)), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (820, 1200), (0, 0, 0, 255))
    canvas.alpha_composite(projected, (round(74-88*scale), round(118-88*scale)))
    candidate = np.asarray(canvas.convert('RGB')).astype(float)
    for key, (x0, y0, x1, y1) in regions.items():
        ref, cur = reference[y0:y1, x0:x1], candidate[y0:y1, x0:x1]
        samples.append({'region': key, 'time': time, 'meanAbsoluteRGBError': round(float(abs(ref-cur).mean()), 3),
                        'referenceMeanRGB': ref.mean(axis=(0, 1)).round(2).tolist(), 'candidateMeanRGB': cur.mean(axis=(0, 1)).round(2).tolist()})
    draw.text((column*136, 3), f'{time:.2f}s', fill='white')
    box = regions['left-upper-spray']
    sheet.paste(Image.fromarray(reference.astype('uint8')).crop(box).resize((62, 230)), (column*136, 26))
    sheet.paste(Image.fromarray(candidate.astype('uint8')).crop(box).resize((62, 230)), (column*136+68, 26))
sheet.save(directory / 'reference-current-spray.png')
report = {'schema': 'cardscape-pax-region-comparison/1', 'accepted1to1': False, 'motion': motion,
          'outsideLimitVisiblePixels': outside_limit, 'insideCardSprayPixels': inside,
          'maxOutsideCardWidths': .0851, 'projectedWidthPixels': 680, 'uniformScale': scale,
          'referenceOrigin': [74, 118], 'regions': regions, 'samples': samples,
          'glErrors': [f['glError'] for f in capture['frames']],
          'caveats': ['New implementation, no previous PAX implementation to compare.',
                      'Approximate reference camera registration; no per-frame color/phase fitting.',
                      'Short preview is not a verified full game loop; printed logo fragments and timing still need calibration.']}
(directory / 'region-comparison.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({'motion': motion, 'outsideLimitVisiblePixels': outside_limit, 'insideCardSprayPixels': inside,
                  'meanRegionRGBError': {key: round(float(np.mean([s['meanAbsoluteRGBError'] for s in samples if s['region']==key])), 3) for key in regions}}, indent=2))
