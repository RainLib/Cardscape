import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import type { CardDocument } from '../shared/document';

/** Exercise the bundled models through the existing editor controls. */
export async function smokeRenderModels(page: Page): Promise<void> {
  const original: CardDocument = await page.evaluate(() =>
    structuredClone(window.cardEditorHost.state().document),
  );
  try {
    await page.evaluate(() => {
      window.atelierWorkspace.view('split');
      window.atelierFrame.open();
    });
    if (await page.locator('#frame-unlock').isVisible())
      await page.locator('#frame-unlock').click({ force: true });
    await page.locator('#frame-finish').selectOption('neonnights');
    await page.waitForFunction(
      () =>
        window.cardEditorHost.state().document.frameStyle?.finish ===
        'neonnights',
      null,
      { timeout: 30000 },
    );
    await page.waitForFunction(
      () => {
        const data =
          document.querySelector<HTMLCanvasElement>('#editor-canvas')?.dataset
            .frameRaster;
        return (
          !!data &&
          JSON.parse(data).renders > 0 &&
          JSON.parse(data).error === null
        );
      },
      null,
      { timeout: 30000 },
    );
    const hits = await page.evaluate(
      () =>
        JSON.parse(
          document.querySelector<HTMLCanvasElement>('#editor-canvas')!.dataset
            .frameRaster!,
        ).hits as number,
    );
    await page.evaluate(() => window.cardEditorHost.chooseFrame());
    await page.waitForFunction(
      (count) => {
        const data =
          document.querySelector<HTMLCanvasElement>('#editor-canvas')?.dataset
            .frameRaster;
        return !!data && JSON.parse(data).hits > count;
      },
      hits,
      { timeout: 30000 },
    );

    await page.evaluate(() => {
      document.querySelector('#stats-cost')!.closest('details')!.open = true;
    });
    await page.locator('#stats-cost').fill('9');
    await page.locator('#stats-cost').dispatchEvent('change');
    await page.locator('#stats-power').fill('-7');
    await page.locator('#stats-power').dispatchEvent('change');
    await page.locator('#stats-theme').selectOption('stellar-energy');
    await page.waitForFunction(
      () => {
        const doc: CardDocument = window.cardEditorHost.state().document;
        const cost = doc.layers.find((l) => l.role === 'stat-cost'),
          power = doc.layers.find((l) => l.role === 'stat-power');
        return (
          cost?.text === '9' &&
          power?.text === '-7' &&
          cost.textStyle?.badgeTheme === 'stellar-energy' &&
          power.textStyle?.badgeTheme === 'stellar-energy'
        );
      },
      null,
      { timeout: 30000 },
    );

    const sourceCount = await page.evaluate(
      () => window.cardEditorHost.state().document.layers.length as number,
    );
    await page.locator('[data-view="space"]').first().click({ force: true });
    await page.locator('[data-space-display="layers"]').click({ force: true });
    await page.locator('#space-mode').selectOption('actual');
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLCanvasElement>('#space-canvas')?.dataset
          .mode === 'actual',
      null,
      { timeout: 30000 },
    );
    assert.equal(
      await page.locator('#space-canvas').getAttribute('data-gl-error'),
      '0',
    );
    await page.locator('#space-full-source').uncheck({ force: true });
    await page.locator('#space-channels').check({ force: true });
    await page.waitForFunction(
      (count) =>
        Number(
          document.querySelector<HTMLCanvasElement>('#space-canvas')?.dataset
            .layerCount,
        ) > count,
      sourceCount,
      { timeout: 30000 },
    );
    await page.locator('#space-mode').selectOption('explode');
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLCanvasElement>('#space-canvas')?.dataset
          .mode === 'explode',
      null,
      { timeout: 30000 },
    );
    assert.equal(
      await page.locator('#space-canvas').getAttribute('data-gl-error'),
      '0',
    );
    await page.locator('#space-full-source').check({ force: true });
    await page.locator('[data-space-display="gallery"]').click({ force: true });
    await page.locator('[data-view="split"]').first().click({ force: true });

    await page.locator('[data-inspector-view="shader"]').click({ force: true });
    await page.locator('#shader-mode-nodes').click({ force: true });
    await page.locator('#shader-node-stage').selectOption('geometry');
    await page.locator('#shader-node-template').selectOption('wave');
    await page.locator('#shader-node-preset').click({ force: true });
    await page.locator('#shader-node-apply').click({ force: true });
    await page.waitForFunction(
      () =>
        document
          .getElementById('shader-node-status')
          ?.textContent?.includes('已编译并应用'),
      null,
      { timeout: 30000 },
    );
    const compiled = await page.evaluate(
      () =>
        window.cardEditorHost.state().document.shader.geometryBody as string,
    );
    assert.match(compiled, /sg\d+/);
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLCanvasElement>('#author-model-canvas')
          ?.dataset.glError === '0',
      null,
      { timeout: 30000 },
    );
    await page.locator('#shader-node-close').click({ force: true });
  } finally {
    await page.evaluate((value) => {
      window.cardEditorHost.mutate(
        'Restore render model smoke document',
        (doc: CardDocument) => {
          for (const key of Object.keys(doc)) delete doc[key];
          Object.assign(doc, value);
        },
      );
      window.atelierWorkspace.view('split');
      window.atelierWorkspace.panel('properties');
    }, original);
  }
  console.log('SMOKE_RENDER_MODELS_PASSED');
}
