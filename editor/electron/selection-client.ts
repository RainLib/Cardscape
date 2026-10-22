import path from 'node:path';
import fs from 'node:fs';
import { NativeWorker } from './native-client';
import { ROOT } from './paths';
export class SelectionWorker extends NativeWorker {
  constructor() {
    const local = path.join(
      ROOT,
      'native-ai/.venv',
      process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
    );
    super(
      process.env.ATELIER_PYTHON || (fs.existsSync(local) ? local : 'python3'),
      {
        args: ['-u', path.join(ROOT, 'native-ai/selection_worker.py')],
        label: '智能选区',
      },
    );
  }
}
