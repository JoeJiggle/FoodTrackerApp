// Kamera und Barcode-Erkennung (zxing-wasm, lokal in /vendor).
// Wird erst beim ersten Scannen geladen.
import { prepareZXingModule, readBarcodes } from '../vendor/zxing-wasm/es/reader/index.js';

const WASM_URL = new URL('../vendor/zxing-wasm/reader/zxing_reader.wasm', import.meta.url).href;
// Standardmäßig würde die Bibliothek die WASM-Datei von einem CDN laden – wir nehmen die lokale Kopie.
prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? WASM_URL : prefix + path) } });

const FORMATS = ['EAN13', 'EAN8', 'UPCA', 'UPCE'];
const LIVE_OPTIONS = { formats: FORMATS, tryHarder: true, tryRotate: false, tryInvert: false, maxNumberOfSymbols: 1 };
const PHOTO_OPTIONS = { formats: FORMATS, tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: 1 };

// ---------- Kamera ----------
// Der Stream bleibt während der Sitzung bestehen und wird nur pausiert,
// damit iOS nicht bei jedem Scan erneut nach der Berechtigung fragt.

let stream = null;

const isLive = () => stream?.getVideoTracks().some((t) => t.readyState === 'live');

export async function getCameraStream() {
  if (isLive()) {
    for (const t of stream.getVideoTracks()) t.enabled = true;
    return stream;
  }
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('Kamera wird nicht unterstützt'), { name: 'NotSupportedError' });
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
  return stream;
}

export function pauseCamera() {
  for (const t of stream?.getVideoTracks() ?? []) t.enabled = false;
}

// ---------- Erkennung ----------

const canvas = document.createElement('canvas');
const ctx2d = canvas.getContext('2d', { willReadFrequently: true });

function bestCode(results) {
  const r = results.find((x) => x.isValid && /^\d{8,14}$/.test(x.text));
  return r ? r.text : null;
}

/** Erkennt einen Barcode im mittleren Bereich des Videobildes. */
export async function decodeVideoFrame(video) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  // Mittleren Streifen (wie der Rahmen auf dem Bildschirm) ausschneiden – schneller und genauer.
  const sw = vw * 0.9, sh = Math.min(vh, vw * 0.6);
  const scale = Math.min(1, 1280 / sw);
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  ctx2d.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  const data = ctx2d.getImageData(0, 0, canvas.width, canvas.height);
  return bestCode(await readBarcodes(data, LIVE_OPTIONS));
}

/** Erkennt einen Barcode in einem Foto (Datei aus der System-Kamera). */
export async function decodeImageFile(file) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    ctx2d.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const code = bestCode(await readBarcodes(ctx2d.getImageData(0, 0, canvas.width, canvas.height), PHOTO_OPTIONS));
    if (code) return code;
  } catch (e) {
    console.warn('Bild konnte nicht über den Browser gelesen werden:', e);
  }
  // Zweiter Versuch: Bilddatei direkt an die Bibliothek geben
  try {
    return bestCode(await readBarcodes(file, PHOTO_OPTIONS));
  } catch {
    return null;
  }
}
