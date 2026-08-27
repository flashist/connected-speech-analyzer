import { decodeTo16k, toWavBlob } from './audio.js';
import { loadDict } from './phonemes.js';
import { analyze } from './rules.js';
import { silences, refineTimestamps, analyzeProsody } from './prosody.js';
import { explain } from './explain.js';

const TYPES = {
  contraction: { c: 'var(--c-contr)', n: 'Contraction' }, weak_form: { c: 'var(--c-weak)', n: 'Weak form' }, flapping: { c: 'var(--c-flap)', n: 'Flap' },
  assimilation: { c: 'var(--c-assim)', n: 'Assimilation' }, elision: { c: 'var(--c-elis)', n: 'Dropped sound' }, glottal: { c: 'var(--c-glot)', n: 'Glottal T' }, linking: { c: 'var(--c-link)', n: 'Linking' },
};
const MODELS = {
  base: 'onnx-community/whisper-base.en_timestamped',
  small: 'onnx-community/whisper-small.en_timestamped',
  turbo: 'onnx-community/whisper-large-v3-turbo_timestamped',
};
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PUNCT = /[^\p{L}\p{N}'\-]+/gu;

let R = null, AUDIO = null, stopAt = null, activeFilter = null, worker = null, dictReady = null;
const audio = $('#audio');

// ---------- settings ----------
const settings = { model: 'base', key: '' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('csa-settings') || '{}')); } catch {}
function saveSettings() { try { localStorage.setItem('csa-settings', JSON.stringify(settings)); } catch {} }
settings.model = 'base';   // only the base model is self-hosted on the site
$('#apikey').value = settings.key;
$('#apikey').onchange = e => { settings.key = e.target.value.trim(); saveSettings(); };
$('#toggle-settings').onclick = () => { $('#settings').classList.toggle('open'); };

const hasWebGPU = !!navigator.gpu;
const DTYPE = new URLSearchParams(location.search).get('dtype') || undefined;   // e.g. ?dtype=q8 to force the small int8 files
$('#engine').textContent = hasWebGPU ? 'WebGPU available — fast.' : 'No WebGPU in this browser — using the slower CPU path (Chrome or Edge recommended).';

function setStatus(html) { $('#status').innerHTML = html; }

function getWorker() {
  if (!worker) worker = new Worker('./js/asr-worker.js', { type: 'module' });
  return worker;
}
function transcribe(samples) {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const id = Math.random().toString(36).slice(2);
    const seen = {};
    const onmsg = e => {
      const m = e.data;
      if (m.type === 'progress') {
        const p = m.data;
        if (p.status === 'progress' && p.file) { seen[p.file] = [p.loaded || 0, p.total || 0]; let l = 0, t = 0; for (const f in seen) { l += seen[f][0]; t += seen[f][1]; }
          setStatus(`<span class="spinner"></span>Downloading speech model (first time only, then cached)… ${(l / 1048576).toFixed(0)} / ${(t / 1048576).toFixed(0)} MB`); }
        else if (p.status === 'ready') setStatus('<span class="spinner"></span>Transcribing…');
        return;
      }
      if (m.id !== id) return;
      w.removeEventListener('message', onmsg);
      if (m.type === 'result') resolve(m.data); else if (m.type === 'error') reject(new Error(m.message));
    };
    w.addEventListener('message', onmsg);
    setStatus('<span class="spinner"></span>Loading speech model…');
    w.postMessage({ type: 'transcribe', id, audio: samples, model: MODELS[settings.model], device: hasWebGPU ? 'webgpu' : 'wasm', dtype: DTYPE });
  });
}

function wordsFromChunks(out) {
  const words = [];
  for (const c of out.chunks || []) {
    const raw = (c.text || '').trim(); if (!raw) continue;
    const text = raw.replace(PUNCT, '').toLowerCase().replace(/^['-]+|['-]+$/g, ''); if (!text) continue;
    const m = /[.,!?;:…]+$/.exec(raw); const punct = m ? m[0] : '';
    let [s, e] = c.timestamp; if (e === null || e === undefined) e = s + 0.2;
    words.push({ idx: words.length, raw, text, start: +s, end: +e, prob: 1, ends_phrase: !!punct, punct });
  }
  return words;
}

function runAnalysis(words) {
  const { words: aws, phenomena } = analyze(words);
  const prosody = analyzeProsody(AUDIO.samples, AUDIO.sampleRate, aws);
  return {
    transcript: words.map(w => w.raw).join(' '),
    words: aws.map(aw => ({ idx: aw.w.idx, text: aw.w.text, raw: aw.w.raw, start: aw.w.start, end: aw.w.end, ends_phrase: aw.w.ends_phrase, punct: aw.w.punct,
      citation: aw.citation.render(), connected: aw.connected.render(), found: aw.citation.found, is_function: aw.is_function, stressed: aw.stressed, absorbed: aw.absorbed, link_next: aw.link_next, phenomena: aw.phenomena })),
    phenomena, prosody,
  };
}

