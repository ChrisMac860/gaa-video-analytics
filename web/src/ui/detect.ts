import { h } from './dom';
import { hasVideo, video } from './state';

/**
 * Optional, single-frame person/ball detection in the browser (YOLOX-nano, Apache-2.0, via onnxruntime-web).
 * Detection only: no tracking, no events, nothing is added to statistics.
 */
const SIZE = 416;
const CONF = 0.3;
const NMS_IOU = 0.45;

export const detectOverlay = h('canvas', { class: 'overlay', 'aria-hidden': 'true' });

interface Det { x1: number; y1: number; x2: number; y2: number; score: number; cls: 0 | 32 }

type OrtModule = typeof import('onnxruntime-web/wasm');
let ortP: Promise<{ ort: OrtModule; session: import('onnxruntime-web/wasm').InferenceSession }> | null = null;

async function loadSession() {
  const url = new URL('models/yolox_nano.onnx', document.baseURI).href;
  const res = await fetch(url);
  const buf = res.ok ? await res.arrayBuffer() : null;
  if (!buf || buf.byteLength < 1_000_000) throw new Error('MODEL_MISSING');
  const ort = await import('onnxruntime-web/wasm');
  // Self-hosted runtime (no third-party CDN): Vite emits the .wasm next to the app.
  const wasmUrl = (await import('onnxruntime-web/ort-wasm-simd-threaded.wasm?url')).default;
  ort.env.wasm.wasmPaths = { wasm: new URL(wasmUrl, document.baseURI).href };
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: ['wasm'] });
  return { ort, session };
}

function iou(a: Det, b: Det): number {
  const w = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const hh = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const inter = w * hh;
  return inter / ((a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter + 1e-9);
}

function nms(dets: Det[]): Det[] {
  const out: Det[] = [];
  for (const d of dets.sort((a, b) => b.score - a.score)) if (out.every((o) => o.cls !== d.cls || iou(o, d) <= NMS_IOU)) out.push(d);
  return out;
}

/** YOLOX preprocessing: BGR, letterbox top-left on 114 canvas, CHW float32, no normalisation. */
function preprocess(): { data: Float32Array; r: number } {
  const vw = video.videoWidth, vh = video.videoHeight;
  const r = Math.min(SIZE / vh, SIZE / vw);
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = 'rgb(114,114,114)';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(video, 0, 0, vw, vh, 0, 0, Math.round(vw * r), Math.round(vh * r));
  const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const plane = SIZE * SIZE;
  const data = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    data[i] = px[i * 4 + 2]; // B
    data[plane + i] = px[i * 4 + 1]; // G
    data[2 * plane + i] = px[i * 4]; // R
  }
  return { data, r };
}

function decode(out: Float32Array, r: number): Det[] {
  const dets: Det[] = [];
  let idx = 0;
  for (const stride of [8, 16, 32]) {
    const n = SIZE / stride;
    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++, idx++) {
        const o = idx * 85;
        const obj = out[o + 4];
        if (obj < CONF) continue;
        const cx = (out[o] + gx) * stride, cy = (out[o + 1] + gy) * stride;
        const w = Math.exp(out[o + 2]) * stride, hh = Math.exp(out[o + 3]) * stride;
        for (const cls of [0, 32] as const) {
          const score = obj * out[o + 5 + cls];
          if (score < CONF) continue;
          dets.push({ x1: (cx - w / 2) / r, y1: (cy - hh / 2) / r, x2: (cx + w / 2) / r, y2: (cy + hh / 2) / r, score, cls });
        }
      }
    }
  }
  return nms(dets);
}

export interface DetectResult { persons: number; balls: number; ms: number }

export async function detectCurrentFrame(): Promise<DetectResult> {
  if (!hasVideo() || !video.videoWidth) throw new Error('NO_VIDEO');
  ortP ??= loadSession().catch((e) => { ortP = null; throw e; });
  const { ort, session } = await ortP;
  const { data, r } = preprocess();
  const t0 = performance.now();
  const results = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, SIZE, SIZE]) });
  const ms = performance.now() - t0;
  const out = results[session.outputNames[0]].data as Float32Array;
  const dets = decode(out, r);

  const cv = detectOverlay;
  cv.width = video.videoWidth;
  cv.height = video.videoHeight;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.lineWidth = Math.max(2, cv.width / 500);
  ctx.font = `${Math.max(12, cv.width / 70)}px sans-serif`;
  for (const d of dets) {
    ctx.strokeStyle = ctx.fillStyle = d.cls === 0 ? '#22c55e' : '#f59e0b';
    ctx.strokeRect(d.x1, d.y1, d.x2 - d.x1, d.y2 - d.y1);
    ctx.fillText(`${d.cls === 0 ? 'person' : 'ball'} ${d.score.toFixed(2)}`, d.x1, Math.max(12, d.y1 - 3));
  }
  return { persons: dets.filter((d) => d.cls === 0).length, balls: dets.filter((d) => d.cls === 32).length, ms };
}

export function buildDetectPanel(): HTMLElement {
  const out = h('p', { class: 'hint', 'aria-live': 'polite' }, 'Pause on a frame, then press the button. Runs entirely in your browser; the first run downloads the model and the WebAssembly runtime.');
  const btn = h('button', { type: 'button', class: 'btn small', onClick: async () => {
    btn.disabled = true;
    out.textContent = 'Detecting…';
    try {
      video.pause();
      const r = await detectCurrentFrame();
      out.textContent = `${r.persons} people, ${r.balls} ball candidate(s) • inference ${r.ms.toFixed(0)} ms`;
    } catch (err) {
      const m = (err as Error).message;
      out.textContent = m === 'MODEL_MISSING'
        ? 'Detection model not found (models/yolox_nano.onnx). It is downloaded at build time by "npm run fetch-model"; this feature is unavailable in this build. Tagging is unaffected.'
        : m === 'NO_VIDEO' ? 'Open a video first.' : `Detection unavailable: ${m}`;
    } finally { btn.disabled = false; }
  } }, 'Detect people on this frame');
  const clearBtn = h('button', { type: 'button', class: 'btn small', onClick: () => { const c = detectOverlay.getContext('2d'); c?.clearRect(0, 0, detectOverlay.width, detectOverlay.height); } }, 'Clear boxes');
  return h('details', { class: 'card detect' },
    h('summary', null, 'Experimental: detect people on the paused frame'),
    h('p', { class: 'notice' }, 'Detection only (single frame) — no tracking or events. Nothing here counts towards statistics. YOLOX-nano (Apache-2.0).'),
    h('div', { class: 'row' }, btn, clearBtn), out);
}
