// Downloads the YOLOX-nano ONNX model (Apache-2.0, Megvii) into public/models/ for the optional in-browser
// detection feature. The file is NOT committed. Failure only warns: the app works without it.
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL_ = 'https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.onnx';
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models', 'yolox_nano.onnx');
const MIN = 1_000_000;

try {
  const s = await stat(dest).catch(() => null);
  if (s && s.size > MIN) {
    console.log(`[fetch-model] already present (${s.size} bytes)`);
    process.exit(0);
  }
  await mkdir(dirname(dest), { recursive: true });
  const res = await fetch(URL_, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < MIN) throw new Error(`downloaded file too small (${buf.length} bytes)`);
  await writeFile(dest, buf);
  console.log(`[fetch-model] saved ${buf.length} bytes to ${dest}`);
} catch (err) {
  console.warn(`[fetch-model] WARNING: could not download model (${err.message}). In-browser detection will be unavailable.`);
}
