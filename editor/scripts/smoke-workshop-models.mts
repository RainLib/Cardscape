import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import type { CardDocument } from '../shared/document';
import type { WorkshopDocument } from '../shared/projects';

export async function smokeWorkshopModels(page: Page): Promise<void> {
  const original: CardDocument = await page.evaluate(() =>
    structuredClone(window.cardEditorHost.state().document),
  );
  try {
    const ids = await page.evaluate(async () => {
      const host = window.cardEditorHost;
      await host.workshop('create', { name: 'Typed workshop smoke' });
      const frame = await host.workshop('publish', {
        kind: 'frame',
        name: 'Pinned frame',
      });
      if (!frame) throw Error('Frame resource was not published');
      const first: WorkshopDocument = host.state().workshop;
      const firstCard = first.activeCardId;
      await host.workshop('duplicate', { name: 'Independent card' });
      host.mutate('Change frame recipe', (doc: CardDocument) => {
        doc.frameStyle = { ...doc.frameStyle, color: '#123456' };
      });
      const second = await host.workshop('publish', {
        kind: 'frame',
        resourceId: frame.resourceId,
      });
      if (!second || second.version !== 2)
        throw Error('Frame did not publish its second version');
      const w: WorkshopDocument = host.state().workshop;
      if (
        w.cards.find((c) => c.id === firstCard)?.bindings.frame?.version !==
          1 ||
        w.cards.find((c) => c.id === w.activeCardId)?.bindings.frame
          ?.version !== 2
      )
        throw Error('Publishing changed an independently pinned card');
      const material = await host.workshop('publish', { kind: 'material' });
      if (!material) throw Error('Material resource was not published');
      let current: WorkshopDocument = host.state().workshop;
      const materialValue = current.resources.find(
        (r) => r.id === material.resourceId,
      )!.versions[0].value;
      await host.workshop('publish', {
        kind: 'material',
        resourceId: material.resourceId,
        value: {
          ...materialValue,
          enabled: true,
          style: 'prism',
          target: 'background',
        },
      });
      const particles = await host.workshop('publish', { kind: 'particles' });
      if (!particles) throw Error('Particle resource was not published');
      current = host.state().workshop;
      const particleValue = current.resources.find(
        (r) => r.id === particles.resourceId,
      )!.versions[0].value;
      await host.workshop('publish', {
        kind: 'particles',
        resourceId: particles.resourceId,
        value: {
          ...particleValue,
          enabled: true,
          count: 16,
          visual: 'snow',
          emitter: { target: 'frame', shape: 'perimeter', side: 'both' },
        },
      });
      const back = await host.workshop('publish', { kind: 'back' });
      if (!back) throw Error('Back resource was not published');
      return { back: back.resourceId, frame: frame.resourceId };
    });
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector<HTMLCanvasElement>('#author-model-canvas')
            ?.dataset.particleCount,
        ) > 0,
      null,
      { timeout: 30000 },
    );
    assert.equal(
      await page
        .locator('#author-model-canvas')
        .getAttribute('data-material-style'),
      'prism',
    );
    assert.equal(
      await page.locator('#author-model-canvas').getAttribute('data-gl-error'),
      '0',
    );
    await page.evaluate(async (id) => {
      await window.cardEditorHost.editAsset(id, 1, false, 'back');
    }, ids.back);
    await page.waitForFunction(
      () => window.cardEditorHost.state().document.assetKind === 'back',
      null,
      { timeout: 30000 },
    );
    await page.evaluate(async (id) => {
      const host = window.cardEditorHost,
        state = host.state();
      if (state.document.backScene || state.document.componentScenes)
        throw Error('Back edit nested the front-card composition');
      host.mutate('Rename independent back', (doc: CardDocument) => {
        doc.name = 'Typed independent back';
      });
      await host.publishAsset();
      const current: WorkshopDocument = host.state().workshop;
      const resource = current.resources.find((r) => r.id === id)!;
      if (
        resource.versions.length !== 2 ||
        !resource.versions[1].value.document ||
        current.editingAsset?.baseVersion !== 2
      )
        throw Error('Back document and new version were not published');
      await host.command('undo');
      const undone: WorkshopDocument = host.state().workshop;
      if (undone.resources.find((r) => r.id === id)!.versions.length !== 1)
        throw Error('Undo did not restore the previous resource graph');
      await host.command('redo');
      const redone: WorkshopDocument = host.state().workshop;
      if (redone.resources.find((r) => r.id === id)!.versions.length !== 2)
        throw Error('Redo lost the new resource version');
      await host.returnAsset();
      if (host.state().workshop.editingAsset || host.state().document.assetKind)
        throw Error(
          'Returning from the back draft did not restore the front card',
        );
    }, ids.back);
  } finally {
    await page.evaluate(async (document) => {
      await window.cardEditorHost.workshop('open', { document });
      window.atelierWorkspace.panel('properties');
      window.atelierWorkspace.view('split');
    }, original);
  }
  console.log('SMOKE_WORKSHOP_MODELS_PASSED');
}
