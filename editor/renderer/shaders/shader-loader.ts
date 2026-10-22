/** Keep the document controls usable before loading CodeMirror and LiteGraph. */
const panel = document.querySelector<HTMLElement>('[data-panel="shader"]');
let flight: Promise<void> | null = null;

window.atelierShaderEditors = {
  set(id: string, value: string) {
    const field = document.getElementById(id) as HTMLTextAreaElement | null;
    if (field) field.value = value;
  },
  readonly(value: boolean) {
    for (const id of ['geometry-code', 'fragment-code']) {
      const field = document.getElementById(id) as HTMLTextAreaElement | null;
      if (field) field.readOnly = value;
    }
  },
  textCommand: () => false,
  clearDiagnostics() {},
  error() {}
};

function load(): Promise<void> {
  if (flight) return flight;
  panel?.setAttribute('aria-busy', 'true');
  flight = (async () => {
    await import('@cardscape/shader-editor');
    await import('@cardscape/shader-nodes');
    window.atelierShaderEditors.readonly(!!window.cardEditorHost.state().busy);
  })().catch((error: unknown) => {
    flight = null;
    const status = document.getElementById('shader-status');
    if (status) status.textContent = `Shader 编辑器加载失败：${error instanceof Error ? error.message : String(error)}`;
    throw error;
  }).finally(() => panel?.removeAttribute('aria-busy'));
  return flight;
}

document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  const control = target?.closest<HTMLElement>('#shader-mode-nodes,#shader-mode-glsl,#shader-node-open');
  if (control && !window.atelierShaderNodes) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void load().then(() => control.click()).catch(console.error);
  }
}, true);

if (panel) {
  new MutationObserver(() => { if (!panel.hidden) void load().catch(console.error); }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  if (!panel.hidden) void load().catch(console.error);
}
