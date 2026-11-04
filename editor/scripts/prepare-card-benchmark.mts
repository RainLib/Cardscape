import { readFile, writeFile, copyFile, cp, mkdir } from 'node:fs/promises';
import { resolve, dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import type { CardDocument } from '../shared/document';
import type { AssetManifest } from '../shared/export';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = JSON.parse(
  await readFile(
    join(root, 'qa/production-readiness/arcane-sentinel/last-run.json'),
    'utf8',
  ),
) as { project: string; directory: string };
const doc = JSON.parse(await readFile(run.project, 'utf8')) as CardDocument;
const manifest = JSON.parse(
  await readFile(join(run.directory, 'manifest.json'), 'utf8'),
) as AssetManifest;
if (!manifest.exportProfile)
  throw Error('Fixture needs published large/small texture variants');
const textureAssets = {
  profile: manifest.exportProfile,
  layers: Object.fromEntries(
    manifest.layers
      .filter((layer) => layer.asset)
      .map((layer) => [layer.id, layer.asset!]),
  ),
  back: manifest.backAsset || undefined,
};
const output = join(root, 'qa/device-benchmark', 'run-' + Date.now());
await mkdir(output, { recursive: true });
const textAssets: Record<string, string> = {};
for (const layer of manifest.layers)
  if (layer.kind === 'text' && layer.asset) {
    const bytes = await readFile(join(run.directory, layer.asset));
    textAssets[layer.id] =
      'data:image/' +
      (layer.asset.endsWith('.webp') ? 'webp' : 'png') +
      ';base64,' +
      bytes.toString('base64');
  }
await writeFile(
  join(output, 'fixture.json'),
  JSON.stringify({ doc, textAssets, textureAssets }),
);
const assetHashes: Record<string, string> = {};
const pictureFiles = new Set([
  ...Object.values(textureAssets.layers),
  ...(textureAssets.back ? [textureAssets.back] : []),
  ...Object.values(textureAssets.profile.textures).flatMap((variants) => [
    variants.large.asset,
    variants.small.asset,
  ]),
]);
for (const asset of pictureFiles) {
  const target = resolve(output, asset);
  if (!target.startsWith(output + sep))
    throw Error('Benchmark asset escapes its package');
  await mkdir(dirname(target), { recursive: true });
  const bytes = await readFile(resolve(run.directory, asset));
  await writeFile(target, bytes);
  assetHashes[asset] = createHash('sha256').update(bytes).digest('hex');
}
const html = await readFile(join(root, 'dist/renderer/player.html'), 'utf8');
const modules = [...html.matchAll(/<script defer src="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((n) => n !== 'player.js');
const hashes: Record<string, string> = {};
for (const name of modules) {
  await copyFile(join(root, 'dist/renderer', name), join(output, name));
  hashes[name] = createHash('sha256')
    .update(await readFile(join(output, name)))
    .digest('hex');
}
await cp(join(run.directory, 'licenses'), join(output, 'licenses'), {
  recursive: true,
});
await build({
  entryPoints: [join(root, 'scripts/card-benchmark-client.mts')],
  outfile: join(output, 'benchmark.js'),
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'esm',
});
await writeFile(
  join(output, 'index.html'),
  `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' data: blob:; object-src 'none'"><title>Cardscape 真机压力测试</title><link rel="stylesheet" href="benchmark.css">${modules.map((n) => '<script defer src="' + n + '"></script>').join('')}<script type="module" src="benchmark.js"></script></head><body data-app-mode="editor"><header><h1>卡牌压力测试</h1><p>使用星炉哨卫真实拆层原画。保持屏幕常亮、本页在前台。自动模式按卡牌屏幕尺寸切换导出贴图和特效；可选择原图或固定清晰度作对照。</p><label>卡牌数量 <select id="count"><option>1</option><option>4</option><option>8</option><option>16</option></select></label><label>动作 <select id="action"><option value="alternating">横斩／施法交替</option><option value="world-cast">世界空间粒子</option><option value="collision-cast">平面碰撞粒子</option></select></label><label>贴图 <select id="textures"><option value="adaptive" selected>自动</option><option value="source">完整原图</option><option value="large">导出高清</option><option value="small">导出小图（保留特效）</option></select></label><label>质量 <select id="quality"><option value="low">省电</option><option value="balanced" selected>均衡</option><option value="high">精细</option></select></label><label>时长 <select id="duration"><option value="8">8 秒</option><option value="60">1 分钟</option><option value="600">10 分钟</option></select></label><label><input id="audio" type="checkbox">播放动作音效</label><label><input id="transitions" type="checkbox">结束后检查贴图切换</label><button id="run">开始测试</button><button id="stop" disabled>停止并释放</button><button id="save" disabled>保存 JSON 结果</button><p id="status" role="status">准备就绪。首次编译可能需要等待。</p></header><canvas id="model-canvas" hidden></canvas><span id="model-info" hidden></span><main></main><img id="capture" hidden alt="本次实际渲染的卡牌"><details><summary>完整记录</summary><pre id="results"></pre></details></body></html>`,
);
await writeFile(
  join(output, 'benchmark.css'),
  '[hidden]{display:none!important}body{margin:12px;background:#121821;color:#e8edf4;font:15px system-ui}h1{font-size:22px}p{max-width:76ch;color:#b5c1ce;line-height:1.5}label{display:inline-flex;gap:8px;margin:8px 16px 8px 0;align-items:center}button,select{padding:9px;background:#253749;color:inherit;border:1px solid #63788d;border-radius:5px}button{margin:8px 10px 8px 0;cursor:pointer}button:disabled{opacity:.5}main{overflow:hidden;max-width:100%}main canvas,#capture{display:block;max-width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}#model-canvas,#author-model-canvas{display:none}',
);
const index = {
  output,
  fixture: run.project,
  runtimeSha256: hashes,
  assetSha256: assetHashes,
  deviceAcceptance: 'pending actual target-device execution',
};
await writeFile(
  join(output, 'provenance.json'),
  JSON.stringify(index, null, 2),
);
await writeFile(
  join(root, 'qa/device-benchmark/last-run.json'),
  JSON.stringify(index, null, 2),
);
console.log('DEVICE_BENCHMARK_PREPARED', output);
