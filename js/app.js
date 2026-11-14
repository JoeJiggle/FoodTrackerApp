// Einstiegspunkt: Navigation, Service Worker, Start.
import { openDB } from './db.js';
import { loadSettings, settings, setSetting } from './settings.js';
import { setRerender, state } from './state.js';
import { todayISO } from './format.js';
import { h } from './ui.js';
import { renderToday, openAddMenu } from './views/today.js';
import { renderHistory } from './views/history.js';
import { renderOwnFoods } from './views/own-foods.js';
import { renderSettings } from './views/settings.js';


const ROUTES = {
  heute: renderToday,
  verlauf: renderHistory,
  eigene: renderOwnFoods,
  einstellungen: renderSettings,
};

const view = document.getElementById('view');

async function render() {
  const route = location.hash.slice(1) || 'heute';
  const fn = ROUTES[route] ?? renderToday;
  for (const a of document.querySelectorAll('.tabbar a')) a.classList.toggle('active', a.dataset.tab === route);
  const scroll = view.dataset.route === route ? window.scrollY : 0;
  view.dataset.route = route;
  const frag = h('div');
  try {
    await fn(frag);
  } catch (e) {
    console.error(e);
    frag.replaceChildren(h('div', { class: 'card' }, h('h3', null, 'Fehler'), h('p', null, String(e.message || e))));
  }
  view.replaceChildren(...frag.childNodes);
  window.scrollTo(0, scroll);
}

async function start() {
  try {
    await openDB();
    await loadSettings();
  } catch (e) {
    view.replaceChildren(h('div', { class: 'card' }, h('h3', null, 'Speicher nicht verfügbar'),
      h('p', null, 'Die App kann ihre lokale Datenbank nicht öffnen. Im privaten Modus von Safari funktioniert das nicht.'),
      h('p', { class: 'muted small' }, String(e.message || e))));
    return;
  }
  setRerender(render);
  window.addEventListener('hashchange', render);
  document.getElementById('fab').addEventListener('click', () => openAddMenu());
  await render();
  watchDayChange();
  requestPersistence();
  registerServiceWorker();
}

/**
 * iOS hält die App oft über Nacht im Hintergrund. Zeigte „Heute“ den alten Tag, beim Zurückkehren
 * auf den neuen Tag wechseln – sonst würden neue Einträge beim Vortag landen.
 */
function watchDayChange() {
  let lastToday = todayISO();
  const check = () => {
    const now = todayISO();
    if (now === lastToday) return;
    if (state.date === lastToday) {
      state.date = now;
      if ((location.hash.slice(1) || 'heute') === 'heute') render();
    }
    lastToday = now;
  };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
  window.addEventListener('focus', check);
  setInterval(check, 60 * 1000);
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen (einmalig). */
async function requestPersistence() {
  if (settings().persistRequested || !navigator.storage?.persist) return;
  try { await navigator.storage.persist(); } catch { /* egal */ }
  await setSetting('persistRequested', true);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const banner = document.getElementById('update-banner');
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const showUpdate = (worker) => {
      banner.hidden = false;
      document.getElementById('update-reload').onclick = () => worker.postMessage('skipWaiting');
    };
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w);
      });
    });
    // Beim Zurückkehren in die App nach Updates schauen
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
  }).catch((e) => console.warn('Service Worker nicht registriert:', e));
}

start();
