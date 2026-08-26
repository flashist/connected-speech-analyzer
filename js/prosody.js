// Intonation analysis in the browser. Port of app/prosody.py + app/timing.py, with a YIN pitch
// tracker replacing Praat.

export const PATTERNS = {
  falling: ['↘', 'Falling', "The voice drops at the end. This is the default for statements, commands and wh-questions — it signals 'I'm finished / I'm certain'."],
  rising: ['↗', 'Rising', "The voice goes up at the end. Typical for yes/no questions, checking, or 'I'm not finished yet — there's more coming'."],
  'fall-rise': ['↘↗', 'Fall-rise', "Down then up. Natives use this for reservation, contrast or politeness: 'well… yes, BUT…' It leaves something unsaid."],
  'rise-fall': ['↗↘', 'Rise-fall', "Up then sharply down. Adds emphasis, surprise or strong feeling ('That was AMAZING')."],
  level: ['→', 'Level', 'Flat pitch. Usually a list item or an unfinished thought — the speaker is holding the floor.'],
};

// ---------- intensity (dB) every 10 ms ----------
export function intensity(samples, sr, step = 0.01, win = 0.03) {
  const hop = Math.round(sr * step), n = Math.round(sr * win);
  const out = [], ts = [];
  for (let s = 0; s + n <= samples.length; s += hop) {
    let e = 0;
    for (let i = s; i < s + n; i++) e += samples[i] * samples[i];
    out.push(10 * Math.log10(e / n + 1e-10)); ts.push((s + n / 2) / sr);
  }
  return { vals: out, ts };
}

export function silences(samples, sr, minLen = 0.12) {
  const { vals, ts } = intensity(samples, sr);
  if (!vals.length) return [];
  const sorted = [...vals].sort((a, b) => a - b);
  const top = sorted[Math.floor(sorted.length * 0.95)];
  const thr = top - 28;
  const out = [];
  let i = 0;
  while (i < vals.length) {
    if (vals[i] < thr) {
      let j = i; while (j < vals.length && vals[j] < thr) j++;
      const s = ts[i], e = ts[j - 1];
      if (e - s >= minLen) out.push([s, e]);
      i = j;
    } else i++;
  }
  return out;
}

export function refineTimestamps(words, sil) {
  for (const w of words) {
    for (const [s, e] of sil) {
      if (s <= w.start + 0.04 && e >= w.start) { if (e < w.end - 0.06) w.start = e; }
      if (w.start + 0.06 < s && s < w.end && e >= w.end - 0.02) w.end = s;
      else if (w.start + 0.10 < s && e < w.end - 0.06 && (e - s) >= 0.12) w.end = s;
    }
    if (w.end - w.start < 0.05) w.end = w.start + 0.05;
  }
}

// ---------- pitch: YIN, 10 ms hop, returns Hz (0 = unvoiced) ----------
export function pitchTrack(samples, sr, { step = 0.01, fmin = 70, fmax = 450, threshold = 0.15, win = 0.04 } = {}) {
  const hop = Math.round(sr * step), W = Math.round(sr * win);
  const tauMin = Math.floor(sr / fmax), tauMax = Math.ceil(sr / fmin);
  const f0 = [], ts = [];
  const d = new Float32Array(tauMax + 1), cmnd = new Float32Array(tauMax + 1);
  for (let s = 0; s + W + tauMax <= samples.length; s += hop) {
    // energy gate
    let en = 0; for (let i = 0; i < W; i++) en += samples[s + i] * samples[s + i];
    ts.push((s + W / 2) / sr);
    if (en / W < 1e-6) { f0.push(0); continue; }
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let i = 0; i < W; i++) { const diff = samples[s + i] - samples[s + i + tau]; sum += diff * diff; }
      d[tau] = sum;
    }
    cmnd[0] = 1; let run = 0;
    for (let tau = 1; tau <= tauMax; tau++) { run += d[tau]; cmnd[tau] = run ? d[tau] * tau / run : 1; }
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (cmnd[t] < threshold) { while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++; tau = t; break; }
    }
    if (tau < 0) { f0.push(0); continue; }
    // parabolic interpolation
    let best = tau;
    if (tau > 1 && tau < tauMax) {
      const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1];
      const denom = a - 2 * b + c; if (denom) best = tau + (a - c) / (2 * denom);
    }
    f0.push(sr / best);
  }
  return { f0, ts };
}

