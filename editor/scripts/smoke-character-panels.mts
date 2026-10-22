import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import type { CardDocument } from '../shared/document';

export async function smokeCharacterPanels(page: Page): Promise<void> {
  const original = await page.evaluate(() => {
    const doc = window.cardEditorHost.state().document;
    return {
      rig: structuredClone(doc.characterRig),
      actions: structuredClone(doc.actions),
    };
  });
  try {
    const data = await page.evaluate(() => {
      const host = window.cardEditorHost;
      const click = (id: string) =>
        (document.getElementById(id) as HTMLButtonElement).click();
      const value = (id: string, text: string) => {
        (document.getElementById(id) as HTMLInputElement).value = text;
      };
      const ensure = (condition: boolean, text: string) => {
        if (!condition) throw Error(text);
      };
      host.mutate('Panel smoke fixture', (doc: CardDocument) => {
        delete doc.characterRig;
        doc.actions = [
          {
            id: 'idle',
            name: 'Idle',
            duration: 1,
            event: 'idle',
            loop: false,
            motion: 1,
            emission: 1,
            bend: 0,
          },
        ];
      });
      window.atelierWorkspace.panel('motion', false);
      value('rig-edit-stage', 'setup');
      document
        .getElementById('rig-edit-stage')!
        .dispatchEvent(new Event('change'));
      click('rig-add-root');
      click('rig-add-child');
      let rig = host.state().document.characterRig;
      ensure(
        rig.bones.length === 2,
        'Skeleton controls did not create a hierarchy',
      );
      const arm = rig.bones[1].id;
      value('rig-name', 'Arm');
      value('rig-x', '120');
      value('rig-y', '0');
      value('rig-rotation', '0');
      value('rig-scale', '1');
      click('rig-apply');
      value('rig-length', '90');
      value('rig-direction', '30');
      click('rig-apply-tip');
      click('rig-bind');
      rig = host.state().document.characterRig;
      ensure(
        rig.bones[1].x === 120 &&
          Math.abs(Math.hypot(...rig.bones[1].tip) - 90) < 0.001,
        'Rest pose or bone tip was not committed',
      );
      ensure(
        rig.bindings.some(
          (binding) =>
            binding.boneId === arm && binding.layerId === host.state().layer.id,
        ),
        'Layer binding was not committed',
      );
      window.atelierCharacterAdvanced.selectBone(arm);
      value('skin-topology', 'grid');
      value('skin-columns', '2');
      value('skin-rows', '2');
      click('skin-create');
      ensure(
        host.state().document.characterRig.meshes[0].weights.length === 9,
        'Advanced panel did not create a typed mesh',
      );
      value('expression-name', 'Smoke expression');
      value('expression-value', '0');
      click('expression-create');
      value('morph-x', '512');
      value('morph-y', '768');
      value('morph-radius', '800');
      value('morph-dx', '12');
      value('morph-dy', '4');
      click('morph-apply');
      ensure(
        host.state().document.characterRig.meshes[0].morphs[0].deltas.length >
          0,
        'Expression morph was not committed',
      );
      value('rig-edit-stage', 'preview');
      document
        .getElementById('rig-edit-stage')!
        .dispatchEvent(new Event('change'));
      window.atelierCharacterRig.activate('bones');
      window.atelierCharacterRig.selectBone(arm);
      window.atelierAnimation.seek(0);
      value('rig-canvas-tool', 'translate');
      const doc = host.state().document,
        before = JSON.stringify(doc.actions),
        revision = host.state().revision,
        root = doc.characterRig.bones[0],
        child = doc.characterRig.bones[1];
      const point = { x: root.x + child.x, y: root.y + child.y },
        operation = window.atelierCharacterRig.pointerDown(point, 1);
      ensure(!!operation?.update, 'Skeleton drag did not return a transaction');
      operation.update(doc, { x: point.x + 20, y: point.y - 10 });
      operation.finish?.();
      ensure(
        host.state().revision === revision &&
          JSON.stringify(host.state().document.actions) === before,
        'Preview pose changed saved actions',
      );
      ensure(
        !!window.atelierCharacterRig.draftAction(),
        'Preview pose was not retained as a draft',
      );
      click('rig-pose-record');
      ensure(
        host.state().revision > revision &&
          host.state().document.actions[0].boneTracks[arm].x[0].value === 20,
        'Pose recording was not committed',
      );
      const current = host.state().document;
      const archive = {
        schema: 'card-character-animation-import/1',
        characterRig: structuredClone(current.characterRig),
        actions: structuredClone(current.actions),
      };
      archive.characterRig.bones[1].name = 'Imported arm';
      return {
        archive: JSON.stringify(archive),
        arm,
        layerId: host.state().layer.id,
        pixels: JSON.stringify(
          current.layers.map((layer) => [layer.id, layer.src]),
        ),
        masks: JSON.stringify(current.masks),
      };
    });
    await page
      .locator('#rig-file')
      .setInputFiles({
        name: 'native-character.json',
        mimeType: 'application/json',
        buffer: Buffer.from(data.archive),
      });
    await page.waitForFunction(
      (arm) =>
        window.cardEditorHost
          .state()
          .document.characterRig?.bones.find((bone) => bone.id === arm)
          ?.name === 'Imported arm',
      data.arm,
      { timeout: 30000, polling: 100 },
    );
    const source = {
      skeleton: { spine: '4.3.26', x: -50, y: -50, width: 100, height: 100 },
      bones: [{ name: 'root' }],
      slots: [{ name: data.layerId, bone: 'root', attachment: 'sprite' }],
      skins: [
        {
          name: 'default',
          attachments: {
            [data.layerId]: { sprite: { width: 100, height: 100 } },
          },
        },
      ],
      animations: {
        wave: {
          bones: { root: { rotate: [{ value: 0 }, { time: 1, value: 10 }] } },
        },
      },
    };
    const file = {
      name: 'spine-character.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(source)),
    };
    await page
      .getByLabel('Spine JSON 文件', { exact: true })
      .setInputFiles(file);
    await page.waitForFunction(
      () =>
        (document.getElementById('spine-import-dialog') as HTMLDialogElement)
          .open,
      null,
      { timeout: 30000 },
    );
    await page.locator('#spine-fit').click();
    const revision = await page.evaluate(
      () => window.cardEditorHost.state().revision,
    );
    await page.locator('#spine-check').click();
    assert.equal(await page.locator('#spine-apply').isEnabled(), true);
    assert.equal(
      await page.evaluate(() => window.cardEditorHost.state().revision),
      revision,
    );
    await page.locator('#spine-apply').click();
    await page.waitForFunction(
      () =>
        !(document.getElementById('spine-import-dialog') as HTMLDialogElement)
          .open,
      null,
      { timeout: 30000 },
    );
    const imported = await page.evaluate(() => {
      const doc = window.cardEditorHost.state().document;
      return {
        bone: doc.characterRig.bones[0].id,
        actions: doc.actions.map((action) => action.id),
        pixels: JSON.stringify(
          doc.layers.map((layer) => [layer.id, layer.src]),
        ),
        masks: JSON.stringify(doc.masks),
      };
    });
    assert.equal(imported.bone, 'sp-b0');
    assert.ok(imported.actions.includes('sp-action0'));
    assert.equal(imported.pixels, data.pixels);
    assert.equal(imported.masks, data.masks);
    await page
      .getByLabel('Spine JSON 文件', { exact: true })
      .setInputFiles(file);
    await page.waitForFunction(
      () =>
        (document.getElementById('spine-import-dialog') as HTMLDialogElement)
          .open,
    );
    await page.locator('#spine-check').click();
    await page.evaluate(() =>
      window.cardEditorHost.mutate(
        'Stale import smoke',
        (doc: CardDocument) => {
          doc.characterRig!.bones[0].name = 'After review';
        },
      ),
    );
    const changed = await page.evaluate(
      () => window.cardEditorHost.state().revision,
    );
    await page.locator('#spine-apply').click();
    assert.match(
      await page.locator('#spine-import-report').innerText(),
      /工程已变化/,
    );
    assert.equal(
      await page.evaluate(() => window.cardEditorHost.state().revision),
      changed,
    );
    assert.equal(
      await page.evaluate(
        () => window.cardEditorHost.state().document.characterRig.bones[0].name,
      ),
      'After review',
    );
    console.log('SMOKE_CHARACTER_PANELS_PASSED');
  } finally {
    await page.evaluate(({ rig, actions }) => {
      (
        document.getElementById('spine-import-dialog') as HTMLDialogElement
      ).close();
      window.atelierCharacterRig.resetPose(false);
      window.cardEditorHost.mutate(
        'Restore panel smoke document',
        (doc: CardDocument) => {
          if (rig) doc.characterRig = rig;
          else delete doc.characterRig;
          doc.actions = actions;
        },
      );
      window.atelierCharacterRig.refresh();
      window.atelierCharacterAdvanced.refresh();
      window.atelierWorkspace.panel('properties', false);
    }, original);
  }
}
