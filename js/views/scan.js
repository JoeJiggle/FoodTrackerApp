// Scan-Bildschirm mit drei Wegen: Live-Kamera, Foto, Nummer eintippen.
import { h, icon, openScreen, toast } from '../ui.js';
import { isValidBarcode } from '../nutrition.js';
import { findLocalBarcode, fetchAndStoreProduct } from '../foods.js';
import { openFoodDetail } from './add.js';
import { openManualForm } from './manual.js';

let scannerModule;
const loadScanner = () => (scannerModule ??= import('../scanner.js'));

let lastHit = { code: '', time: 0 };

/** ctx wird an die Detailansicht weitergereicht (Datum/Mahlzeit oder Zutatenmodus). */
export function openScanner(ctx) {
  let running = false;
  let loopTimer = null;
  let video;

  const stopLoop = () => {
    running = false;
    clearTimeout(loopTimer);
  };

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      stopLoop();
      video?.pause();
      scannerModule?.then((m) => m.pauseCamera());
    } else if (screen.el.isConnected) {
      startCamera();
    }
  };

  let screen;
  let msg;
  let wrap;

  async function startCamera() {
    msg.textContent = 'Kamera wird gestartet …';
    try {
      const m = await loadScanner();
      const stream = await m.getCameraStream();
      if (!screen.el.isConnected) return m.pauseCamera();
      if (video.srcObject !== stream) video.srcObject = stream;
      await video.play().catch(() => {});
      msg.textContent = 'Barcode in den Rahmen halten';
      running = true;
      loop(m);
    } catch (e) {
      console.warn(e);
      msg.textContent = e?.name === 'NotAllowedError'
        ? 'Kein Kamerazugriff. Du kannst „Foto aufnehmen“ verwenden oder die Nummer eintippen.'
        : 'Die Kamera ist nicht verfügbar. Nutze „Foto aufnehmen“ oder tippe die Nummer ein.';
    }
  }

  async function loop(m) {
    if (!running) return;
    let code = null;
    try { code = await m.decodeVideoFrame(video); } catch (e) { console.warn(e); }
    if (!running) return;
    if (code && !(code === lastHit.code && Date.now() - lastHit.time < 3000)) {
      lastHit = { code, time: Date.now() };
      hit(code);
      return;
    }
    loopTimer = setTimeout(() => loop(m), 120);
  }

  function hit(code) {
    stopLoop();
    wrap.classList.add('hit');
    navigator.vibrate?.(60);
    setTimeout(() => {
      screen.close();
      handleBarcode(code, ctx);
    }, 250);
  }

  screen = openScreen({
    title: 'Barcode scannen',
    className: 'scanner',
    onClose: () => {
      stopLoop();
      document.removeEventListener('visibilitychange', onVisibility);
      video.pause();
      scannerModule?.then((m) => m.pauseCamera());
    },
    render(body) {
      video = h('video', { playsinline: true, muted: true, autoplay: true, 'aria-label': 'Kamerabild' });
      video.setAttribute('playsinline', '');
      video.muted = true;
      msg = h('div', { class: 'msg' });
      wrap = h('div', { class: 'video-wrap' }, video, h('div', { class: 'frame' }), msg);
      const photo = h('input', { type: 'file', accept: 'image/*', capture: 'environment', 'aria-label': 'Foto aufnehmen' });
      photo.addEventListener('change', async () => {
        const file = photo.files?.[0];
        photo.value = '';
        if (!file) return;
        msg.textContent = 'Foto wird ausgewertet …';
        const m = await loadScanner();
        const code = await m.decodeImageFile(file);
        if (code) return hit(code);
        msg.textContent = 'Kein Barcode erkannt.';
        toast('Kein Barcode erkannt. Näher heran, Code gerade halten, auf gutes Licht achten – oder Nummer eintippen.', { duration: 6000 });
      });
      body.append(wrap, h('div', { class: 'scanner-tools' },
        h('label', { class: 'btn' }, icon('camera'), 'Foto aufnehmen', photo),
        h('button', { class: 'btn', onclick: () => { screen.close(); openBarcodeInput(ctx); } }, icon('keyboard'), 'Nummer eingeben'),
      ));
      document.addEventListener('visibilitychange', onVisibility);
      startCamera();
    },
  });
}

/** Barcode von Hand eintippen, mit Prüfziffer-Kontrolle. */
export function openBarcodeInput(ctx, initial = '') {
  return openScreen({
    title: 'Barcode eingeben',
    render(body, screen) {
      const input = h('input', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', value: initial, placeholder: 'z. B. 4000417025005', 'aria-label': 'Barcode-Nummer', enterkeyhint: 'search' });
      const info = h('p', { class: 'small muted', style: { minHeight: '20px' } });
      const go = h('button', { class: 'btn primary block', disabled: true }, 'Suchen');
      const check = () => {
        const v = input.value.replace(/\D/g, '');
        if (v !== input.value) input.value = v;
        const ok = isValidBarcode(v);
        go.disabled = !ok;
        info.style.color = v && !ok && [8, 12, 13].includes(v.length) ? 'var(--danger)' : '';
        info.textContent = !v ? '8, 12 oder 13 Ziffern unter dem Strichcode.'
          : ok ? 'Prüfziffer stimmt.'
          : [8, 12, 13].includes(v.length) ? 'Prüfziffer stimmt nicht – bitte Nummer kontrollieren.' : `${v.length} Ziffern`;
      };
      const submit = () => { if (!go.disabled) { screen.close(); handleBarcode(input.value, ctx); } };
      input.addEventListener('input', check);
      input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
      go.addEventListener('click', submit);
      body.append(h('div', { class: 'card' }, input, info, go));
      check();
      setTimeout(() => input.focus(), 250);
    },
  });
}

/** Barcode auflösen: lokal → Open Food Facts → manuelle Erfassung. */
export async function handleBarcode(code, ctx) {
  const local = await findLocalBarcode(code);
  if (local) return openFoodDetail(local, ctx);

  openScreen({
    title: code,
    render(body, screen) {
      const box = h('div', { class: 'card' });
      body.append(box);
      const manual = () => { screen.close(); openManualForm({ barcode: code, onSaved: (f) => openFoodDetail(f, ctx) }); };
      const attempt = async () => {
        box.replaceChildren(h('p', null, 'Suche bei Open Food Facts …'));
        try {
          const food = await fetchAndStoreProduct(code);
          if (!screen.el.isConnected) return;
          if (food) {
            screen.close();
            openFoodDetail(food, ctx);
          } else {
            box.replaceChildren(
              h('h3', null, 'Produkt nicht gefunden'),
              h('p', { class: 'muted' }, `Den Barcode ${code} kennt Open Food Facts noch nicht. Du kannst die Nährwerte von der Verpackung abtippen – das Produkt wird dann lokal gespeichert.`),
              h('button', { class: 'btn primary block', onclick: manual }, 'Manuell erfassen'),
            );
          }
        } catch (e) {
          if (!screen.el.isConnected) return;
          box.replaceChildren(
            h('h3', null, 'Gerade keine Verbindung'),
            h('p', { class: 'muted' }, `${e.message} Du kannst es gleich noch einmal versuchen oder die Werte selbst eintragen.`),
            h('div', { class: 'stack' },
              h('button', { class: 'btn primary block', onclick: attempt }, 'Erneut versuchen'),
              h('button', { class: 'btn block', onclick: manual }, 'Manuell erfassen'),
            ),
          );
        }
      };
      attempt();
    },
  });
}
