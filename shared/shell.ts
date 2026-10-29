import './style.css';

const app = document.querySelector<HTMLElement>('#app');
const page = window.location.pathname.split('/')[1] ?? 'dashboard';
document.body.dataset.page = page;
if (app) {
  const title = document.createElement('h1');
  title.textContent = `Spotter · ${page}`;
  const badge = document.createElement('strong');
  badge.className = 'badge';
  badge.hidden = true;
  badge.textContent = 'SIMULATED';
  const status = document.createElement('p');
  status.textContent = 'analysis unavailable';
  app.append(title, badge, status);
  fetch('/api/status').then(async (response) => {
    if (!response.ok) throw new Error('API unavailable');
    const state = await response.json() as { simulated: boolean };
    badge.hidden = !state.simulated;
  }).catch(() => { status.textContent = 'analysis unavailable · server disconnected'; });
}
