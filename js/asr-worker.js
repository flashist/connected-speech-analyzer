// Whisper in a Web Worker via Transformers.js (WebGPU when available, WASM otherwise).
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/transformers.min.js';
env.allowLocalModels = false;

let transcriber = null, loadedKey = '', loading = null;

function load(model, device) {
  const key = model + '|' + device;
  if (transcriber && loadedKey === key) return Promise.resolve();
  if (loading && loading.key === key) return loading.p;
  // fp16 variants give garbage on some GPUs, so stick to fp32 encoder + q4 decoder (the combination the official
  // Transformers.js Whisper demo uses). Download sizes: base ≈ 205 MB, small ≈ 590 MB, turbo ≈ 760 MB (q4 encoder);
  // on WASM the q8 files are used (base ≈ 77 MB).
  const gpuDtype = /large-v3-turbo/.test(model) ? { encoder_model: 'q4', decoder_model_merged: 'q4' }
                 : { encoder_model: 'fp32', decoder_model_merged: 'q4' };
  const opts = {
    device,
    dtype: device === 'webgpu' ? gpuDtype : 'q8',
    progress_callback: p => postMessage({ type: 'progress', data: p }),
  };
  const p = pipeline('automatic-speech-recognition', model, opts).then(t => { transcriber = t; loadedKey = key; loading = null; }, err => { loading = null; throw err; });
  loading = { key, p };
  return p;
}
self.onerror = e => postMessage({ type: 'error', id: null, message: 'worker error: ' + (e && e.message || e) });

self.onmessage = async e => {
  const { type, audio, model, device, id } = e.data;
  try {
    if (type === 'load') { await load(model, device); postMessage({ type: 'ready', id }); return; }
    if (type === 'transcribe') {
      await load(model, device);
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
