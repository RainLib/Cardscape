import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import type { CardDocument } from '../shared/document';

export async function smokeRuntimeServices(page: Page): Promise<void> {
  const original = await page.evaluate(() => ({
    cosmetics: structuredClone(
      window.cardEditorHost.state().document.cosmetics,
    ),
    particles: structuredClone(
      window.cardEditorHost.state().document.particles,
    ),
    preview: window.cardPreview.getPreviewLevel?.() ?? null,
  }));
  try {
    await page.evaluate(() => {
      document.body.classList.remove('dock-collapsed', 'panels-hidden');
      window.atelierWorkspace.panel('appearance');
    });
    await page.selectOption('#cosmetics-level', 'rare', { force: true });
    assert.equal(
      await page.evaluate(
        () => window.cardEditorHost.state().document.cosmetics.level,
      ),
      'rare',
    );
    await page.selectOption('#card-tier-preview', 'legendary', { force: true });
    assert.equal(
      await page.evaluate(() => window.cardPreview.getPreviewLevel?.()),
      'legendary',
    );
    assert.equal(
      await page.evaluate(
        () => window.cardEditorHost.state().document.cosmetics.level,
      ),
      'rare',
    );
    await page.selectOption('#cosmetics-flare', 'starcore', { force: true });
    assert.equal(
      await page.evaluate(
        () => window.cardEditorHost.state().document.particles.visual,
      ),
      'starcore',
    );
    await page.selectOption('#cosmetics-quality', 'low', { force: true });
    await page.evaluate(() => window.atelierCosmetics.refresh());
    await page.locator('#cosmetics-budget').evaluate((element) => {
      if (!element.textContent?.includes('48'))
        throw Error('Low quality budget was not refreshed');
    });
    await page.locator('[data-inspector-view="shader"]').click({ force: true });
    await page.locator('#material-maker-open').click({ force: true });
    await page.waitForFunction(() => {
      const dialog = document.querySelector<HTMLDialogElement>(
        '#material-maker-dialog',
      );
      const status = document.querySelector('#mm-status')?.textContent;
      return dialog?.open && !!status && status !== '检查程序…';
    });
    const status = await page.evaluate(() =>
      window.cardEditorHost.invoke('material-maker-status'),
    );
    assert.equal(typeof status.available, 'boolean');
    assert.equal(status.mode, 'native-linked');
    await page.locator('#mm-close').click({ force: true });
  } finally {
    await page.evaluate((value) => {
      window.atelierMaterialMaker.close();
      window.cardEditorHost.mutate(
        'Restore cosmetics after service smoke',
        (document: CardDocument) => {
          document.cosmetics = value.cosmetics;
          document.particles = value.particles;
        },
      );
      window.cardPreview.setPreviewLevel?.(value.preview);
      window.atelierCosmetics.refresh();
      window.atelierWorkspace.panel('properties');
    }, original);
  }
  console.log('SMOKE_RUNTIME_SERVICES_PASSED');
}