function medianFilter(x, k = 5) {
  const out = x.slice(), h = k >> 1;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === null) continue;
    const win = [];
    for (let j = Math.max(0, i - h); j <= Math.min(x.length - 1, i + h); j++) if (x[j] !== null) win.push(x[j]);
    win.sort((a, b) => a - b);
    out[i] = win[win.length >> 1];
  }
  return out;
}
// remove octave jumps / isolated blips: a voiced frame that differs from both neighbours by > 6 st is dropped
function despike(st) {
  const out = st.slice();
  for (let i = 1; i < st.length - 1; i++) {
    if (st[i] === null) continue;
    const l = st[i - 1], r = st[i + 1];
    if ((l === null || Math.abs(st[i] - l) > 6) && (r === null || Math.abs(st[i] - r) > 6)) out[i] = null;
  }
  return out;
}

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;

export function analyzeProsody(samples, sr, words) {
  const { f0, ts } = pitchTrack(samples, sr);
  const voiced = f0.filter(v => v > 0);
  const ref = voiced.length >= 5 ? [...voiced].sort((a, b) => a - b)[voiced.length >> 1] : 150;
  let st = f0.map(v => v > 0 ? 12 * Math.log2(v / ref) : null);
  st = medianFilter(despike(st));
  const { vals: inten, ts: its } = intensity(samples, sr);

  const seg = (t0, t1) => { const o = []; for (let i = 0; i < ts.length; i++) if (ts[i] >= t0 && ts[i] <= t1 && st[i] !== null) o.push(st[i]); return o; };
  const intenOf = (t0, t1) => { const o = []; for (let i = 0; i < its.length; i++) if (its[i] >= t0 && its[i] <= t1) o.push(inten[i]); return o.length ? mean(o) : 0; };

  const wordStats = {};
  for (const aw of words) {
    const s = seg(aw.w.start, aw.w.end);
    wordStats[aw.w.idx] = { mean: s.length ? mean(s) : null, max: s.length ? Math.max(...s) : null, min: s.length ? Math.min(...s) : null, intensity: intenOf(aw.w.start, aw.w.end) };
  }

  // phrase grouping
  let groups = [], cur = [];
  words.forEach((aw, i) => {
    cur.push(aw);
    const nxt = words[i + 1];
    if (aw.w.ends_phrase || !nxt || (nxt.w.start - aw.w.end) > 0.3) { groups.push(cur); cur = []; }
  });
  const merged = []; let carry = [];
  for (const g of groups) {
    if (!g.some(a => a.stressed && !a.absorbed) && !g[g.length - 1].w.ends_phrase) { carry.push(...g); continue; }
    merged.push([...carry, ...g]); carry = [];
  }
  if (carry.length) { if (merged.length) merged[merged.length - 1].push(...carry); else merged.push(carry); }
  const splitLong = g => {
    if (g.length < 4 || (g[g.length - 1].w.end - g[0].w.start) <= 3.5) return [g];
    let best = -1, bk = -1;
    for (let k = 1; k < g.length - 2; k++) { const gap = g[k + 1].w.start - g[k].w.end; if (gap > best) { best = gap; bk = k; } }
    if (bk < 0) return [g];
    if (best < 0.08) bk = Math.floor(g.length / 2);
    return [...splitLong(g.slice(0, bk + 1)), ...splitLong(g.slice(bk + 1))];
  };
  groups = merged.flatMap(splitLong);

  const phrases = [];
  for (const g of groups) {
    const idxs = g.map(a => a.w.idx);
    const start = g[0].w.start, end = g[g.length - 1].w.end;
    const punct = g[g.length - 1].w.punct || '';
    const text = g.map(a => a.w.raw).join(' ');
    let cands = g.filter(a => a.stressed && !a.absorbed); if (!cands.length) cands = g.filter(a => !a.absorbed); if (!cands.length) cands = g;
    let nucleus = cands[cands.length - 1], kind = 'final';
    // declination-corrected peaks
    const xs = [], ys = [];
    for (let i = 0; i < ts.length; i++) if (ts[i] >= start && ts[i] <= end && st[i] !== null) { xs.push(ts[i]); ys.push(st[i]); }
    let slope = 0, icpt = 0;
    if (xs.length >= 6) {
      const mx = mean(xs), my = mean(ys); let num = 0, den = 0;
      for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
      slope = den ? num / den : 0; icpt = my - slope * mx;
    }
    const residPeak = a => { const mx = wordStats[a.w.idx].max; if (mx === null) return null; return mx - (slope * (a.w.start + a.w.end) / 2 + icpt); };
    const lastPeak = residPeak(nucleus);
    let best = null;
    for (const a of cands.slice(0, -1)) {
      const rp = residPeak(a);
      if (rp === null || lastPeak === null) continue;
      if (rp > lastPeak + 4 && wordStats[a.w.idx].intensity >= wordStats[nucleus.w.idx].intensity - 1) { if (best === null || rp > residPeak(best)) best = a; }
    }
    if (best) { nucleus = best; kind = 'contrastive'; }
    const phVals = seg(start, end); const phMean = phVals.length ? mean(phVals) : 0;
    const accented = g.filter(a => a.stressed && !a.absorbed && (wordStats[a.w.idx].max ?? -99) > phMean + 1.5).map(a => a.w.idx);

    const tail = seg(nucleus.w.start, end);
    let pattern = 'level';
    if (tail.length >= 4) {
      const q = Math.max(1, tail.length >> 2);
      const a0 = mean(tail.slice(0, q)), b0 = mean(tail.slice(-q));
      const mid = tail.length > 2 * q ? tail.slice(q, -q) : tail;
      const mn = Math.min(...mid), mx = Math.max(...mid), delta = b0 - a0;
      if (mn < Math.min(a0, b0) - 2 && b0 > mn + 2 && delta > -1) pattern = 'fall-rise';
      else if (mx > Math.max(a0, b0) + 2.5 && delta < -2) pattern = 'rise-fall';
      else if (delta <= -1.5) pattern = 'falling';
      else if (delta >= 1.5) pattern = 'rising';
    }
    let [arrow, title, meaning] = PATTERNS[pattern];
    if (punct.startsWith('?')) {
      if (pattern === 'rising') meaning += " Here it's a question, so the rise is expected — a yes/no question.";
      else if (pattern === 'falling') meaning += ' Note: a question with a FALL — that\'s normal for wh-questions (what/where/why) and for questions that are really requests.';
    } else if (pattern === 'rising' && !punct) meaning = "The voice goes up — the speaker is signalling 'not finished yet': this chunk connects to the next one.";

    const contour = [];
    for (let i = 0; i < ts.length; i += 2) if (ts[i] >= start - 0.05 && ts[i] <= end + 0.05) contour.push([+ts[i].toFixed(3), st[i] === null ? null : +st[i].toFixed(2)]);
    phrases.push({ words: idxs, start, end, text, nucleus: nucleus.w.idx, nucleus_kind: kind, nucleus_text: nucleus.w.raw, pattern, arrow, title, meaning, punct, accented, contour });
  }
  const all = st.filter(v => v !== null);
  return { reference_hz: +ref.toFixed(1), range_st: all.length ? [+Math.min(...all).toFixed(1), +Math.max(...all).toFixed(1)] : [-6, 6], words: wordStats, phrases };
}