$('#go').onclick = async () => {
  const f = $('#file').files[0]; if (!f) { setStatus('Choose a file first.'); return; }
  $('#go').disabled = true;
  try {
    setStatus('<span class="spinner"></span>Decoding audio…');
    if (!dictReady) dictReady = loadDict('./data/cmudict.json');
    AUDIO = await decodeTo16k(f);
    if (AUDIO.duration > 180) throw new Error(`Clip is ${AUDIO.duration.toFixed(0)} s; please keep it under 3 minutes.`);
    audio.src = URL.createObjectURL(toWavBlob(AUDIO.samples, AUDIO.sampleRate));
    const t0 = performance.now();
    const out = await transcribe(AUDIO.samples);
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    await dictReady;
    setStatus('<span class="spinner"></span>Analyzing…');
    const words = wordsFromChunks(out);
    if (!words.length) throw new Error('No speech detected in this file.');
    refineTimestamps(words, silences(AUDIO.samples, AUDIO.sampleRate));
    R = runAnalysis(words); R.source_name = f.name; R.duration = AUDIO.duration; R.rawWords = words;
    render();
    setStatus(`Done — transcribed in ${secs} s.`);
  } catch (e) { console.error(e); setStatus('Error: ' + esc(e.message)); }
  $('#go').disabled = false;
};

// ---------- transcript correction ----------
function reanalyze() {
  R = Object.assign(runAnalysis(R.rawWords), { source_name: R.source_name, duration: R.duration, rawWords: R.rawWords });
  render();
}

function playSpan(s, e) { audio.currentTime = Math.max(0, s - 0.03); stopAt = e + 0.05; audio.play(); }
audio.addEventListener('timeupdate', () => {
  if (stopAt != null && audio.currentTime >= stopAt) { audio.pause(); stopAt = null; }
  if (!R) return;
  const t = audio.currentTime;
  document.querySelectorAll('.word').forEach(el => { const w = R.words[+el.dataset.i]; el.classList.toggle('playing', !audio.paused && t >= w.start && t <= w.end); });
});
audio.addEventListener('pause', () => document.querySelectorAll('.word.playing').forEach(e => e.classList.remove('playing')));

function render() {
  $('#results').style.display = '';
  $('#title').textContent = `${R.source_name} · ${R.duration.toFixed(1)} s`;
  renderTranscript(); renderIntonation(); renderPhenomena();
  $('#notes').textContent = ''; $('#notes-src').textContent = '';
  window.scrollTo({ top: $('#results').offsetTop - 10, behavior: 'smooth' });
}

function spanFor(w) {
  for (const pid of w.phenomena) { const p = R.phenomena[pid]; if (p.type === 'contraction' && p.words.length > 1 && p.words[0] === w.idx) return p; }
  return null;
}

function renderTranscript() {
  const box = $('#transcript'); box.innerHTML = '';
  const nuclei = new Set(R.prosody.phrases.map(p => p.nucleus));
  const accented = new Set(R.prosody.phrases.flatMap(p => p.accented));
  for (const ph of R.prosody.phrases) {
    const div = document.createElement('div'); div.className = 'phrase';
    const tag = document.createElement('div'); tag.className = 'tag';
    tag.textContent = `${ph.title} ${ph.arrow} · ${ph.start.toFixed(1)}–${ph.end.toFixed(1)} s`;
    div.appendChild(tag);
    ph.words.forEach((wi, k) => {
      const w = R.words[wi];
      const el = document.createElement('div');
      el.className = 'word' + (w.is_function ? ' fn' : '') + (w.stressed ? ' stressed' : '') + (nuclei.has(w.idx) ? ' nucleus' : '') + (accented.has(w.idx) ? ' accented' : '') + (w.absorbed ? ' absorbed' : '') + (w.phenomena.length ? '' : ' plain');
      el.dataset.i = w.idx;
      let txt = w.raw, con = w.connected, cit = w.citation;
      const span = spanFor(w);
      if (span) { txt = span.words.map(i => R.words[i].raw).join(' '); cit = span.before; con = span.after; }
      const changed = cit !== con && w.phenomena.length;
      el.innerHTML = `<div class="txt">${esc(txt)}</div><div class="cit">${changed ? esc(cit) : (w.found ? '' : '?')}</div><div class="con">${esc(con || cit)}</div>
        <div class="dot">${[...new Set(w.phenomena.map(p => R.phenomena[p].type))].map(t => `<i style="background:${TYPES[t].c}"></i>`).join('')}</div>`;
      const s = span ? R.words[span.words[0]].start : w.start, e = span ? R.words[span.words[span.words.length - 1]].end : w.end;
      el.onclick = () => playSpan(s, e);
      el.ondblclick = ev => { ev.preventDefault(); editWord(el, w); };
      el.onmouseenter = () => showTip(el, w);
      el.onmouseleave = hideTip;
      div.appendChild(el);
      if (w.link_next && k < ph.words.length - 1) { const l = document.createElement('div'); l.className = 'link'; l.textContent = w.link_next === '‿' ? '‿' : '‿' + w.link_next; div.appendChild(l); }
    });
    box.appendChild(div);
  }
}

