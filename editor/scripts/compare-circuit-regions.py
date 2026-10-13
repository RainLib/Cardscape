"""Exposed public-preview regions only. Not whole-card or motion fidelity acceptance."""
import base64
import io
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, distance_transform_edt

root = Path(__file__).resolve().parent.parent / 'outputs/circuits-v58'
reference = np.asarray(Image.open(root / 'reference-26.png').convert('RGB')).astype(float)
capture = json.loads((root / 'gpu-frames.json').read_text())
regions = {'top_bus': (285, 100, 380, 232), 'left_bus': (113, 535, 248, 626),
           'right_bus': (640, 235, 736, 318)}
frames = {}
for f in capture['frames']:
    rgb = np.asarray(Image.open(io.BytesIO(base64.b64decode(f['png'].split(',')[1]))).convert('RGB'))
    frames[(f['key'], f['style'], f['time'], f['yaw'], f['routes'])] = rgb
    Image.fromarray(rgb).save(root / f"{f['key']}-{f['style']}-{f['time']}-{f['yaw']}-{'routes' if f['routes'] else 'color'}.png")

# A green/cyan positive ridge against its local neighborhood. It cannot recover hidden traces.
color_contrast = reference[:, :, 1] - reference[:, :, 0]
ref_wire = (color_contrast - gaussian_filter(color_contrast, 2) > 4) & (color_contrast > 10)
report = {'schema': 'cardscape-circuit-region-comparison/1', 'accepted1to1': False,
          'regions': regions, 'thresholds': {'referenceLocalGreenRidge': 4, 'referenceGreenMinusRed': 10,
                                          'candidateWireWeight': .3, 'distanceTolerancePixels': 4},
          'samples': [], 'motion': [], 'glassRegression': [],
          'caveats': ['Three exposed regions with approximate front-view registration only.',
                      'Reference ridges are inferred from local color; candidate masks are shader weights.',
                      'Source lighting, foreground and camera differences bias the measure.',
                      'Static captures are not a full game motion loop or all-angle fidelity score.']}
ox, oy = capture['origin']
for key in ['baseline', 'current']:
    color = frames[(key, 25, .78, 0, False)].astype(float)
    weight = frames[(key, 25, .78, 0, True)][:, :, 0] > 255*.3
    for name, (x0,y0,x1,y1) in regions.items():
        ref = ref_wire[y0:y1,x0:x1]
        candidate = weight[y0-oy:y1-oy,x0-ox:x1-ox]
        rd = distance_transform_edt(~ref)
        cd = distance_transform_edt(~candidate)
        precision = float((rd[candidate] <= 4).mean()) if candidate.any() else 0
        recall = float((cd[ref] <= 4).mean()) if candidate.any() and ref.any() else 0
        f1 = 2*precision*recall/(precision+recall) if precision+recall else 0
        report['samples'].append({'key':key, 'region':name, 'referenceRidgePixels':int(ref.sum()),
            'candidateWirePixels':int(candidate.sum()), 'precisionWithin4px':precision,
            'recallWithin4px':recall, 'f1Within4px':f1,
            'meanRGBAbsoluteError':float(abs(color[y0-oy:y1-oy,x0-ox:x1-ox]-reference[y0:y1,x0:x1]).mean())})
        overlay = np.zeros((*ref.shape,3), dtype=np.uint8)
        overlay[ref] = [250,80,50]
        overlay[candidate] += np.array([0,100,150],dtype=np.uint8)
        Image.fromarray(overlay).resize((ref.shape[1]*3,ref.shape[0]*3)).save(root/f'{key}-{name}-overlay.png')
    a = frames[(key,25,.78,0,False)]
    b = frames[(key,25,1.5,0,False)]
    t = frames[(key,25,.78,.3,False)]
    wa = frames[(key,25,.78,0,True)]
    wb = frames[(key,25,1.5,.3,True)]
    report['motion'].append({'key':key, 'timeDifferentPixels':int(np.any(a!=b,axis=2).sum()),
        'viewDifferentPixels':int(np.any(a!=t,axis=2).sum()),
        'routingTimeAndViewDifferentPixels':int(np.any(wa!=wb,axis=2).sum())})
for time, yaw in [(.78,0),(1.5,.3)]:
    a = frames[('baseline',21,time,yaw,False)]
    b = frames[('current',21,time,yaw,False)]
    report['glassRegression'].append({'time':time,'yaw':yaw,'differentPixels':int(np.any(a!=b,axis=2).sum())})
report['glErrors'] = [f['glError'] for f in capture['frames']]
assert all(n['routingTimeAndViewDifferentPixels']==0 for n in report['motion'])
assert all(n['timeDifferentPixels']>0 and n['viewDifferentPixels']>0 for n in report['motion'])
assert all(n['differentPixels']==0 for n in report['glassRegression'])
assert not any(report['glErrors'])
(root/'region-comparison.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
