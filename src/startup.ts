import { startupText } from './startupText';
import './startup.css';

const label = document.getElementById('startup-label')!;
const retry = document.getElementById('startup-retry')!;
const preference = localStorage.getItem('interface-language');
const systemLanguage = !preference || preference === 'system';
let copy = startupText(systemLanguage ? navigator.language : preference);
let failed = false;
const update = () => {
  if (!label.isConnected) return;
  label.textContent = failed ? copy.failed : copy.loading;
  retry.textContent = copy.retry;
};
update();
const appearance = localStorage.getItem('appearance');
document.documentElement.dataset.startupTheme = appearance === 'dark' ||
  (appearance !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
if (systemLanguage) {
  void window.inCharacter.getPreferredLanguages().then(languages => {
    copy = startupText(languages[0]);
    update();
  }).catch(console.error);
}
retry.addEventListener('click', () => location.reload());
performance.mark('sic-bootstrap-ready');

// Keep the first paint independent of React/Mantine loading and evaluation.
void import('./main').catch(error => {
  console.error('Editor startup failed:', error);
  failed = true;
  document.querySelector('.startup-loading')?.setAttribute('aria-busy', 'false');
  document.querySelector('.startup-spinner')?.remove();
  retry.hidden = false;
  update();
});
