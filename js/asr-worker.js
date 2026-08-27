// Whisper in a Web Worker via Transformers.js (WebGPU when available, WASM otherwise).
// Everything is self-hosted: the library (vendor/), the ONNX runtime (vendor/ort/) and the model files
// (models/), so the page works even where huggingface.co or CDNs are unreachable.
import { pipeline, env } from '../vendor/transformers.js';

const SITE = new URL('../', self.location.href).href;          // e.g. https://host/analyzer/
const MODELS = SITE + 'models/';

// Point the library's "remote host" at this site instead of huggingface.co: files live at
// models/<org>/<model>/<file>, the same layout the Hub uses.
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.remoteHost = MODELS;
env.remotePathTemplate = '{model}/';
env.backends.onnx.wasm.wasmPaths = SITE + 'vendor/ort/';        // ORT runtime files, self-hosted

// ---- custom cache: serves files split into <100 MB parts (GitHub limit) and persists them in the Cache API
let manifest = null;
async function getManifest() {
  if (!manifest) manifest = await (await fetch(MODELS + 'manifest.json')).json();
  return manifest;
}
const store = () => (self.caches ? caches.open('csa-models-v1') : null);

env.useCustomCache = true;
env.customCache = {
  async match(key) {
    const c = await store();
    if (c) { const hit = await c.match(key); if (hit) return hit; }
    const rel = key.startsWith(MODELS) ? key.slice(MODELS.length) : null;
    if (!rel) return undefined;
    const m = await getManifest();
    const entry = m[rel];
    if (!entry || !entry.parts) return undefined;               // plain files are fetched normally by the library
    const dir = rel.slice(0, rel.lastIndexOf('/') + 1);
    const file = rel.slice(rel.lastIndexOf('/') + 1);
    const all = new Uint8Array(entry.size); let off = 0;
    for (const p of entry.parts) {
      const r = await fetch(MODELS + dir + p);
      if (!r.ok || !r.body) throw new Error(`Could not download ${p} (${r.status})`);
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        all.set(value, off); off += value.length;
        postMessage({ type: 'progress', data: { status: 'progress', file, loaded: off, total: entry.size, progress: 100 * off / entry.size } });
      }
    }
    if (off !== entry.size) throw new Error(`Download of ${file} incomplete (${off} of ${entry.size} bytes)`);
    const resp = new Response(all, { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(entry.size) } });
    if (c) { try { await c.put(key, resp.clone()); } catch {} }
    return resp;
  },
  async put(key, response) {
    const c = await store();
    if (c) { try { await c.put(key, response); } catch {} }
  },
};

let transcriber = null, loadedKey = '', loading = null;

function load(model, device, dtypeOverride) {
  const key = model + '|' + device + '|' + (dtypeOverride || '');
  if (transcriber && loadedKey === key) return Promise.resolve();
  if (loading && loading.key === key) return loading.p;
  // fp16 variants give garbage on some GPUs, so stick to fp32 encoder + q4 decoder (the combination the official
  // Transformers.js Whisper demo uses). On WASM the q8 ("quantized") files are used.
  const gpuDtype = /large-v3-turbo/.test(model) ? { encoder_model: 'q4', decoder_model_merged: 'q4' }
                 : { encoder_model: 'fp32', decoder_model_merged: 'q4' };
  const opts = {
    device,
    dtype: dtypeOverride || (device === 'webgpu' ? gpuDtype : 'q8'),
    progress_callback: p => postMessage({ type: 'progress', data: p }),
  };
  const p = pipeline('automatic-speech-recognition', model, opts).then(t => { transcriber = t; loadedKey = key; loading = null; }, err => { loading = null; throw err; });
  loading = { key, p };
  return p;
}
self.onerror = e => postMessage({ type: 'error', id: null, message: 'worker error: ' + (e && e.message || e) });

self.onmessage = async e => {
  const { type, audio, model, device, id, dtype } = e.data;
  try {
    if (type === 'load') { await load(model, device, dtype); postMessage({ type: 'ready', id }); return; }
    if (type === 'transcribe') {
      await load(model, device, dtype);
      const t0 = performance.now();
      const genOpts = { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 };
      if (!/\.en(_|$)/.test(model)) Object.assign(genOpts, { language: 'en', task: 'transcribe' });
      const out = await transcriber(audio, genOpts);
      postMessage({ type: 'result', id, data: out, ms: performance.now() - t0 });
    }
  } catch (err) {
    postMessage({ type: 'error', id, message: String(err && err.message || err) });
  }
};
