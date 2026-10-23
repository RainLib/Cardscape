import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import type { CardDocument } from '../shared/document';

export async function smokeAgentWorkspace(
  page: Page,
  fixture: { executable: string; script: string },
): Promise<void> {
  const original = await page.evaluate(async () => ({
    document: structuredClone(window.cardEditorHost.state().document),
    info: await window.atelierAgents.refresh(),
    choice: window.atelierAgents.selection(),
    layout: localStorage.getItem('atelier-workspace-v5'),
    axis: document.querySelector<HTMLSelectElement>('#preview-axis')!.value,
    ratio: document.querySelector<HTMLInputElement>('#preview-ratio')!.value,
    view:
      document.querySelector<HTMLElement>('.view-stage')!.dataset.view ||
      'split',
  }));
  try {
    await page.evaluate(() => {
      document.body.classList.remove('dock-collapsed', 'panels-hidden');
      window.atelierWorkspace.view('split');
      window.atelierWorkspace.panel('motion', false);
      document
        .querySelector<HTMLButtonElement>('[data-motion-scope="card"]')!
        .click();
      document
        .querySelectorAll<HTMLDetailsElement>('[data-panel=motion] details')
        .forEach((detail) => (detail.open = true));
    });
    const count = original.document.actions?.length || 0;
    await page.locator('#action-add').click({ force: true });
    await page.locator('#action-duration').fill('2.4');
    await page.locator('#action-duration').dispatchEvent('input');
    assert.deepEqual(
      await page.evaluate(() => {
        const actions = window.cardEditorHost.state().document.actions;
        return { count: actions.length, duration: actions.at(-1).duration };
      }),
      { count: count + 1, duration: 2.4 },
    );
    await page.locator('#action-delete').click({ force: true });
    await page.evaluate(() => window.atelierWorkspace.panel('slots'));
    await page.locator('#slot-add').click({ force: true });
    await page.locator('#slot-u').fill('35');
    await page.locator('#slot-u').dispatchEvent('input');
    await page.locator('#slot-clip').check({ force: true });
    await page.selectOption('#slot-effect', 'flow', { force: true });
    assert.deepEqual(
      await page.evaluate(() => {
        const slot = window.cardEditorHost.state().document.slots.at(-1);
        return { u: slot.u, clip: slot.clip, effect: slot.effect };
      }),
      { u: 0.35, clip: true, effect: 'flow' },
    );
    await page.locator('#slot-delete').click({ force: true });
    await page.locator('#preview-layout-menu > summary').click({ force: true });
    await page.selectOption('#preview-axis', 'columns', { force: true });
    await page.locator('#preview-ratio').evaluate((input: HTMLInputElement) => {
      input.value = '55';
      input.dispatchEvent(new Event('input'));
    });
    await page.locator('#preview-layout-menu > summary').click({ force: true });
    assert.equal(
      await page.locator('.view-stage').getAttribute('data-axis'),
      'columns',
    );
    assert.equal(
      await page.locator('#preview-ratio-value').textContent(),
      '55%',
    );

    await page.evaluate(async ({ executable, script }) => {
      await window.cardAIHost.invoke('agent-config', {
        profiles: [
          {
            id: 'ui-smoke',
            name: 'Local UI fixture',
            executable,
            requiresLogin: false,
            chatArgs: [script, '{contract}'],
          },
        ],
      });
      await window.atelierAgents.refresh();
      window.atelierAgents.set({ adapter: 'ui-smoke', inheritDefaults: true });
      window.atelierAgentDock.open();
      for (const id of ['chat-context', 'chat-editor-control'])
        document.querySelector<HTMLInputElement>('#' + id)!.checked = true;
      document.querySelector<HTMLInputElement>('#chat-workflow')!.checked =
        false;
      // Choose an unlocked layer so the same application path can validate and commit the reply.
      const layer = window.cardEditorHost
        .state()
        .document.layers.find((layer) => !layer.locked)!;
      window.cardEditorHost.selectLayer(layer.id);
    }, fixture);
    await page.selectOption('#chat-agent', 'ui-smoke', { force: true });
    assert.equal(await page.locator('#chat-send').isEnabled(), true);
    await page
      .locator('#chat-input')
      .fill('请通过问题确定名称，再将当前图层改名');
    await page.locator('#chat-send').click({ force: true });
    await page.waitForFunction(
      () => !!document.querySelector('[data-question-submit]'),
      null,
      { timeout: 30000 },
    );
    await page.locator('.chat-question textarea').fill('Agent UI verified');
    await page.locator('[data-question-submit]').click({ force: true });
    await page.waitForFunction(
      () =>
        window.cardEditorHost
          .state()
          .document.layers.some((layer) => layer.name === 'Agent UI verified'),
      null,
      { timeout: 30000 },
    );
    // waitForFunction treats the returned Promise as truthy before it resolves.
    // Poll IPC outside the browser and assert the actual persisted response.
    const sessionId = await page.evaluate(() =>
      window.atelierAgentChat.sessionId(),
    );
    if (!sessionId) throw Error('Agent smoke session is missing');
    const readChat = () =>
      page.evaluate(
        (id) => window.cardAIHost.invoke('agent-chat-status', { id }),
        sessionId,
      );
    const deadline = Date.now() + 30000;
    let chat = await readChat();
    while (chat.messages.at(-1)?.commandResult?.state !== 'applied') {
      if (Date.now() >= deadline)
        throw Error('Agent command result was not persisted');
      await new Promise((resolve) => setTimeout(resolve, 50));
      chat = await readChat();
    }
    assert.equal(chat.state, 'idle');
    assert.equal(
      chat.messages.find((message) => message.questions)?.questionResult
        ?.answers.name,
      'Agent UI verified',
    );
    assert.equal(chat.messages.at(-1)?.commandResult?.state, 'applied');
    assert.equal(
      chat.messages.filter((message) => message.role === 'user').length,
      2,
    );
    await page.evaluate(async (id) => {
      await window.cardAIHost.invoke('agent-chat-archive', {
        id,
        archived: true,
      });
    }, chat.id);
  } catch (error) {
    console.error(
      'AGENT_UI_STATE',
      await page.evaluate(async () => {
        const id = window.atelierAgentChat.sessionId();
        return {
          status: document.querySelector('#chat-state')?.textContent,
          choice: window.atelierAgents.selection(),
          session: id
            ? await window.cardAIHost.invoke('agent-chat-status', { id })
            : null,
        };
      }),
    );
    throw error;
  } finally {
    await page.evaluate(async (saved) => {
      window.atelierAgentDock.close();
      document.querySelector<HTMLDialogElement>('#agent-settings')?.close();
      await window.cardAIHost.invoke('agent-config', saved.info.config);
      await window.atelierAgents.refresh();
      window.atelierAgents.set(saved.choice);
      window.cardEditorHost.mutate(
        'Restore workspace smoke',
        (doc: CardDocument) =>
          Object.assign(doc, structuredClone(saved.document)),
      );
      const axis = document.querySelector<HTMLSelectElement>('#preview-axis')!;
      axis.value = saved.axis;
      axis.dispatchEvent(new Event('change'));
      const ratio = document.querySelector<HTMLInputElement>('#preview-ratio')!;
      ratio.value = saved.ratio;
      ratio.dispatchEvent(new Event('input'));
      window.atelierWorkspace.view(saved.view);
      window.atelierWorkspace.panel('properties');
      if (saved.layout === null)
        localStorage.removeItem('atelier-workspace-v5');
      else localStorage.setItem('atelier-workspace-v5', saved.layout);
    }, original);
  }
  console.log('SMOKE_AGENT_WORKSPACE_PASSED');
}
