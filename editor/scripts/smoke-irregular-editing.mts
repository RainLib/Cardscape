import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import type { CardDocument } from '../shared/document';
import { fileURLToPath } from 'node:url';

/** Exercise the actual authoring controls; restore the source for other checks. */
export async function smokeIrregularEditing(page: Page) {
  const original = await page.evaluate(() =>
    structuredClone(window.cardEditorHost.state().document),
  );
  try {
    await page.evaluate(() => {
      window.atelierFrame.open();
      window.cardEditorHost.unlockFrame();
    });
    await page
      .locator('#frame-contour-editor')
      .evaluate((el: HTMLDetailsElement) => {
        el.open = true;
      });
    await page.locator('#frame-contour-preset').selectOption('double');
    const beforeRaster = await page.evaluate(
      () =>
        JSON.parse(
          document.querySelector<HTMLCanvasElement>('#editor-canvas')!.dataset
            .frameRaster || '{}',
        ).renders || 0,
    );
    await page.locator('#frame-contour-apply').click({ force: true });
    const contour = await page.evaluate(
      () => window.cardEditorHost.state().document.frameStyle?.contour,
    );
    assert.equal(contour?.windows.length, 2);
    await page.waitForFunction(
      (before) =>
        JSON.parse(
          document.querySelector<HTMLCanvasElement>('#editor-canvas')!.dataset
            .frameRaster || '{}',
        ).renders > before,
      beforeRaster,
      { timeout: 15000 },
    );
    const raster = await page.evaluate(() =>
      JSON.parse(
        document.querySelector<HTMLCanvasElement>('#editor-canvas')!.dataset
          .frameRaster || '{}',
      ),
    );
    assert.equal(raster.error, null);
    assert.ok(raster.renders > 0);
    await page.locator('[data-command="undo"]').first().click({ force: true });
    assert.equal(
      await page.evaluate(
        () => window.cardEditorHost.state().document.frameStyle?.contour,
      ),
      undefined,
    );
    await page.locator('[data-command="redo"]').first().click({ force: true });
    assert.deepEqual(
      await page.evaluate(
        () => window.cardEditorHost.state().document.frameStyle?.contour,
      ),
      contour,
    );
    const revision = await page.evaluate(
      () => window.cardEditorHost.state().revision,
    );
    await page.locator('#frame-contour-outline').evaluate((el) => {
      el.closest('details')!.open = true;
    });
    await page
      .locator('#frame-contour-outline')
      .fill('0,0\n1024,1536\n1024,0\n0,1536');
    await page.locator('#frame-contour-apply').click({ force: true });
    assert.equal(
      await page.evaluate(() => window.cardEditorHost.state().revision),
      revision,
    );
    await page.evaluate(() => {
      const host = window.cardEditorHost,
        id = host
          .state()
          .document.layers.find((l) => l.kind === 'foreground')!.id;
      host.mutate('Prepare animated order', (d) => {
        d.layers.find((l) => l.id === id)!.locked = false;
      });
      host.selectLayer(id);
      window.atelierAnimation.open();
      window.atelierAnimation.seek(0.4);
    });
    await page
      .locator('#timeline-composition')
      .evaluate((el: HTMLDetailsElement) => {
        el.open = true;
      });
    await page
      .getByRole('button', { name: '选中图层移到最前', exact: true })
      .click({ force: true });
    const result = await page.evaluate(() => {
      const c = window.atelierAnimation.context();
      return { id: c.action!.id, frames: c.action!.drawOrder };
    });
    assert.equal(result.frames?.length, 1);
    assert.ok(result.frames![0].at > 0);
    await page.getByLabel('动作切入过渡秒数', { exact: true }).fill('0.35');
    await page
      .getByLabel('动作切入过渡秒数', { exact: true })
      .dispatchEvent('change');
    assert.equal(
      await page.evaluate(
        (id) =>
          window.cardEditorHost
            .state()
            .document.actions?.find((a) => a.id === id)?.transitionDuration,
        result.id,
      ),
      0.35,
    );
    await page.evaluate((id) => {
      const host = window.cardEditorHost;
      host.previewAction('trigger', 0.5, true);
      host.previewAction(id, 0, false);
      if (
        document.querySelector<HTMLCanvasElement>('#author-model-canvas')!
          .dataset.actionTransition !== '0'
      )
        throw Error('编辑器同步取消了切入过渡');
      host.previewAction(id, 0, true);
    }, result.id);
    await page.screenshot({
      path: fileURLToPath(
        new URL('../qa/irregular-editor-controls.png', import.meta.url),
      ),
    });
    console.log('SMOKE_IRREGULAR_EDITING_PASSED');
  } finally {
    await page.evaluate((source: CardDocument) => {
      window.atelierAnimation.close();
      window.cardEditorHost.mutate('Restore before irregular smoke', (d) => {
        d.frameStyle = source.frameStyle;
        d.actions = source.actions;
        for (const l of d.layers)
          l.locked = source.layers.find((x) => x.id === l.id)?.locked;
      });
    }, original);
  }
}
