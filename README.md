# Connected Speech Analyzer — web version

**Live:** https://flashist.github.io/connected-speech-analyzer/ (repo: https://github.com/flashist/connected-speech-analyzer)

A single static web page that does everything the Python app does, **inside the browser**: no install, no server,
audio never leaves the computer.

- Speech recognition: Whisper via [Transformers.js](https://huggingface.co/docs/transformers.js) (WebGPU if the
  browser has it — Chrome/Edge/recent Safari — otherwise WASM on the CPU).
- **Fully self-hosted.** The library (`vendor/transformers.js`), the ONNX runtime (`vendor/ort/`) and the model
  files (`models/onnx-community/whisper-base.en_timestamped/`) are served from the site itself, so it works even where
  huggingface.co or CDNs are unreachable (the first teacher to try it couldn't reach Hugging Face at all). Files over
  90 MB are split into `.partN` chunks (GitHub's 100 MB limit) and reassembled by a small custom cache in
  `js/asr-worker.js`; `models/manifest.json` lists them. Model: `whisper-base.en` — fp32 encoder + q4 decoder on
  WebGPU (~210 MB, fp16 files produce garbage on some GPUs), q8 files on WASM (~77 MB). The browser keeps them in
  its Cache API after the first download.
- Dictionary IPA: CMUdict as `data/cmudict.json` (3.7 MB, ~1 MB compressed).
- Connected-speech rules: `js/rules.js`, a line-for-line port of `app/rules.py`. `node test/run.mjs` checks it against
  fixtures generated from the Python engine (`test/fixtures.json`) — keep the two in sync by regenerating the fixtures
  after changing the Python rules.
- Intonation: `js/prosody.js` — YIN pitch tracker (replaces Praat), phrase grouping, nucleus and rise/fall classification.
- Listening notes: optional. Paste a Claude API key in Settings; it is stored only in that browser's `localStorage`
  and sent straight to the Anthropic API from the page.
- Transcript corrections: double-click a word, fix it, press Enter → the analysis re-runs with the corrected word.

## Versioning

The version is shown in the page header (`vX.Y.Z`) and is defined once in `js/app.js` (`VERSION`). The same string is
appended to the script and worker URLs (`app.js?v=…`) so browsers fetch fresh code after a deploy. When you change the
web app: bump `VERSION` in `js/app.js` **and** the `?v=` in `index.html`, then deploy.

## Run locally

```sh
cd web && python3 -m http.server 8766     # then open http://127.0.0.1:8766
```

Must be served over http(s) (not `file://`) because it uses ES modules and a Web Worker. Python's `http.server` is single-threaded and occasionally answers 503 under the worker's parallel requests — harmless for testing, but use a real host for anything else.

## Publish

It is a plain static site — copy the `web/` folder to any static host:

- **GitHub Pages**: push `web/` (e.g. as the `docs/` folder or a `gh-pages` branch) → Settings → Pages. Total size ≈ 345 MB, under the 1 GB Pages limit; no single file exceeds 95 MB.
- **Cloudflare Pages / Netlify / Vercel**: drag-and-drop the `web/` folder, or point them at the repo with `web` as the
  publish directory. No build step.

Requirements of the host: nothing special. HTTPS is needed for WebGPU in some browsers (localhost is exempt).

## Browser support

| Browser | Speech model runs on | 1-minute clip, `base.en` |
|---|---|---|
| Chrome / Edge (desktop) | WebGPU | ~10–20 s |
| Safari 17.4+ / iOS 18+ | WebGPU (Safari ≥ 26) or WASM | 10 s – 1 min |
| Firefox | WASM (WebGPU behind a flag) | ~1 min |

Older or low-memory devices may struggle with the `small` / `turbo` models; `base` is the safe default.
