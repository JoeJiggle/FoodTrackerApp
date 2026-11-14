// Kleine DOM-Hilfen: Elemente bauen, Bildschirme (Stapel), Auswahlblätter, Dialoge, Hinweise.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const icon = (name) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
};

/** Zahnrad oben rechts: öffnet die Einstellungen. */
export const settingsButton = () => h('a', { class: 'btn-icon settings-btn', href: '#einstellungen', 'aria-label': 'Einstellungen' }, icon('gear'));

/** Seitenkopf: Titel links, Zahnrad rechts (oder Zurück-Pfeil links, wenn back gesetzt ist). */
export function pageHeader(title, { back } = {}) {
  return h('div', { class: 'page-head' },
    back && h('button', { class: 'btn-icon', 'aria-label': 'Zurück', onclick: back }, icon('back')),
    h('h1', { class: 'page-title' }, title),
    !back && settingsButton(),
  );
}

// ---------- Bildschirm-Stapel (Vollbild-Ebenen über der Hauptansicht) ----------

const stack = [];

/**
 * Öffnet einen Vollbild-Bildschirm. render(body, api) füllt den Inhalt.
 * Gibt ein Objekt mit close() zurück. onClose wird beim Schließen aufgerufen.
 */
export function openScreen({ title, render, actions, onClose, className }) {
  const body = h('div', { class: 'screen-body' });
  const header = h('header', { class: 'screen-header' },
    h('button', { class: 'btn-icon', 'aria-label': 'Zurück', onclick: () => api.close() }, icon('back')),
    h('h2', null, title),
    h('div', { class: 'screen-actions' }, actions ?? []),
  );
  const el = h('section', { class: `screen ${className ?? ''}`, role: 'dialog', 'aria-label': title }, header, body);
  const api = {
    el,
    body,
    setTitle: (t) => (header.querySelector('h2').textContent = t),
    close() {
      const i = stack.indexOf(api);
      if (i < 0) return;
      stack.splice(i, 1);
      el.classList.remove('open');
      setTimeout(() => el.remove(), 220);
      onClose?.();
    },
  };
  document.body.append(el);
  stack.push(api);
  el.getBoundingClientRect(); // Layout erzwingen, damit der Übergang startet
  el.classList.add('open');
  render?.(body, api);
  return api;
}

export function closeAllScreens() {
  for (const s of [...stack].reverse()) s.close();
}

// ---------- Auswahlblatt von unten ----------

/** items: [{label, icon, onClick, danger}] oder DOM-Knoten. */
export function actionSheet({ title, items, top }) {
  const backdrop = h('div', { class: 'backdrop' });
  const close = () => {
    backdrop.classList.remove('open');
    setTimeout(() => backdrop.remove(), 200);
  };
  const sheet = h('div', { class: 'sheet', role: 'dialog' },
    title && h('div', { class: 'sheet-title' }, title),
    top,
    items.map((it) => it instanceof Node ? it : h('button', {
      class: `sheet-item ${it.danger ? 'danger' : ''}`,
      onclick: () => { close(); it.onClick?.(); },
    }, it.icon && icon(it.icon), h('span', null, it.label), it.hint && h('small', null, it.hint))),
    h('button', { class: 'sheet-item cancel', onclick: close }, 'Abbrechen'),
  );
  backdrop.append(sheet);
  backdrop.addEventListener('click', (e) => e.target === backdrop && close());
  document.body.append(backdrop);
  backdrop.getBoundingClientRect();
  backdrop.classList.add('open');
  return { close };
}

/** Bestätigungsdialog. buttons: [{label, value, danger, primary}] → Promise mit value (oder null bei Abbruch). */
export function ask({ title, text, buttons }) {
  return new Promise((resolve) => {
    const backdrop = h('div', { class: 'backdrop center' });
    const finish = (v) => {
      backdrop.classList.remove('open');
      setTimeout(() => backdrop.remove(), 200);
      resolve(v);
    };
    backdrop.append(h('div', { class: 'dialog', role: 'alertdialog' },
      title && h('h3', null, title),
      text && h('p', null, text),
      h('div', { class: 'dialog-buttons' },
        buttons.map((b) => h('button', { class: `btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}`, onclick: () => finish(b.value) }, b.label)),
      ),
    ));
    backdrop.addEventListener('click', (e) => e.target === backdrop && finish(null));
    document.body.append(backdrop);
    backdrop.getBoundingClientRect();
  backdrop.classList.add('open');
  });
}

/** Dialog mit einem Textfeld → Promise mit dem eingegebenen Text (oder null bei Abbruch). */
export function promptText({ title, text, value = '', placeholder = '', okLabel = 'OK' }) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'text', value, placeholder, autocomplete: 'off', enterkeyhint: 'done' });
    const backdrop = h('div', { class: 'backdrop center' });
    const finish = (v) => {
      backdrop.classList.remove('open');
      setTimeout(() => backdrop.remove(), 200);
      resolve(v);
    };
    const ok = () => { const v = input.value.trim(); if (v) finish(v); };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && ok());
    backdrop.append(h('div', { class: 'dialog', role: 'dialog' },
      title && h('h3', null, title),
      text && h('p', null, text),
      h('div', { style: { marginBottom: '14px' } }, input),
      h('div', { class: 'dialog-buttons' },
        h('button', { class: 'btn primary', onclick: ok }, okLabel),
        h('button', { class: 'btn', onclick: () => finish(null) }, 'Abbrechen'),
      ),
    ));
    document.body.append(backdrop);
    backdrop.getBoundingClientRect();
    backdrop.classList.add('open');
    setTimeout(() => { input.focus(); input.select(); }, 150);
  });
}

export const confirmAction = (text, label = 'OK', danger = false) =>
  ask({ text, buttons: [{ label: 'Abbrechen', value: false }, { label, value: true, primary: !danger, danger }] });

let toastTimer;
export function toast(message, { action, onAction, duration = 3000 } = {}) {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast', role: 'status' }, h('span', null, message),
    action && h('button', { onclick: () => { el.remove(); onAction?.(); } }, action));
  document.body.append(el);
  clearTimeout(toastTimer);
  if (duration) toastTimer = setTimeout(() => el.remove(), duration);
  return el;
}

/** Eingabefeld für Dezimalzahlen mit deutscher Tastatur. */
export function decimalInput(props = {}) {
  return h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done', ...props });
}
