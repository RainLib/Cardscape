import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import type { CardDocument } from '../shared/document';
import type { CharacterPanelBindings } from '../shared/character-panels';

/** Uses the live mesh fixture and existing panel instances, including their history. */
export async function smokeCharacterViews(page: Page): Promise<void> {
  const revision = await page.evaluate(async () => {
    const bindings = window as unknown as CharacterPanelBindings;
    const host = bindings.cardEditorHost;
    const input = (id: string) =>
      document.getElementById(id) as HTMLInputElement;
    const click = (selector: string) =>
      document.querySelector<HTMLButtonElement>(selector)!.click();
    const ensure = (value: boolean, text: string) => {
      if (!value) throw Error(text);
    };
    bindings.atelierCharacterWorkspace!.open('bones');
    click('[data-character-phase="setup"]');
    ensure(
      document.body.dataset.characterPhase === 'setup',
      'Setup phase was not selected',
    );
    click('[data-character-phase="animate"]');
    ensure(
      document.body.dataset.characterPhase === 'animate',
      'Animate phase was not selected',
    );
    click('[data-motion-scope="card"]');
    ensure(
      document.body.dataset.motionScope === 'card',
      'Card scope was not selected',
    );
    click('[data-motion-scope="character"]');
    ensure(
      document.body.dataset.motionScope === 'character',
      'Character scope was not restored',
    );
    bindings.atelierCharacterWorkspace!.open('weights');
    bindings.atelierCharacterAdvanced.selectBone('root');
    bindings.atelierAnimation.seek(0);
    input('skin-full-topology').checked = true;
    input('skin-posed').checked = true;
    input('skin-pies').value = 'all';
    input('skin-tool').value = 'vertex';
    bindings.atelierCharacterAdvanced.selectVertex(4);
    const canvas = document.createElement('canvas');
    const draw = () => {
      bindings.atelierCharacterAdvanced.beginFrame();
      bindings.atelierCharacterAdvanced.draw(canvas.getContext('2d')!, 1);
      return JSON.parse(
        document.getElementById('editor-canvas')!.dataset.weightView!,
      ) as {
        selection: number[];
        markers: { index: number; x: number; y: number }[];
      };
    };
    let data = draw();
    ensure(data.selection.includes(4), 'Vertex selection was not rendered');
    const point = data.markers.find((marker) => marker.index === 4)!;
    ensure(!!point, 'Selected vertex marker is missing');
    const before = host.state().revision;
    const selection = bindings.atelierCharacterAdvanced.pointerDown(
      { x: -100, y: -100 },
      1,
      new PointerEvent('pointerdown'),
    );
    selection?.update?.(host.state().document!, { x: 1200, y: 1700 });
    selection?.finish?.({ cancelled: true });
    ensure(
      draw().selection.join(',') === '4',
      'Cancelled box selection did not restore the selection',
    );
    ensure(
      host.state().revision === before,
      'Selecting vertices changed document history',
    );
    input('skin-tool').value = 'add';
    input('skin-radius').value = '90';
    input('skin-strength').value = '.2';
    input('skin-feather').value = '.5';
    const prior = host
      .state()
      .document!.characterRig!.meshes![0].weights[4].find(
        (w) => w.boneId === 'root',
      )!.weight;
    const brush = bindings.atelierCharacterAdvanced.pointerDown(
      point,
      1,
      new PointerEvent('pointerdown'),
    );
    ensure(!!brush?.update, 'Weight brush did not return an editing operation');
    ensure(
      host.mutate('View smoke weight brush', (doc: CardDocument) =>
        brush!.update!(doc, point),
      ),
      'Weight brush transaction failed',
    );
    brush!.finish?.();
    const weights = host.state().document!.characterRig!.meshes![0].weights[4];
    ensure(
      weights.find((w) => w.boneId === 'root')!.weight > prior,
      'Weight brush did not change the selected bone',
    );
    ensure(
      Math.abs(weights.reduce((sum, w) => sum + w.weight, 0) - 1) < 1e-9,
      'Weight brush lost normalization',
    );
    await window.cardEditorHost.command('undo');
    ensure(
      host
        .state()
        .document!.characterRig!.meshes![0].weights[4].find(
          (w) => w.boneId === 'root',
        )!.weight === prior,
      'Weight brush undo failed',
    );
    await window.cardEditorHost.command('redo');
    ensure(
      host
        .state()
        .document!.characterRig!.meshes![0].weights[4].find(
          (w) => w.boneId === 'root',
        )!.weight > prior,
      'Weight brush redo failed',
    );
    bindings.atelierCharacterWorkspace!.open('mesh');
    input('skin-tool').value = 'mesh-delete';
    input('skin-motion-quality').checked = false;
    bindings.atelierAnimation.seek(0);
    data = draw();
    const target = data.markers.find((marker) => marker.index === 4)!;
    const remove = bindings.atelierCharacterAdvanced.pointerDown(
      target,
      1,
      new PointerEvent('pointerdown'),
    );
    ensure(!!remove?.update, 'Topology deletion did not return a transaction');
    ensure(
      host.mutate('View smoke topology comparison', (doc) =>
        remove!.update!(doc, target),
      ),
      'Topology comparison fixture failed',
    );
    remove!.finish?.();
    return host.state().revision;
  });
  await page.waitForFunction(
    () =>
      !(document.getElementById('skin-review') as HTMLButtonElement).disabled,
  );
  await page.evaluate(() =>
    (document.getElementById('skin-review') as HTMLButtonElement).click(),
  );
  await page.waitForFunction(
    () => !!document.querySelector<HTMLDialogElement>('#mesh-review')?.open,
  );
  await page.locator('#mesh-review-action').selectOption('idle');
  await page.locator('#mesh-review-seconds').fill('0.5');
  const panes = await page.evaluate(() =>
    ['before', 'after'].map((side) => {
      const canvas = document.getElementById(
        'mesh-review-' + side,
      ) as HTMLCanvasElement;
      return {
        width: canvas.width,
        data: JSON.parse(canvas.dataset.review!) as {
          seconds: number;
          actionId: string;
        },
      };
    }),
  );
  assert.ok(
    panes.every(
      (pane) =>
        pane.width > 1 &&
        pane.data.seconds === 0.5 &&
        pane.data.actionId === 'idle',
    ),
  );
  await page.locator('#mesh-review-metric').selectOption('motionError');
  await page.locator('#mesh-review-worst').click();
  await page.evaluate(() => {
    (document.getElementById('mesh-review-scan') as HTMLButtonElement).click();
    (
      document.getElementById('mesh-review-cancel-batch') as HTMLButtonElement
    ).click();
  });
  assert.match(
    await page.locator('#mesh-review-batch-status').innerText(),
    /已取消/,
  );
  assert.equal(
    await page.evaluate(() => window.cardEditorHost.state().revision),
    revision,
  );
  await page.locator('#mesh-review-scan').click();
  await page.waitForFunction(
    () =>
      document
        .getElementById('mesh-review-batch-status')!
        .textContent!.startsWith('扫描完成'),
    null,
    { timeout: 30000 },
  );
  assert.equal(
    await page.evaluate(() => window.cardEditorHost.state().revision),
    revision,
  );
  await page.locator('#mesh-review .mesh-review-repair > summary').click();
  await page.locator('#mesh-review-threshold').fill('0');
  await page.locator('#mesh-review-select-high').click();
  assert.match(await page.locator('#mesh-review-area').innerText(), /已选/);
  await page.locator('#mesh-review-protect').click();
  assert.match(
    await page.locator('#mesh-review-repair-status').innerText(),
    /已恢复源网格/,
  );
  await page.evaluate(() => {
    window.cardEditorHost.mutate(
      'Invalidate comparison smoke',
      (doc: CardDocument) => {
        doc.characterRig!.bones[0].name = 'Changed after comparison';
      },
    );
    window.atelierCharacterAdvanced.refresh();
  });
  assert.equal(
    await page
      .locator('#mesh-review')
      .evaluate((dialog: HTMLDialogElement) => dialog.open),
    false,
  );
  assert.equal(await page.locator('#skin-review').isDisabled(), true);
  console.log('SMOKE_CHARACTER_VIEWS_PASSED');
}
