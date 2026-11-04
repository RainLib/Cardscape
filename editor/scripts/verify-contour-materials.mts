import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from 'playwright';
import type { CardDocument } from '../shared/document';
/** Runs against the real exported player, including its actual shader compiler. */
export async function verifyContourMaterials(
  page: Page,
  doc: CardDocument,
  output: string,
) {
  // The production player does not ship the editor's 2D rasterizer. The QA-only
  // route serves that exact compiled module for the cross-renderer comparison.
  await page.addScriptTag({
    url: new URL('/qa-frame-raster.js', page.url()).href,
  });
  const glowProbes = [
    [400, 80],
    [758, 768],
    [198, 440],
    [207, 440],
    [250, 440],
    [842, 700],
    [998, 750],
  ];
  const result = await page.evaluate(
    ({ doc, glowProbes }) => {
      const preview = window.cardPreview,
        Frame = window.CardFrame,
        canvas = document.querySelector<HTMLCanvasElement>(
          '#author-model-canvas',
        )!,
        gl = canvas.getContext('webgl')!,
        style = Frame.resolve(doc),
        service = window.CardFrameRaster.createRenderer();
      const pixel = (x: number, y: number, z = 0.045) => {
        const fit = Math.min(1, canvas.width / canvas.height / 0.85),
          a = canvas.width / canvas.height,
          rgba = new Uint8Array(4);
        const p = ((x / 1024 - 0.5) * 2.9 * fit) / a / (2.7 - z),
          q = ((0.75 - y / 1024) * 2.9 * fit) / (2.7 - z);
        gl.readPixels(
          Math.round(((p + 1) * canvas.width) / 2),
          Math.round(((q + 1) * canvas.height) / 2),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          rgba,
        );
        return Array.from(rgba);
      };
      preview.setZoom(1);
      preview.pose(0, 0);
      preview.setRenderOverrides({
        layers: doc.layers.map((l) => ({ ...l, visible: l.kind === 'frame' })),
        particles: { ...doc.particles, enabled: false },
      });
      const variants: Record<string, string> = {},
        errors: string[] = [];
      for (const finish of Frame.finishes) {
        console.log('CONTOUR_MATERIAL_FINISH ' + finish);
        const variant = { ...style, finish };
        preview.setRenderOverrides({ frameStyle: variant });
        preview.playAction('idle', 0, true);
        preview.pose(0, 0);
        const raster = service.raster(variant);
        if (!raster) errors.push(finish + ': ' + service.stats().error);
        if (gl.getError()) errors.push(finish + ': live GL error');
        if (
          ['metal', 'glow', 'fire', 'chains', 'halloween-stickers'].includes(
            finish,
          )
        )
          variants[finish] = canvas.toDataURL();
      }
      const glowing = { ...style, finish: 'glow', animation: 'none' };
      preview.setRenderOverrides({ frameStyle: glowing });
      preview.playAction('idle', 0, true);
      const glowZ = 0.045 - Frame.bevel(glowing) / 1024 - 0.001,
        live = glowProbes.map(([x, y]) => pixel(x, y, glowZ)),
        raster = service.raster(glowing)!;
      const ctx = raster.canvas.getContext('2d')!,
        staticAlpha = glowProbes.map(
          ([x, y]) =>
            ctx.getImageData(x - raster.bounds.x, y - raster.bounds.y, 1, 1)
              .data[3],
        );
      const empty = pixel(10, 10, glowZ);
      const rasterPNG = raster.canvas.toDataURL();
      preview.setRenderOverrides({
        frameStyle: {
          ...style,
          finish: 'metal',
          animation: 'flow',
          animationSpeed: 1,
        },
      });
      preview.playAction('idle', 0, true);
      const atZero = canvas.toDataURL();
      preview.playAction('idle', 0.8, true);
      const later = canvas.toDataURL();
      preview.playAction('idle', 0, true);
      const replay = canvas.toDataURL();
      preview.setRenderOverrides({
        frameStyle: { ...style, finish: 'metal', animation: 'none' },
        layers: doc.layers.map((l) => ({
          ...l,
          visible: l.kind === 'frame' || l.role === 'frame-artwork',
        })),
      });
      preview.playAction('idle', 0, true);
      preview.pose(0, 0);
      let broadFaceVariation = 0;
      // This fixture's ellipse ends at x=750. Stay >=75 source pixels inside
      // its face while crossing the outer/window nearest-boundary partition.
      for (let x = 300; x <= 500; x += 10)
        for (let y = 230; y <= 300; y += 10) {
          const a = pixel(x, y), b = pixel(x + 3, y + 3);
          for (let c = 0; c < 3; c++)
            broadFaceVariation = Math.max(broadFaceVariation, Math.abs(a[c] - b[c]));
        }
      const markers = [
        [400, 140],
        [900, 700],
        [250, 415],
      ].map(([x, y]) => pixel(x, y));
      const markerPNG = canvas.toDataURL();
      preview.pose(25, 15);
      const tilted = canvas.toDataURL();
      const stats = service.stats();
      service.clear();
      return {
        variants,
        live,
        staticAlpha,
        empty,
        rasterPNG,
        atZero,
        later,
        replay,
        markers,
        broadFaceVariation,
        markerPNG,
        tilted,
        stats,
        errors,
      };
    },
    { doc, glowProbes },
  );
  const images = {
    ...result.variants,
    staticGlow: result.rasterPNG,
    flowStart: result.atZero,
    flowLater: result.later,
    markers: result.markerPNG,
    tilted: result.tilted,
  };
  for (const [name, png] of Object.entries(images))
    await writeFile(
      join(output, 'material-' + name + '.png'),
      Buffer.from(png.split(',')[1], 'base64'),
    );
  await writeFile(
    join(output, 'material-probes.json'),
    JSON.stringify(
      {
        live: result.live,
        staticAlpha: result.staticAlpha,
        markers: result.markers,
        broadFaceVariation: result.broadFaceVariation,
        stats: result.stats,
        errors: result.errors,
      },
      null,
      2,
    ),
  );
  assert.deepEqual(result.errors, []);
  assert.ok(result.broadFaceVariation < 8, 'broad face has no nearest-loop material seams');
  for (let i = 0; i < glowProbes.length; i++) {
    assert.ok(
      result.live[i][3] > 20,
      'halo at real outer/window/island boundary ' + glowProbes[i],
    );
    assert.ok(result.staticAlpha[i] > 20, 'static halo at ' + glowProbes[i]);
    assert.ok(
      Math.abs(result.staticAlpha[i] - result.live[i][3]) < 45,
      'static and live halo coverage',
    );
  }
  assert.equal(
    result.empty[3],
    0,
    'no rectangular ghost halo outside the actual contour',
  );
  assert.notEqual(
    result.atZero,
    result.later,
    'flow advances along the irregular frame',
  );
  assert.equal(
    result.atZero,
    result.replay,
    'paused time and replay reproduce the same finish',
  );
  for (let i = 0; i < 3; i++)
    for (let channel = 0; channel < 3; channel++)
      assert.ok(
        Math.abs(result.markers[i][channel] - (i === channel ? 255 : 0)) < 5,
        'image decoration keeps source UV registration: ' +
          JSON.stringify(result.markers),
      );
  assert.ok(
    result.stats.entries <= 4 && result.stats.bytes <= 34 * 1024 * 1024,
  );
  return {
    finishes: Object.keys(result.variants),
    allFinishesCompiled: 25,
    glowProbes,
    liveAlpha: result.live.map((p) => p[3]),
    staticAlpha: result.staticAlpha,
    flowAndReplay: true,
    imageMarkers: result.markers,
    broadFaceVariation: result.broadFaceVariation,
    boundedRasterCache: true,
  };
}
