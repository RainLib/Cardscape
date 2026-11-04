import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const host =
  process.argv.find((a) => a.startsWith('--host='))?.slice(7) || '127.0.0.1';
const port = Number(
  process.argv.find((a) => a.startsWith('--port='))?.slice(7) || 8788,
);
if (
  !['127.0.0.1', '0.0.0.0'].includes(host) ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535
)
  throw Error('Invalid benchmark address');
const { output } = JSON.parse(
  await readFile(join(root, 'qa/device-benchmark/last-run.json'), 'utf8'),
) as { output: string };
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
        new URL(req.url || '/', 'http://localhost').pathname,
      ),
      file = resolve(
        output,
        '.' + (pathname === '/' ? '/index.html' : pathname),
      );
    if (!file.startsWith(output + sep)) throw Error('Outside benchmark');
    const mime: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    res.setHeader(
      'Content-Type',
      mime[extname(file)] || 'application/octet-stream',
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(port, host, () =>
  console.log(
    `Device benchmark: http://${host}:${port}/ ; Ctrl+C stops the local server`,
  ),
);
