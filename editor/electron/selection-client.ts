import path from 'node:path';
import fs from 'node:fs';
import { NativeWorker } from './native-client';
import { nativeAiSource } from './paths';
export class SelectionWorker extends NativeWorker {
  constructor(dataDirectory = nativeAiSource) {
    const windows = process.platform === 'win32';
    const local = path.join(
      dataDirectory,
      '.venv',
      windows ? 'Scripts/python.exe' : 'bin/python',
    );
    const python = windows ? 'python' : 'python3';
    super(
      process.env.ATELIER_PYTHON || (fs.existsSync(local) ? local : python),
      {
        args: ['-u', path.join(nativeAiSource, 'selection_worker.py'), dataDirectory],
        label: '智能选区',
      },
    );
  }
}
