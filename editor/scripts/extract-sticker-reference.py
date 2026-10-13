"""Decode an existing animated reference; load pixels before reading WebP frame timing."""
from pathlib import Path
from PIL import Image
import hashlib, json, sys

source, root = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
root.mkdir(parents=True, exist_ok=True)
records, elapsed = [], 0
with Image.open(source) as image:
    for number in range(image.n_frames):
        image.seek(number)
        image.load()
        duration = image.info.get('duration')
        if not isinstance(duration, (float, int)) or duration <= 0:
            raise ValueError(f'Missing or invalid duration at frame {number}: {duration}')
        records.append({'frame': number, 'time': elapsed / 1000, 'durationMs': duration})
        image.convert('RGBA').save(root / f'reference-{number}.png')
        elapsed += duration
report = {'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'frames': records,
          'totalDurationMs': elapsed, 'loadBeforeInfo': True}
(root / 'reference-frame-times.json').write_text(json.dumps(report, indent=2))
print(json.dumps({'frames': len(records), 'first': records[0], 'last': records[-1], 'totalDurationMs': elapsed}))
