// ARPAbet (CMUdict) -> IPA (General American) with stress marks. Port of app/phonemes.py.

export const ARPA_TO_IPA = {
  AA: 'ɑ', AE: 'æ', AH: 'ʌ', AO: 'ɔ', AW: 'aʊ', AY: 'aɪ', EH: 'ɛ', ER: 'ɝ', EY: 'eɪ', IH: 'ɪ', IY: 'i', OW: 'oʊ',
  OY: 'ɔɪ', UH: 'ʊ', UW: 'u',
  B: 'b', CH: 'tʃ', D: 'd', DH: 'ð', F: 'f', G: 'ɡ', HH: 'h', JH: 'dʒ', K: 'k', L: 'l', M: 'm', N: 'n', NG: 'ŋ', P: 'p',
  R: 'ɹ', S: 's', SH: 'ʃ', T: 't', TH: 'θ', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ',
};
export const VOWELS = new Set(['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW']);

const ONSET2 = new Set();
for (const a of ['p', 'b', 't', 'd', 'k', 'ɡ', 'f', 'θ', 'ʃ']) for (const b of ['ɹ', 'l']) ONSET2.add(a + b);
for (const b of ['p', 't', 'k', 'm', 'n', 'l', 'w', 'f']) ONSET2.add('s' + b);
for (const a of ['p', 'b', 't', 'd', 'k', 'ɡ', 'f', 'v', 'm', 'n', 'h', 'l']) ONSET2.add(a + 'j');
for (const a of ['t', 'd', 'k', 'ɡ', 's', 'θ']) ONSET2.add(a + 'w');
for (const x of ['tl', 'dl', 'θl']) ONSET2.delete(x);

function splitCluster(cons) {
  const n = cons.length;
  for (let k = 0; k < n; k++) {
    const onset = cons.slice(k);
    if (onset.length === 1) return [cons.slice(0, k), onset];
    if (onset.length === 2 && ONSET2.has(onset.join(''))) return [cons.slice(0, k), onset];
    if (onset.length === 3 && onset[0] === 's' && ONSET2.has(onset.slice(1).join('')) && ['p', 't', 'k'].includes(onset[1])) return [cons.slice(0, k), onset];
  }
  return [cons.slice(0, -1), cons.slice(-1)];
}

export class Phone {
  constructor(arpa, stress, ipa, deleted = false, note = '') {
    this.arpa = arpa; this.stress = stress; this.ipa = ipa; this.deleted = deleted; this.note = note;
  }
  get isVowel() { return VOWELS.has(this.arpa); }
  copy() { return new Phone(this.arpa, this.stress, this.ipa, this.deleted, this.note); }
}

export class Pron {
  constructor(phones = [], found = true) { this.phones = phones; this.found = found; }
  render(stressMarks = true) {
    const out = []; let pending = [];
    for (const p of this.phones) {
      if (p.deleted) continue;
      if (p.isVowel) {
        let mark = '';
        if (stressMarks && p.stress === 1) mark = 'ˈ'; else if (stressMarks && p.stress === 2) mark = 'ˌ';
        if (mark && pending.length > 1 && out.length) {
          const [coda, onset] = splitCluster(pending);
          out.push(...coda, mark, ...onset);
        } else {
          if (mark) out.push(mark);
          out.push(...pending);
        }
        pending = [];
        out.push(p.ipa);
      } else pending.push(p.ipa);
    }
    out.push(...pending);
    let s = out.join('');
    const nv = this.phones.filter(p => p.isVowel && !p.deleted).length;
    if (nv <= 1) s = s.replace(/[ˈˌ]/g, '');
    return s;
  }
  first() { return this.phones.find(p => !p.deleted) || null; }
  last() { for (let i = this.phones.length - 1; i >= 0; i--) if (!this.phones[i].deleted) return this.phones[i]; return null; }
  copy() { return new Pron(this.phones.map(p => p.copy()), this.found); }
}

export function arpaToPhone(tok) {
  const m = /^([A-Z]+)(\d)?$/.exec(tok);
  const base = m[1], stress = m[2] !== undefined ? +m[2] : null;
  let ipa = ARPA_TO_IPA[base] ?? base.toLowerCase();
  if (base === 'AH' && stress === 0) ipa = 'ə';
  if (base === 'ER' && stress === 0) ipa = 'ɚ';
  return new Phone(base, stress, ipa);
}

export function parseArpa(seq) {
  const toks = typeof seq === 'string' ? seq.trim().split(/\s+/) : seq;
  return new Pron(toks.map(arpaToPhone));
}

let DICT = null;
export function setDict(d) { DICT = d; }
export async function loadDict(url) {
  const r = await fetch(url); DICT = await r.json(); return DICT;
}

export function lookup(word) {
  const w = word.toLowerCase();
  let e = DICT[w];
  if (!e) for (const alt of [w.replace("'s", ''), w.replace(/'/g, ''), w.replace(/'+$/, '')]) { if (DICT[alt]) { e = DICT[alt]; break; } }
  if (!e) {
    const derived = deriveInflected(w);
    if (derived) return derived;
    return new Pron([], false);
  }
  return parseArpa(e);
}

const SIBILANT = new Set(['S', 'Z', 'SH', 'ZH', 'CH', 'JH']);
const VOICELESS = new Set(['P', 'T', 'K', 'F', 'TH', 'S', 'SH', 'CH', 'HH']);
// plural / 3rd-person -s, -es, possessive 's, and past -ed, built from the dictionary base form
function deriveInflected(w) {
  const tryBase = (base, suffixArpa) => {
    const e = DICT[base]; if (!e) return null;
    const pron = parseArpa(e); const last = pron.last(); if (!last) return null;
    return parseArpa(e + ' ' + suffixArpa(last));
  };
  const sSuffix = last => SIBILANT.has(last.arpa) ? 'IH0 Z' : (VOICELESS.has(last.arpa) ? 'S' : 'Z');
  const dSuffix = last => (last.arpa === 'T' || last.arpa === 'D') ? 'IH0 D' : (VOICELESS.has(last.arpa) ? 'T' : 'D');
  let r = null;
  if (w.endsWith("'s")) r = tryBase(w.slice(0, -2), sSuffix);
  else if (w.endsWith('ies')) r = tryBase(w.slice(0, -3) + 'y', sSuffix);
  else if (w.endsWith('es')) r = tryBase(w.slice(0, -2), sSuffix) || tryBase(w.slice(0, -1), sSuffix);
  else if (w.endsWith('s')) r = tryBase(w.slice(0, -1), sSuffix);
  if (!r && w.endsWith('ied')) r = tryBase(w.slice(0, -3) + 'y', dSuffix);
  if (!r && w.endsWith('ed')) r = tryBase(w.slice(0, -2), dSuffix) || tryBase(w.slice(0, -1), dSuffix);
  return r;
}