function editWord(el, w) {
  hideTip();
  const inp = document.createElement('input'); inp.className = 'edit'; inp.value = w.raw; inp.size = Math.max(4, w.raw.length + 2);
  el.querySelector('.txt').replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const commit = () => {
    if (done) return; done = true;
    const raw = inp.value.trim();
    const rw = R.rawWords[w.idx];
    if (raw && raw !== rw.raw) {
      rw.raw = raw; rw.text = raw.replace(PUNCT, '').toLowerCase().replace(/^['-]+|['-]+$/g, '');
      const m = /[.,!?;:…]+$/.exec(raw); rw.punct = m ? m[0] : ''; rw.ends_phrase = !!rw.punct;
      reanalyze();
    } else renderTranscript();
  };
  inp.onblur = commit; inp.onkeydown = ev => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') { inp.value = w.raw; commit(); } };
}

let tipEl = null;
function showTip(el, w) {
  hideTip();
  const ps = w.phenomena.map(i => R.phenomena[i]);
  const stress = w.absorbed ? '' : (w.stressed ? 'Carries sentence stress.' : 'Unstressed function word — said quickly and quietly.');
  let html = `<b>${esc(w.raw)}</b> <span class="t">${esc(w.citation || '?')}${w.connected && w.connected !== w.citation ? ' → ' + esc(w.connected) : ''}</span>${stress}`;
  for (const p of ps) html += `<hr><span class="k" style="background:${TYPES[p.type].c}">${TYPES[p.type].n}</span><b>${esc(p.label)}</b><span class="t">${esc(p.before)} → ${esc(p.after)}</span>${esc(p.explanation)}`;
  html += `<div class="hint2">double‑click to correct the word</div>`;
  tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.innerHTML = html;
  document.body.appendChild(tipEl);
  const r = el.getBoundingClientRect();
  tipEl.style.left = Math.min(r.left + window.scrollX, window.innerWidth - 340) + 'px'; tipEl.style.top = (r.bottom + window.scrollY + 6) + 'px';
}
function hideTip() { if (tipEl) { tipEl.remove(); tipEl = null; } }

