"""Unobstructed local rim calibration, not a whole-card fidelity score."""
import base64
import io
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

directory = Path(__file__).resolve().parent.parent / 'outputs/refraction-v60'
capture = json.loads((directory / 'gpu-frames.json').read_text())
frames = {}
samples = []
width_scale = 680 / 1024
reference_region = (76, 470, 98, 990)
left, top = 76, 118
sheet = Image.new('RGB', (7 * 132, 440), '#12171d')
draw = ImageDraw.Draw(sheet)
for frame in capture['frames']:
    rgba = Image.open(io.BytesIO(base64.b64decode(frame['png'].split(',', 1)[1]))).convert('RGBA')
    frames[(frame['key'], frame['time'], frame['yaw'], frame['speed'])] = np.asarray(rgba)
    rgba.save(directory / f"{frame['key']}-{frame['time']}-{frame['yaw']}-{frame['speed']}.png")
    if frame['yaw'] or frame['speed'] == 0:
        continue
    # Fix one physical width scale and one frame origin for every time/preset.
    # Reference geometry/camera remain approximate; no phase or color fitting.
    projected = rgba.resize((round(1080 * width_scale), round(1592 * width_scale)), Image.Resampling.LANCZOS)
    stage = Image.new('RGBA', (820, 1200), (0, 0, 0, 255))
    stage.alpha_composite(projected, (round(left - 28 * width_scale), round(top - 28 * width_scale)))
    patch = np.asarray(stage.convert('RGB').crop(reference_region)).astype(float)
    index = round(frame['time'] / .03)
    reference = np.asarray(Image.open(directory / f'reference-{index}.png').convert('RGB').crop(reference_region)).astype(float)
    samples.append({'key': frame['key'], 'time': frame['time'], 'meanAbsoluteRGBError': round(float(np.abs(patch-reference).mean()), 3),
                    'referenceMeanRGB': reference.mean(axis=(0, 1)).round(2).tolist(), 'candidateMeanRGB': patch.mean(axis=(0, 1)).round(2).tolist(),
                    'meanProfileError': round(float(np.abs(patch.mean(axis=0)-reference.mean(axis=0)).mean()), 3)})
    if frame['key'] == 'current':
        column = [0, .39, .78, 1.17, 1.56, 1.95, 2.28].index(frame['time'])
        draw.text((column*132, 6), f"{frame['time']:.2f}s", fill='white')
        sheet.paste(Image.fromarray(reference.astype('uint8')).resize((44, 380)), (column*132, 28))
        sheet.paste(Image.fromarray(patch.astype('uint8')).resize((44, 380)), (column*132+52, 28))
sheet.save(directory / 'reference-current-motion.png')
motion = []
for key in ['baseline', 'current']:
    a = frames[(key, 0, 0, .55)]
    b = frames[(key, .78, 0, .55)]
    tilt = frames[(key, .78, .3, .55)]
    zero0 = frames[(key, 0, 0, 0)]
    zero100 = frames[(key, 100, 0, 0)]
    motion.append({'key': key, 'timeChangedRGBPixels': int(np.any(a[:, :, :3] != b[:, :, :3], axis=2).sum()),
                   'timeChangedAlphaPixels': int((a[:, :, 3] != b[:, :, 3]).sum()),
                   'viewChangedRGBPixels': int(np.any(b[:, :, :3] != tilt[:, :, :3], axis=2).sum()),
                   'viewChangedAlphaPixels': int((b[:, :, 3] != tilt[:, :, 3]).sum()),
                   'zeroSpeedDifferentPixels': int(np.any(zero0 != zero100, axis=2).sum())})
report = {'schema': 'cardscape-refraction-region-comparison/1', 'accepted1to1': False,
          'region': reference_region, 'projectedWidthPixels': 680, 'uniformScale': width_scale,
          'referenceOrigin': [left, top], 'samples': samples, 'motion': motion,
          'glErrors': [f['glError'] for f in capture['frames']],
          'caveats': ['Only one exposed left-rim strip; approximate reference camera registration.',
                      'Short 2.31 second reference is not a verified complete game cycle.',
                      'Motion clock phase, lighting and arbitrary view response are not matched.']}
(directory / 'region-comparison.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({'meanRGBError': {key: round(float(np.mean([s['meanAbsoluteRGBError'] for s in samples if s['key']==key])), 3) for key in ['baseline','current']}, 'motion': motion}, indent=2))
