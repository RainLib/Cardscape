import dom from './ui-dom.ts';
import i18n from './ui-i18n.ts';
import type { UiLanguage } from '../../shared/contracts';

const key = 'cardscape.interface-language';
const documentRoot = document.documentElement;
const controls = Array.from(document.querySelectorAll<HTMLSelectElement>('select[data-ui-language]'));

function storedLanguage(): UiLanguage {
  try {
    return i18n.language(localStorage.getItem(key));
  } catch {
    return 'en';
  }
}

const localizer = dom.create(documentRoot, storedLanguage());
function show(language: UiLanguage) {
  if (documentRoot.lang !== language) {
    localizer.set(language);
    window.cardEditorHost?.redraw();
    window.dispatchEvent(new Event('cardscape-language-change'));
  }
  for (const control of controls) control.value = language;
}

function save(language: UiLanguage) {
  try {
    localStorage.setItem(key, language);
  } catch {
    // The current choice still works in browsers with storage disabled.
  }
  show(language);
}

show(i18n.language(documentRoot.lang));
window.atelier?.onUiLanguage?.(save);
window.atelier?.invoke('ui-language').then(save).catch(() => {});

for (const control of controls)
  control.addEventListener('change', async () => {
    if (!i18n.isLanguage(control.value)) return;
    const choice = control.value;
    if (!window.atelier) {
      save(choice);
      return;
    }
    for (const select of controls) select.disabled = true;
    try {
      save(await window.atelier.invoke('set-ui-language', choice));
    } catch (error) {
      show(i18n.language(documentRoot.lang));
      window.cardEditorHost?.say(error instanceof Error ? error.message : String(error));
    } finally {
      for (const select of controls) select.disabled = false;
    }
  });
