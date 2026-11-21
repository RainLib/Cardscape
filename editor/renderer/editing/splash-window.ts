import dom from '../localization/ui-dom.ts';
import i18n from '../localization/ui-i18n.ts';
import type { SplashState } from '../../shared/contracts';

const documentRoot = document.documentElement;
const locale = dom.create(documentRoot, 'en');
const name = document.getElementById('splash-name')!;
const stage = document.getElementById('splash-stage')!;
const progress = document.getElementById('splash-progress') as HTMLProgressElement;
const percent = document.getElementById('splash-percent')!;
const version = document.getElementById('splash-version')!;

function update(state: SplashState) {
  const language = i18n.language(state.uiLanguage);
  if (documentRoot.lang !== language) locale.set(language);
  name.toggleAttribute('data-ui-content', state.authoredName === true);
  name.textContent = state.name;
  stage.textContent = state.stage;
  progress.value = state.percent;
  percent.textContent = Math.round(state.percent) + '%';
  version.textContent = 'Cardscape ' + state.version;
}

window.atelier.onSplashState(update);
window.atelier.invoke('splash-state').then(update).catch(() => {});
Promise.all([...document.images].map((image) => image.decode()))
  .then(() => console.log('SPLASH_READY', JSON.stringify({ images: document.images.length, artwork: true })))
  .catch((error) => console.error('SPLASH_ART_ERROR', error.message));