function renderIntonation() {
  const box = $('#intonation'); box.innerHTML = '';
  const [lo, hi] = R.prosody.range_st;
  for (const ph of R.prosody.phrases) {
    const item = document.createElement('div'); item.className = 'item';
    item.innerHTML = `<div class="svgwrap">${drawContour(ph, lo, hi)}</div><div class="desc"><h3><span class="arrow">${ph.arrow}</span>${esc(ph.title)}${ph.nucleus_kind === 'contrastive' ? ' · emphatic stress' : ''}</h3>
      <p class="q">“${esc(ph.text)}” — main stress on <b>${esc(ph.nucleus_text)}</b></p><p>${esc(ph.meaning)}</p></div>`;
    item.querySelector('svg').onclick = () => playSpan(ph.start, ph.end);
    box.appendChild(item);
  }
}
function drawContour(ph, lo, hi) {
  const pxPerSec = 260, W = Math.max(320, Math.round((ph.end - ph.start) * pxPerSec) + 40), H = 150, top = 16, bottom = 44;
  const x = t => 20 + (t - ph.start) * pxPerSec, y = v => top + (hi - v) / Math.max(1, hi - lo) * (H - top - bottom);
  let paths = '', cur = [];
  const flush = () => { if (cur.length > 1) paths += `<path d="M${cur.map(p => p.join(',')).join(' L')}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`; else if (cur.length === 1) paths += `<circle cx="${cur[0][0]}" cy="${cur[0][1]}" r="1.8" fill="var(--accent)"/>`; cur = []; };
  for (const [t, v] of ph.contour) { if (v == null) flush(); else cur.push([x(t).toFixed(1), y(v).toFixed(1)]); }
  flush();
  const mid = y(0); let labels = '';
  for (const i of ph.words) {
    const w = R.words[i]; if (w.absorbed) continue;
    const cx = x((w.start + w.end) / 2), isN = i === ph.nucleus, isA = ph.accented.includes(i);
    labels += `<line x1="${x(w.start).toFixed(1)}" y1="${H - bottom + 4}" x2="${x(w.end).toFixed(1)}" y2="${H - bottom + 4}" stroke="${isN ? 'var(--accent)' : '#d1d5db'}" stroke-width="${isN ? 3 : 1.5}"/>`;
    labels += `<text x="${cx.toFixed(1)}" y="${H - 18}" text-anchor="middle" font-size="${w.stressed ? 13 : 11}" font-weight="${isN ? 700 : (w.stressed ? 600 : 400)}" fill="${isN ? 'var(--accent)' : (w.stressed ? '#1e2430' : '#6b7280')}">${esc(w.raw)}</text>`;
    if (isA && !isN) labels += `<text x="${cx.toFixed(1)}" y="${top + 2}" text-anchor="middle" font-size="11" fill="var(--accent)">ˈ</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="cursor:pointer"><line x1="0" y1="${mid.toFixed(1)}" x2="${W}" y2="${mid.toFixed(1)}" stroke="#e5e3dc" stroke-dasharray="4 4"/>
    <text x="${W - 6}" y="${(mid - 4).toFixed(1)}" text-anchor="end" font-size="10" fill="#9ca3af">speaker's average pitch</text>${paths}${labels}
    <text x="${W - 8}" y="${top + 16}" text-anchor="end" font-size="20" fill="var(--accent)">${ph.arrow}</text></svg>`;
}

function renderPhenomena() {
  const counts = {}; for (const p of R.phenomena) counts[p.type] = (counts[p.type] || 0) + 1;
  $('#pcount').textContent = `${R.phenomena.length} features`;
  const f = $('#filters'); f.innerHTML = '';
  const all = document.createElement('button'); all.textContent = 'All'; all.style.setProperty('--c', '#9ca3af'); all.className = activeFilter ? '' : 'on';
  all.onclick = () => { activeFilter = null; renderPhenomena(); }; f.appendChild(all);
  for (const t of Object.keys(TYPES)) {
    if (!counts[t]) continue;
    const b = document.createElement('button'); b.textContent = `${TYPES[t].n} · ${counts[t]}`; b.style.setProperty('--c', TYPES[t].c);
    b.className = activeFilter === t ? 'on' : ''; b.onclick = () => { activeFilter = activeFilter === t ? null : t; renderPhenomena(); }; f.appendChild(b);
  }
  const list = $('#plist'); list.innerHTML = '';
  const order = Object.keys(TYPES);
  const items = R.phenomena.filter(p => !activeFilter || p.type === activeFilter).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.words[0] - b.words[0]);
  for (const p of items) {
    const s = R.words[p.words[0]].start, e = R.words[p.words[p.words.length - 1]].end;
    const d = document.createElement('div'); d.className = 'pitem' + (p.confidence === 'low' ? ' conf-low' : ''); d.style.setProperty('--c', TYPES[p.type].c);
    d.innerHTML = `<div class="h"><b>${esc(p.label)}</b><small>${TYPES[p.type].n} · ${p.confidence} confidence</small></div><div class="ipa"><s>${esc(p.before)}</s> → ${esc(p.after)}</div><p>${esc(p.explanation)}</p>
      ${p.acoustic ? `<div class="ac">🎧 ${esc(p.acoustic)}</div>` : ''}<button class="play">▶ hear it (${s.toFixed(1)}s)</button>`;
    d.querySelector('.play').onclick = () => playSpan(s, e);
    list.appendChild(d);
  }
}

$('#explain').onclick = async () => {
  if (!R) return;
  $('#explain').disabled = true; $('#notes').innerHTML = '<span class="spinner"></span>Thinking…';
  try {
    const j = await explain(R, settings.key);
    $('#notes').innerHTML = md(j.text);
    $('#notes-src').textContent = (j.source === 'claude' ? 'Written by Claude from the analysis above.' : 'Automatic summary.') + (j.error ? ' ' + j.error : '');
  } catch (e) { $('#notes').textContent = 'Error: ' + e.message; }
  $('#explain').disabled = false;
};
function md(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^- /gm, '• '); }

// preload dictionary + warm the model in the background
dictReady = loadDict('./data/cmudict.json');
window.addEventListener('load', () => { getWorker().postMessage({ type: 'load', id: 'warm', model: MODELS[settings.model], device: hasWebGPU ? 'webgpu' : 'wasm', dtype: DTYPE }); });
