import path from 'node:path';
import fs from 'node:fs';
import { NativeWorker } from './native-client';
import { ROOT } from './paths';
export class CutoutWorker extends NativeWorker {
  constructor() {
    const local = path.join(
      ROOT,
      'native-ai/.venv-cutout',
      process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
    );
    super(
      process.env.ATELIER_CUTOUT_PYTHON ||
        (fs.existsSync(local) ? local : 'python3'),
      {
        args: ['-u', path.join(ROOT, 'native-ai/cutout_worker.py')],
        label: '本地抠图',
      },
    );
  }
}
