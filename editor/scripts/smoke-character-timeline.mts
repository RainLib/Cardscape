import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import type { CardDocument } from '../shared/document';

export async function smokeCharacterTimeline(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.atelierWorkspace.panel('motion', false);
    window.atelierCharacterWorkspace.open('bones');
  });
  await page.locator('#character-object-search').fill('Root');
  assert.equal(
    await page
      .locator('#character-object-list .character-object-select')
      .count(),
    1,
  );
  await page.locator('#character-page-mesh').click();
  assert.equal(await page.locator('#character-object-search').inputValue(), '');
  await page.locator('#character-object-search').fill('no-matching-image');
  assert.equal(
    await page
      .locator('#character-object-list .character-object-select')
      .count(),
    0,
  );
  await page.locator('#character-page-bones').click();
  assert.equal(
    await page.locator('#character-object-search').inputValue(),
    'Root',
  );
  await page.locator('#character-object-search').fill('');
  await page
    .locator('#character-object-list .character-object-select')
    .first()
    .focus();
  await page.keyboard.press('End');
  assert.equal(
    await page.evaluate(() => window.atelierCharacterRig.selected()),
    'arm',
  );
  await page.keyboard.press('Home');
  assert.equal(
    await page.evaluate(() => window.atelierCharacterRig.selected()),
    'root',
  );
  const toggle = page
    .locator('#character-object-list .character-tree-toggle[aria-expanded]')
    .first();
  await toggle.click();
  assert.equal(
    await page
      .locator('#character-object-list .character-object-select')
      .count(),
    1,
  );
  await page
    .locator('#character-object-list .character-tree-toggle[aria-expanded]')
    .first()
    .click();
  assert.equal(
    await page
      .locator('#character-object-list .character-object-select')
      .count(),
    2,
  );
  await page.locator('#character-page-mesh').click();
  await page.locator('#character-page-mesh').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(
    await page.locator('body').getAttribute('data-character-page'),
    'weights',
  );

  const before = await page.evaluate(() => {
    const host = window.cardEditorHost;
    host.mutate('Timeline controls smoke fixture', (doc: CardDocument) => {
      doc.actions!.find((action) => action.id === 'idle')!.loop = true;
      doc.characterRig!.expressions = [
        { id: 'smile', name: 'Smile', value: 0 },
      ];
      doc.characterRig!.constraints = [
        {
          id: 'target',
          name: 'Target',
          rootId: 'root',
          tipId: 'arm',
          end: [80, 0],
          target: [760, 768],
          bend: 1,
          mix: 1,
        },
      ];
    });
    window.atelierAnimation.selectBone('root');
    window.atelierAnimation.seek(0.5);
    return {
      revision: host.state().revision,
      actions: JSON.stringify(host.state().document.actions),
    };
  });
  await page.locator('#timeline-track').selectOption('rotation');
  await page.locator('#timeline-value').fill('17');
  assert.equal(
    await page.evaluate(() => window.cardEditorHost.state().revision),
    before.revision,
  );
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify(window.cardEditorHost.state().document.actions),
    ),
    before.actions,
  );
  await page.locator('#timeline-record').click();
  const rotation = () =>
    page.evaluate(
      () =>
        window.cardEditorHost
          .state()
          .document.actions.find((a) => a.id === 'idle').boneTracks.root
          .rotation,
    );
  assert.ok(
    (await rotation()).some((frame) => frame.at === 0.5 && frame.value === 17),
  );
  await page.locator('#timeline-fps').selectOption('60');
  await page.locator('#timeline-next').click();
  assert.ok(
    Math.abs(
      (await page.evaluate(() => window.atelierAnimation.context().seconds)) -
        31 / 60,
    ) < 1e-9,
  );
  await page.locator('#timeline-prev-key').click();
  assert.equal(
    await page.evaluate(() => window.atelierAnimation.context().seconds),
    0.5,
  );
  await page
    .locator('#timeline-tracks [data-track="rotation"][data-key-at="0.5"]')
    .focus();
  await page.keyboard.press('Delete');
  assert.equal(
    (await rotation()).some((frame) => frame.at === 0.5),
    false,
  );
  await page.evaluate(() => window.cardEditorHost.command('undo'));
  assert.ok(
    (await rotation()).some((frame) => frame.at === 0.5 && frame.value === 17),
  );
  await page.evaluate(() => window.cardEditorHost.command('redo'));
  assert.equal(
    (await rotation()).some((frame) => frame.at === 0.5),
    false,
  );

  await page.evaluate(() => {
    window.atelierAnimation.selectBone('target', 'ik');
    window.atelierAnimation.seek(0.5);
  });
  await page.locator('#timeline-track').selectOption('x');
  await page.locator('#timeline-value').fill('730');
  await page.locator('#timeline-record').click();
  assert.equal(
    await page.evaluate(
      () =>
        window.cardEditorHost
          .state()
          .document.actions.find((a) => a.id === 'idle')
          .ikTracks.target.x.find((f) => f.at === 0.5).value,
    ),
    730,
  );
  await page.evaluate(() => {
    window.atelierAnimation.selectBone('smile', 'expression');
    window.atelierAnimation.seek(0.5);
  });
  await page.locator('#timeline-value').fill('0.5');
  await page.locator('#timeline-record').click();
  assert.equal(
    await page.evaluate(
      () =>
        window.cardEditorHost
          .state()
          .document.actions.find((a) => a.id === 'idle')
          .expressionTracks.smile.value.find((f) => f.at === 0.5).value,
    ),
    0.5,
  );
  await page.locator('#timeline-target').selectOption('');
  await page.locator('#timeline-group').selectOption('effects');
  await page.locator('#timeline-track').selectOption('motion');
  await page.locator('#timeline-value').fill('1.3');
  await page.locator('#timeline-record').click();
  assert.equal(
    await page.evaluate(
      () =>
        window.cardEditorHost
          .state()
          .document.actions.find((a) => a.id === 'idle')
          .tracks.motion.find((f) => f.at === 0.5).value,
    ),
    1.3,
  );
  await page.locator('#timeline-clear').click();
  const preserved = await page.evaluate(() => {
    const action = window.cardEditorHost
      .state()
      .document.actions.find((a) => a.id === 'idle');
    return {
      motion: action.tracks.motion,
      ik: action.ikTracks.target.x,
      expression: action.expressionTracks.smile.value,
      bone: action.boneTracks.root.rotation,
    };
  });
  assert.equal(preserved.motion, undefined);
  assert.ok(
    preserved.ik.some((frame) => frame.at === 0.5 && frame.value === 730),
  );
  assert.ok(
    preserved.expression.some(
      (frame) => frame.at === 0.5 && frame.value === 0.5,
    ),
  );
  assert.equal(preserved.bone.length, 2);
  await page.locator('#timeline-play').click();
  await page.waitForFunction(
    () =>
      window.atelierAnimation.isPlaying() &&
      window.atelierAnimation.context().seconds > 0.55,
    null,
    { timeout: 30000 },
  );
  await page.locator('#timeline-play').click();
  assert.equal(
    await page.evaluate(() => window.atelierAnimation.isPlaying()),
    false,
  );
  const currentRevision = await page.evaluate(
    () => window.cardEditorHost.state().revision,
  );
  await page.locator('#timeline-value').fill('9999');
  await page.locator('#timeline-record').click();
  assert.equal(
    await page.evaluate(() => window.cardEditorHost.state().revision),
    currentRevision,
  );
  await page.evaluate(() => {
    const host = window.cardEditorHost,
      saved = structuredClone(host.state().document.actions);
    host.mutate('Empty timeline smoke', (doc: CardDocument) => {
      doc.actions = [];
    });
    window.atelierAnimation.refresh(host.state());
    if (
      !(document.getElementById('timeline-record') as HTMLButtonElement)
        .disabled
    )
      throw Error('Empty timeline still allows recording');
    window.atelierAnimation.seek(0);
    window.atelierAnimation.play();
    host.mutate('Restore timeline actions', (doc: CardDocument) => {
      doc.actions = saved;
    });
    window.atelierAnimation.close();
  });
  console.log('SMOKE_CHARACTER_TIMELINE_PASSED');
}
