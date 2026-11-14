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
// Der Stream bleibt nach dem Schließen des Scanners eine Weile bestehen und wird beim nächsten Scan
// wiederverwendet, damit iOS nicht bei jedem Scan erneut nach der Berechtigung fragt.
// (Die Spur wird dabei bewusst nicht per track.enabled aus- und eingeschaltet: Danach bleibt das
// Kamerabild auf iOS teilweise schwarz.) Nach längerer Nichtbenutzung wird die Kamera freigegeben.

const RELEASE_AFTER_MS = 3 * 60 * 1000;
let stream = null;
let releaseTimer = null;

const isLive = () => stream?.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted);

function stopStream() {
  for (const t of stream?.getTracks() ?? []) t.stop();
  stream = null;
}

/** fresh = true erzwingt einen neuen Stream (z. B. nach „Kamera neu starten“). */
export async function getCameraStream({ fresh = false } = {}) {
  clearTimeout(releaseTimer);
  if (fresh) stopStream();
  if (isLive()) return stream;
  stopStream();
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('Kamera wird nicht unterstützt'), { name: 'NotSupportedError' });
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (e) {
    if (e.name !== 'OverconstrainedError') throw e;
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
  }
  return stream;
}

/** Scanner geschlossen oder App im Hintergrund: Kamera später freigeben, falls sie nicht wieder gebraucht wird. */
export function pauseCamera() {
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(stopStream, RELEASE_AFTER_MS);
}

/** Kurzinfo zum Kamerazustand für die Fehlersuche. */
export function cameraInfo(video) {
  const t = stream?.getVideoTracks()[0];
  const s = t?.getSettings?.() ?? {};
  return [
    t ? `Spur ${t.readyState}${t.muted ? ', stumm' : ''}${t.enabled ? '' : ', aus'}` : 'keine Spur',
    s.width ? `Kamera ${s.width}×${s.height}` : '',
    `Video ${video.videoWidth}×${video.videoHeight}, ${video.paused ? 'pausiert' : 'läuft'}, Status ${video.readyState}`,
  ].filter(Boolean).join(' · ');
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
  brightness = measureBrightness(data.data);
  return bestCode(await readBarcodes(data, LIVE_OPTIONS));
}

// Mittlere Helligkeit (0–255) der zuletzt gelesenen Kamerabilder – zeigt, ob die Kamera nur schwarze Bilder liefert.
let brightness = null;
function measureBrightness(px) {
  let sum = 0, n = 0;
  for (let i = 0; i < px.length; i += 4 * 61) { sum += px[i] + px[i + 1] + px[i + 2]; n += 3; }
  return n ? Math.round(sum / n) : null;
}
export const lastBrightness = () => brightness;
export const resetBrightness = () => { brightness = null; };

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
