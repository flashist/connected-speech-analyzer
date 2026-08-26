# Connected Speech Analyzer — web version

A single static web page that does everything the Python app does, **inside the browser**: no install, no server,
audio never leaves the computer.

- Speech recognition: Whisper via [Transformers.js](https://huggingface.co/docs/transformers.js) (WebGPU if the
  browser has it — Chrome/Edge/recent Safari — otherwise WASM on the CPU). Models are fetched from the Hugging Face CDN on
  first use and cached by the browser. Default `whisper-base.en` (~200 MB: fp32 encoder + q4 decoder — fp16 files produce garbage on some GPUs); `small.en` (~590 MB) and `large-v3-turbo` (~760 MB, experimental) selectable in Settings. On WASM the q8 files are used (~77 MB for base).
- Dictionary IPA: CMUdict as `data/cmudict.json` (3.7 MB, ~1 MB compressed).
- Connected-speech rules: `js/rules.js`, a line-for-line port of `app/rules.py`. `node test/run.mjs` checks it against
  fixtures generated from the Python engine (`test/fixtures.json`) — keep the two in sync by regenerating the fixtures
  after changing the Python rules.
- Intonation: `js/prosody.js` — YIN pitch tracker (replaces Praat), phrase grouping, nucleus and rise/fall classification.
- Listening notes: optional. Paste a Claude API key in Settings; it is stored only in that browser's `localStorage`
  and sent straight to the Anthropic API from the page.
- Transcript corrections: double-click a word, fix it, press Enter → the analysis re-runs with the corrected word.

## Run locally

```sh
cd web && python3 -m http.server 8766     # then open http://127.0.0.1:8766
```

Must be served over http(s) (not `file://`) because it uses ES modules and a Web Worker.

## Publish

It is a plain static site — copy the `web/` folder to any static host:

- **GitHub Pages**: push `web/` (e.g. as the `docs/` folder or a `gh-pages` branch) → Settings → Pages.
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
