// Connected-speech rule engine for General American English. Port of app/rules.py.
import { Pron, VOWELS, lookup, parseArpa } from './phonemes.js';

export const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'some', 'any',
  'to', 'of', 'for', 'from', 'at', 'in', 'on', 'by', 'with', 'as', 'than', 'into', 'onto', 'about', 'up', 'out', 'off',
  'and', 'or', 'but', 'so', 'if', 'that', 'because', 'cuz', 'nor', 'yet', 'while', 'although', 'though',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'ours', 'theirs', 'there',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
  "i'm", "i've", "i'll", "i'd", "you're", "you've", "you'll", "you'd", "he's", "he'll", "he'd",
  "she's", "she'll", "she'd", "it's", "it'll", "it'd", "we're", "we've", "we'll", "we'd",
  "they're", "they've", "they'll", "they'd", "that's", "there's", "here's", "what's", "who's",
  "let's", 'gonna', 'wanna', 'gotta',
]);

const WEAK_FORMS = {
  a: ['AH0', "The article 'a' is almost always the schwa /ə/ — never /eɪ/ unless the speaker is emphasizing it.", 'high'],
  an: ['AH0 N', "'an' is reduced to /ən/ and links straight into the next vowel.", 'high'],
  the: ['DH AH0', "'the' is /ðə/ before a consonant sound.", 'high'],
  to: ['T AH0', "'to' loses its /u/ and becomes /tə/ — one of the most frequent reductions in English.", 'high'],
  of: ['AH0 V', "'of' becomes /əv/ — and before a consonant the /v/ often disappears too (cup ə coffee).", 'high'],
  for: ['F ER0', "'for' becomes /fɚ/ — it sounds almost like 'fer'.", 'high'],
  and: ['AH0 N', "'and' loses its /d/ and its full vowel: /ən/ or just /n/ (rock 'n' roll).", 'high'],
  or: ['ER0', "'or' reduces to /ɚ/ — 'black ər white'.", 'medium'],
  but: ['B AH0 T', "'but' reduces to /bət/.", 'medium'],
  at: ['AH0 T', "'at' reduces to /ət/.", 'high'],
  as: ['AH0 Z', "'as' reduces to /əz/.", 'high'],
  than: ['DH AH0 N', "'than' reduces to /ðən/.", 'high'],
  from: ['F R AH0 M', "'from' reduces to /frəm/.", 'high'],
  can: ['K AH0 N', "Positive 'can' is /kən/ — the vowel is a schwa. (The negative 'can't' keeps its full /æ/. That is how natives hear the difference!)", 'high'],
  could: ['K AH0 D', "'could' reduces to /kəd/.", 'medium'],
  would: ['W AH0 D', "'would' reduces to /wəd/.", 'medium'],
  should: ['SH AH0 D', "'should' reduces to /ʃəd/.", 'medium'],
  will: ['W AH0 L', "'will' reduces to /wəl/ or just /əl/.", 'medium'],
  was: ['W AH0 Z', "'was' reduces to /wəz/.", 'high'],
  were: ['W ER0', "'were' reduces to /wɚ/.", 'high'],
  are: ['ER0', "'are' reduces to /ɚ/ — 'they ər here'.", 'high'],
  am: ['AH0 M', "'am' reduces to /əm/.", 'medium'],
  do: ['D AH0', "Auxiliary 'do' reduces to /də/ ('də you know…').", 'medium'],
  does: ['D AH0 Z', "'does' reduces to /dəz/.", 'medium'],
  have: ['AH0 V', "Auxiliary 'have' after a modal loses its /h/: 'could have' → 'could əv' (coulda).", 'high'],
  has: ['AH0 Z', "Auxiliary 'has' reduces to /əz/ and often loses its /h/.", 'medium'],
  had: ['AH0 D', "Auxiliary 'had' reduces to /əd/.", 'medium'],
  you: ['Y AH0', "Unstressed 'you' becomes /jə/ ('ya').", 'medium'],
  your: ['Y ER0', "'your' reduces to /jɚ/ — the same sound as 'yer'.", 'medium'],
  them: ['AH0 M', "'them' loses its /ð/: /əm/ ('tell 'em').", 'high'],
  him: ['IH0 M', "'him' loses its /h/: /ɪm/ ('tell ɪm').", 'high'],
  his: ['IH0 Z', "Unstressed 'his' loses its /h/: /ɪz/.", 'medium'],
  her: ['ER0', "Unstressed 'her' loses its /h/: /ɚ/.", 'high'],
  he: ['IY0', "Unstressed 'he' loses its /h/ after a consonant: 'did he' → 'dɪdi'.", 'medium'],
  some: ['S AH0 M', "Determiner 'some' reduces to /səm/.", 'medium'],
  there: ['DH ER0', "Existential 'there is / there are' reduces to /ðɚ/.", 'medium'],
  that: ['DH AH0 T', "'that' as a conjunction or relative pronoun (I think that…) reduces to /ðət/. As a pointing word (THAT one) it stays /ðæt/.", 'medium'],
  us: ['AH0 S', "'us' reduces to /əs/.", 'medium'],
  just: ['JH AH0 S T', "'just' often reduces to /dʒəst/ (or even /dʒɪs/ before a consonant).", 'medium'],
  because: ['K AH0 Z', "'because' reduces to /kəz/ ('cuz').", 'medium'],
};

const CONTRACTIONS = [
  [['going', 'to'], 'G AH1 N AH0', 'gonna', "'going to' + verb becomes 'gonna' /ˈɡʌnə/ in almost all spoken English. (Not before a place: 'going to the store' keeps 'to'.)", 'verb_next'],
  [['want', 'to'], 'W AH1 N AH0', 'wanna', "'want to' fuses into 'wanna' /ˈwʌnə/: the /t/s disappear.", 'always'],
  [['got', 'to'], 'G AA1 T AH0', 'gotta', "'got to' fuses into 'gotta' /ˈɡɑɾə/ with a flapped /t/.", 'always'],
  [['have', 'to'], 'HH AE1 F T AH0', 'hafta', "'have to' becomes 'hafta' /ˈhæftə/ — the /v/ devoices to /f/ before /t/.", 'always'],
  [['has', 'to'], 'HH AE1 S T AH0', 'hasta', "'has to' becomes 'hasta' /ˈhæstə/ — the /z/ devoices to /s/.", 'always'],
  [['kind', 'of'], 'K AY1 N D AH0', 'kinda', "'kind of' becomes 'kinda' /ˈkaɪndə/.", 'always'],
  [['sort', 'of'], 'S AO1 R T AH0', 'sorta', "'sort of' becomes 'sorta' /ˈsɔɹɾə/.", 'always'],
  [['out', 'of'], 'AW1 T AH0', 'outta', "'out of' becomes 'outta' /ˈaʊɾə/ with a flapped /t/.", 'always'],
  [['lot', 'of'], 'L AA1 T AH0', 'lotta', "'lot of' becomes 'lotta' /ˈlɑɾə/ with a flapped /t/.", 'always'],
  [['let', 'me'], 'L EH1 M IY0', 'lemme', "'let me' becomes 'lemme' /ˈlɛmi/.", 'always'],
  [['give', 'me'], 'G IH1 M IY0', 'gimme', "'give me' becomes 'gimme' /ˈɡɪmi/.", 'always'],
  [["don't", 'know'], 'D AH0 N OW1', 'dunno', "'don't know' becomes 'dunno' /dəˈnoʊ/.", 'always'],
  [['what', 'do', 'you'], 'W AH1 T AH0 Y AH0', 'whaddaya', "'what do you' fuses into 'whaddaya' /ˈwʌɾəjə/.", 'always'],
  [['what', 'are', 'you'], 'W AH1 T ER0 Y AH0', 'whaddaya', "'what are you' fuses into 'whaddaya' /ˈwʌɾɚjə/.", 'always'],
  [['did', 'you'], 'D IH1 JH AH0', 'didja', "'did you' → 'didja' /ˈdɪdʒə/: /d/ + /j/ merge into /dʒ/.", 'always'],
  [['do', 'you'], 'D AH0 Y AH0', "d'ya", "'do you' reduces to 'd'ya' /dəjə/ or just /dʒə/.", 'always'],
  [['could', 'you'], 'K UH1 JH AH0', 'couldja', "'could you' → /ˈkʊdʒə/: /d/ + /j/ merge into /dʒ/.", 'always'],
  [['would', 'you'], 'W UH1 JH AH0', 'wouldja', "'would you' → /ˈwʊdʒə/: /d/ + /j/ merge into /dʒ/.", 'always'],
  [['should', 'you'], 'SH UH1 JH AH0', 'shouldja', "'should you' → /ˈʃʊdʒə/.", 'always'],
  [["don't", 'you'], 'D OW1 N CH AH0', 'doncha', "'don't you' → 'doncha' /ˈdoʊntʃə/: /t/ + /j/ merge into /tʃ/.", 'always'],
  [["won't", 'you'], 'W OW1 N CH AH0', 'woncha', "'won't you' → /ˈwoʊntʃə/.", 'always'],
  [["can't", 'you'], 'K AE1 N CH AH0', 'cancha', "'can't you' → /ˈkæntʃə/.", 'always'],
  [['got', 'you'], 'G AA1 CH AH0', 'gotcha', "'got you' → 'gotcha' /ˈɡɑtʃə/.", 'always'],
  [['get', 'you'], 'G EH1 CH AH0', 'getcha', "'get you' → 'getcha' /ˈɡɛtʃə/.", 'always'],
  [['meet', 'you'], 'M IY1 CH AH0', 'meetcha', "'meet you' → /ˈmitʃə/.", 'always'],
  [['miss', 'you'], 'M IH1 SH AH0', 'missya', "'miss you' → /ˈmɪʃə/: /s/ + /j/ merge into /ʃ/.", 'always'],
  [['bless', 'you'], 'B L EH1 SH AH0', 'blessya', "'bless you' → /ˈblɛʃə/.", 'always'],
];

const SPELLED = {
  gonna: ['going to', 'G AH1 N AH0'], wanna: ['want to', 'W AH1 N AH0'], gotta: ['got to', 'G AA1 T AH0'],
  kinda: ['kind of', 'K AY1 N D AH0'], sorta: ['sort of', 'S AO1 R T AH0'], outta: ['out of', 'AW1 T AH0'],
  lemme: ['let me', 'L EH1 M IY0'], gimme: ['give me', 'G IH1 M IY0'], dunno: ["don't know", 'D AH0 N OW1'],
  cuz: ['because', 'K AH0 Z'], "'cause": ['because', 'K AH0 Z'], ya: ['you', 'Y AH0'], "'em": ['them', 'AH0 M'],
  hafta: ['have to', 'HH AE1 F T AH0'], gotcha: ['got you', 'G AA1 CH AH0'], whatcha: ['what are you', 'W AH1 CH AH0'],
  "ain't": ["isn't / aren't / haven't", 'EY1 N T'], "y'all": ['you all', 'Y AO1 L'], "c'mon": ['come on', 'K AH0 M AA1 N'],
};

const DETERMINERS = new Set(['the', 'a', 'an', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'this', 'that', 'these', 'those', 'some', 'any', 'every', 'each', 'no']);
const BILABIAL = new Set(['P', 'B', 'M']);
const VELAR = new Set(['K', 'G']);
const STOPS_TD = new Set(['T', 'D']);
const FLAP_BEFORE = new Set([...VOWELS, 'R']);
const FRONT_GLIDE = new Set(['IY', 'EY', 'AY', 'OY']);
const BACK_GLIDE = new Set(['UW', 'OW', 'AW']);
const ARPA_IPA_SIMPLE = { D: 'd', T: 't', S: 's', Z: 'z' };
const UNDO = { JH: 'D', CH: 'T', SH: 'S', ZH: 'Z' };

const ms = w => Math.round((w.end - w.start) * 1000);
const median = a => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

function spanIpa(words, idxs, which) {
  return idxs.map(i => words[i][which].render()).filter(Boolean).join(' ');
}

export class Engine {
  constructor(tw) {
    this.words = tw.map(w => {
      const cit = lookup(w.text);
      const isFn = FUNCTION_WORDS.has(w.text);
      return { w, citation: cit, connected: cit.copy(), is_function: isFn, stressed: !isFn, absorbed: false, phenomena: [], link_next: '' };
    });
    this.phen = [];
  }
  joined(i) {
    if (i + 1 >= this.words.length) return false;
    const a = this.words[i].w, b = this.words[i + 1].w;
    if (a.ends_phrase) return false;
    return (b.start - a.end) < 0.18;
  }
  phraseFinal(i) { return i + 1 >= this.words.length || this.words[i].w.ends_phrase || !this.joined(i); }
  nextStartsWithVowel(i) {
    if (!this.joined(i)) return null;
    const nxt = this.words[i + 1].connected.first();
    return !!(nxt && nxt.isVowel);
  }
  add(type, label, idxs, before, after, explanation, confidence = 'high', acoustic = '') {
    const p = { id: this.phen.length, type, label, words: idxs, before, after, explanation, confidence, acoustic };
    this.phen.push(p);
    for (const i of idxs) this.words[i].phenomena.push(p.id);
    return p;
  }
  syllableRate() {
    if (this._syl !== undefined) return this._syl;
    const durs = [];
    for (const aw of this.words) {
      const n = aw.citation.phones.filter(p => p.isVowel).length;
      if (n && !aw.is_function && aw.citation.found) durs.push((aw.w.end - aw.w.start) / n);
    }
    this._syl = durs.length ? median(durs) : 0.2;
    return this._syl;
  }
  durationNote(idxs) {
    const total = idxs.reduce((s, i) => s + ms(this.words[i].w), 0);
    const syls = idxs.reduce((s, i) => s + Math.max(1, this.words[i].citation.phones.filter(p => p.isVowel).length), 0);
    const expected = this.syllableRate() * syls * 1000;
    const ratio = expected ? total / expected : 1;
    if (ratio <= 0.75) return [`~${total} ms — quicker than this speaker's usual syllable, consistent with the reduced form.`, 'same'];
    if (ratio >= 1.7) return [`~${total} ms — slower than this speaker's usual syllable; they may have used the full form here.`, 'lower'];
    return [`~${total} ms.`, 'same'];
  }
  run() {
    this.passContractions(); this.passWeakForms(); this.passYod(); this.passElision(); this.passPlace();
    this.passFlapping(); this.passGlottal(); this.passLinking(); this.passStress();
  }

  passContractions() {
    const n = this.words.length;
    this.words.forEach((aw, i) => {
      const t = aw.w.text;
      if (SPELLED[t]) {
        const [full, arpa] = SPELLED[t];
        aw.connected = parseArpa(arpa); aw.citation = parseArpa(arpa);
        this.add('contraction', `'${t}' = '${full}'`, [i], full, aw.connected.render(),
          `The speaker said '${t}' — the everyday spoken form of '${full}'. This is normal in conversation; the full form would sound formal or emphatic.`, 'high');
      }
    });
    let i = 0;
    while (i < n) {
      let matched = false;
      for (const [seq, arpa, display, expl, cond] of CONTRACTIONS) {
        const k = seq.length;
        if (i + k > n) continue;
        let ok = true;
        for (let j = 0; j < k; j++) if (this.words[i + j].w.text !== seq[j]) { ok = false; break; }
        if (!ok) continue;
        if (seq.some((_, j) => this.words[i + j].phenomena.length)) continue;
        let joinedAll = true;
        for (let j = 0; j < k - 1; j++) if (!this.joined(i + j)) { joinedAll = false; break; }
        if (!joinedAll) continue;
        if (cond === 'verb_next') {
          if (i + k >= n || !this.joined(i + k - 1)) continue;
          if (DETERMINERS.has(this.words[i + k].w.text)) continue;
        }
        const idxs = []; for (let j = 0; j < k; j++) idxs.push(i + j);
        const before = spanIpa(this.words, idxs, 'citation');
        const merged = parseArpa(arpa);
        this.words[i].connected = merged;
        for (let j = 1; j < k; j++) { this.words[i + j].connected = new Pron([]); this.words[i + j].absorbed = true; }
        const [note, adj] = this.durationNote(idxs);
        this.add('contraction', `'${seq.join(' ')}' → '${display}'`, idxs, before, merged.render(), expl, adj === 'same' ? 'high' : 'medium', note);
        i += k; matched = true; break;
      }
      if (!matched) i++;
    }
  }

  passWeakForms() {
    const n = this.words.length;
    this.words.forEach((aw, i) => {
      if (aw.absorbed || aw.phenomena.length) return;
      const t = aw.w.text;
      if (!WEAK_FORMS[t]) return;
      if (this.phraseFinal(i) && !['a', 'the', 'an'].includes(t)) return;
      let [arpa, expl, conf] = WEAK_FORMS[t];
      const nv = this.nextStartsWithVowel(i);
      const prev = i > 0 ? this.words[i - 1] : null;
      const prevJoined = i > 0 && this.joined(i - 1);
      const nxtText = (i + 1 < n && this.joined(i)) ? this.words[i + 1].w.text : '';
      if (t === 'the' && nv) { arpa = 'DH IY0'; expl = "Before a vowel sound 'the' is /ði/ (the‿ʲapple), not /ðə/."; }
      else if (t === 'to' && nv) { arpa = 'T AH0'; expl = "'to' is reduced to /tə/ (or a quick /tu/ before a vowel)."; }
      else if (t === 'of' && nv === false) { arpa = 'AH0'; expl = "'of' before a consonant is often just /ə/: 'cup ə coffee', 'one ə them'."; conf = 'medium'; }
      else if (t === 'and' && nv === false && prevJoined) { arpa = 'N'; expl = "'and' between two words is squeezed down to a syllabic /n/: 'rock ’n’ roll', 'bread ’n’ butter'."; conf = 'medium'; }
      else if (['he', 'him', 'his', 'her', 'have', 'has', 'had'].includes(t)) {
        if (!prevJoined) return;
        if (['have', 'has', 'had'].includes(t)) {
          const nxt = i + 1 < n ? this.words[i + 1].w.text : '';
          if (!['could', 'would', 'should', 'might', 'must', 'may', 'i', 'you', 'we', 'they', 'he', 'she', 'it'].includes(prev.w.text)) return;
          if (DETERMINERS.has(nxt) || ['to', 'no'].includes(nxt)) return;
        }
      }
      else if (t === 'that') {
        if (!['i', 'you', 'he', 'she', 'it', 'we', 'they', 'the', 'a', 'an', 'my', 'your', 'there', 'this', 'was', 'is', 'would', 'could'].includes(nxtText)) return;
        conf = 'medium';
      }
      else if (t === 'there') { if (!['is', 'are', 'was', 'were', 'will', 'would', 'has', 'have', 'might', 'may', 'must', 'seems'].includes(nxtText)) return; }
      else if (t === 'some') { if (i + 1 >= n || !this.joined(i) || this.words[i + 1].is_function) return; }
      else if (t === 'do') { if (!['you', 'we', 'they', 'i', 'the', 'these', 'those', 'people'].includes(nxtText)) return; }
      else if (t === 'you' || t === 'your') conf = 'medium';
      const weak = parseArpa(arpa);
      aw.connected = weak;
      const [note, adj] = this.durationNote([i]);
      if (adj === 'lower') conf = conf === 'medium' ? 'low' : 'medium';
      this.add('weak_form', `Weak form of '${t}'`, [i], aw.citation.render(), weak.render(), expl, conf, note);
    });
  }

  passYod() {
    const table = { D: ['JH', 'dʒ'], T: ['CH', 'tʃ'], S: ['SH', 'ʃ'], Z: ['ZH', 'ʒ'] };
    for (let i = 0; i < this.words.length - 1; i++) {
      const a = this.words[i], b = this.words[i + 1];
      if (a.absorbed || b.absorbed || !this.joined(i)) continue;
      const la = a.connected.last(), fb = b.connected.first();
      if (!la || !fb || !table[la.arpa] || fb.arpa !== 'Y') continue;
      if ([...a.phenomena, ...b.phenomena].some(p => this.phen[p].type === 'contraction')) continue;
      const before = `${a.connected.render()} ${b.connected.render()}`;
      const [newArpa, newIpa] = table[la.arpa];
      la.arpa = newArpa; la.ipa = newIpa; la.note = 'coalesced with /j/';
      fb.deleted = true; fb.note = 'merged into previous sound';
      const after = `${a.connected.render()} ${b.connected.render()}`;
      const orig = ARPA_IPA_SIMPLE[UNDO[newArpa]];
      this.add('assimilation', `/${orig}/ + /j/ → /${newIpa}/`, [i, i + 1], before, after,
        `When a word ending in /${orig}/ is followed by 'y-' (you, your, yet…), the two sounds fuse into /${newIpa}/. So '${a.w.text} ${b.w.text}' sounds like one word.`, 'high');
    }
  }

  passElision() {
    this.words.forEach((aw, i) => {
      if (aw.absorbed) return;
      const ph = aw.connected.phones.filter(p => !p.deleted);
      if (ph.length < 2) return;
      const last = ph[ph.length - 1], prev = ph[ph.length - 2];
      const nf = this.joined(i) ? this.words[i + 1].connected.first() : null;
      if (STOPS_TD.has(last.arpa) && !prev.isVowel && !['R', 'L'].includes(prev.arpa) && nf && !nf.isVowel && !last.note) {
        const before = `${aw.connected.render()} ${this.words[i + 1].connected.render()}`;
        if (aw.w.text.endsWith("n't")) {
          last.ipa = 'ʔ'; last.note = 'glottal stop';
          this.add('glottal', `Glottal T in '${aw.w.text}'`, [i], before.split(' ')[0], aw.connected.render(),
            `In '${aw.w.text}' the final /t/ becomes a glottal stop /ʔ/ (a catch in the throat) — it's not fully dropped. The full vowel /æ/ plus that catch is what tells a native it's negative, e.g. 'can't' /kæʔ/ vs positive 'can' /kən/.`, 'high');
          return;
        }
        const lastIpa = last.ipa;
        last.deleted = true; last.note = 'dropped between consonants';
        this.add('elision', `Dropped /${lastIpa}/ in '${aw.w.text}'`, [i, i + 1], before, `${aw.connected.render()} ${this.words[i + 1].connected.render()}`,
          `A /t/ or /d/ squeezed between two other consonants is usually dropped: '${aw.w.text} ${this.words[i + 1].w.text}' → the /${lastIpa}/ disappears. Natives don't 'skip' it on purpose — it's simply too hard to say at speed.`, 'high');
      }
    });
  }

  passPlace() {
    for (let i = 0; i < this.words.length - 1; i++) {
      const a = this.words[i], b = this.words[i + 1];
      if (a.absorbed || b.absorbed || !this.joined(i)) continue;
      const la = a.connected.last(), fb = b.connected.first();
      if (!la || !fb || la.deleted) continue;
      const before = `${a.connected.render()} ${b.connected.render()}`;
      const after = () => `${a.connected.render()} ${b.connected.render()}`;
      if (la.arpa === 'N' && BILABIAL.has(fb.arpa)) {
        la.arpa = 'M'; la.ipa = 'm'; la.note = 'assimilated to next lip sound';
        this.add('assimilation', '/n/ → /m/ before a lip sound', [i, i + 1], before, after(),
          `An /n/ before /p, b, m/ moves to the lips and becomes /m/: '${a.w.text} ${b.w.text}' → '${a.w.text.slice(0, -1)}m ${b.w.text}'. The tongue simply prepares for the next sound early.`, 'medium');
      } else if (la.arpa === 'N' && VELAR.has(fb.arpa)) {
        la.arpa = 'NG'; la.ipa = 'ŋ'; la.note = 'assimilated to next velar sound';
        this.add('assimilation', '/n/ → /ŋ/ before /k, ɡ/', [i, i + 1], before, after(),
          `An /n/ before /k/ or /ɡ/ moves back to /ŋ/: '${a.w.text} ${b.w.text}' sounds like '${a.w.text.slice(0, -1)}ng ${b.w.text}'.`, 'medium');
      } else if (la.arpa === 'D' && BILABIAL.has(fb.arpa)) {
        la.arpa = 'B'; la.ipa = 'b'; la.note = 'assimilated to next lip sound';
        this.add('assimilation', '/d/ → /b/ before a lip sound', [i, i + 1], before, after(),
          "A final /d/ before /p, b, m/ becomes an unreleased /b/ in fast speech: 'good morning' → 'goob morning'. Listen for it; it's subtle.", 'low');
      } else if (la.arpa === 'T' && BILABIAL.has(fb.arpa)) {
        la.arpa = 'P'; la.ipa = 'p'; la.note = 'assimilated to next lip sound';
        this.add('assimilation', '/t/ → /p/ before a lip sound', [i, i + 1], before, after(),
          "A final /t/ before /p, b, m/ becomes an unreleased /p/: 'that person' → 'thap person'.", 'low');
      }
    }
  }

  passFlapping() {
    this.words.forEach((aw, i) => {
      if (aw.absorbed) return;
      const ph = aw.connected.phones.filter(p => !p.deleted);
      for (let k = 1; k < ph.length - 1; k++) {
        const p = ph[k];
        if (!STOPS_TD.has(p.arpa) || p.note) continue;
        const bp = ph[k - 1], ap = ph[k + 1];
        if (FLAP_BEFORE.has(bp.arpa) && ap.isVowel && (ap.stress === 0 || ap.stress === null)) {
          const before = aw.connected.render();
          p.ipa = 'ɾ'; p.note = 'flap';
          this.add('flapping', p.arpa === 'T' ? `Flap T in '${aw.w.text}'` : `Flap D in '${aw.w.text}'`, [i], before, aw.connected.render(),
            `In American English a /t/ (or /d/) between vowels, before an unstressed syllable, becomes a quick flap /ɾ/ — the tongue just taps the ridge behind the teeth. '${aw.w.text}' sounds like it has a soft 'd' in the middle.`, 'high');
        } else if (p.arpa === 'T' && bp.arpa === 'N' && ap.isVowel && (ap.stress === 0 || ap.stress === null)) {
          const before = aw.connected.render();
          p.deleted = true; p.note = 'dropped after n';
          this.add('elision', `Silent T after N in '${aw.w.text}'`, [i], before, aw.connected.render(),
            `After /n/ and before an unstressed vowel, many American speakers drop the /t/ entirely: 'twenty' → 'twenny', 'internet' → 'innernet', '${aw.w.text}' → '${aw.w.text.replace('nt', 'nn')}'.`, 'medium');
        }
      }
      if (this.joined(i) && ph.length) {
        const last = ph[ph.length - 1];
        const nxt = this.words[i + 1];
        const nf = nxt.connected.first();
        if (STOPS_TD.has(last.arpa) && !last.note && ph.length >= 2 && FLAP_BEFORE.has(ph[ph.length - 2].arpa) && nf && nf.isVowel) {
          const before = `${aw.connected.render()} ${nxt.connected.render()}`;
          last.ipa = 'ɾ'; last.note = 'flap';
          this.add('flapping', last.arpa === 'T' ? `Flap T linking '${aw.w.text}' → '${nxt.w.text}'` : `Flap D linking '${aw.w.text}' → '${nxt.w.text}'`,
            [i, i + 1], before, `${aw.connected.render()} ${nxt.connected.render()}`,
            `A final /t/ or /d/ followed by a vowel in the next word becomes a flap /ɾ/ and links the two words: '${aw.w.text} ${nxt.w.text}' is said as one word with a soft 'd' tap in the middle.`, 'high');
        }
      }
    });
  }

  passGlottal() {
    this.words.forEach((aw, i) => {
      if (aw.absorbed) return;
      const ph = aw.connected.phones.filter(p => !p.deleted);
      for (let k = 1; k < ph.length - 2; k++) {
        const p = ph[k];
        if (p.arpa === 'T' && !p.note && ph[k + 1].arpa === 'AH' && ph[k + 1].stress === 0 && ph[k + 2].arpa === 'N' && (k + 3 === ph.length || !ph[k + 3].isVowel)) {
          const before = aw.connected.render();
          p.ipa = 'ʔ'; p.note = 'glottal stop';
          ph[k + 1].deleted = true; ph[k + 1].note = 'syllabic n';
          ph[k + 2].ipa = 'n̩';
          this.add('glottal', `Glottal T in '${aw.w.text}'`, [i], before, aw.connected.render(),
            `Before a syllable '-en/-on/-ain', American /t/ becomes a glottal stop /ʔ/ (a catch in the throat, like the middle of 'uh-oh') and the vowel disappears: '${aw.w.text}' → /${aw.connected.render()}/.`, 'high');
        }
      }
      if (ph.length) {
        const last = ph[ph.length - 1];
        const nf = this.joined(i) ? this.words[i + 1].connected.first() : null;
        if (last.arpa === 'T' && !last.note && ph.length >= 2 && ph[ph.length - 2].isVowel && (nf === null || !nf.isVowel)) {
          const before = aw.connected.render();
          last.ipa = 'ʔ'; last.note = 'unreleased / glottal';
          const ctx = nf ? `before '${this.words[i + 1].w.text}'` : 'at the end of the phrase';
          this.add('glottal', `Unreleased final T in '${aw.w.text}'`, [i], before, aw.connected.render(),
            `A final /t/ ${ctx} is not released: the tongue goes into position but no puff of air comes out, or it becomes a glottal stop /ʔ/. '${aw.w.text}' ends abruptly — that is why 'what', 'that', 'it', 'right' sound so short in native speech.`, 'medium');
        }
      }
    });
  }

  passLinking() {
    for (let i = 0; i < this.words.length - 1; i++) {
      const a = this.words[i];
      if (a.absorbed || !this.joined(i)) continue;
      let j = i + 1;
      while (j < this.words.length && this.words[j].absorbed) j++;
      if (j >= this.words.length) continue;
      const b = this.words[j];
      const la = a.connected.last(), fb = b.connected.first();
      if (!la || !fb) continue;
      const before = `${a.connected.render()} ${b.connected.render()}`;
      if (!la.isVowel && fb.isVowel) {
        a.link_next = '‿';
        if (la.note === 'flap') continue;
        this.add('linking', `Link '${a.w.text}‿${b.w.text}'`, [i, j], before, `${a.connected.render()}‿${b.connected.render()}`,
          `A word ending in a consonant runs straight into a word beginning with a vowel: '${a.w.text} ${b.w.text}' is pronounced as if it were one word, with the /${la.ipa}/ starting the next syllable. Don't put a gap between them.`, 'high');
      } else if (la.isVowel && fb.isVowel) {
        if (FRONT_GLIDE.has(la.arpa)) {
          a.link_next = 'ʲ';
          this.add('linking', `Y-glide '${a.w.text}‿ʲ${b.w.text}'`, [i, j], before, `${a.connected.render()}ʲ${b.connected.render()}`,
            `After /i, eɪ, aɪ, ɔɪ/ a tiny /j/ ('y') sound connects to the next vowel: '${a.w.text} ${b.w.text}' → '${a.w.text}-y-${b.w.text}'.`, 'high');
        } else if (BACK_GLIDE.has(la.arpa)) {
          a.link_next = 'ʷ';
          this.add('linking', `W-glide '${a.w.text}‿ʷ${b.w.text}'`, [i, j], before, `${a.connected.render()}ʷ${b.connected.render()}`,
            `After /u, oʊ, aʊ/ a tiny /w/ sound connects to the next vowel: '${a.w.text} ${b.w.text}' → '${a.w.text}-w-${b.w.text}'.`, 'high');
        }
      } else if (!la.isVowel && !fb.isVowel && la.arpa === fb.arpa && !la.note) {
        a.link_next = '‿';
        this.add('linking', `Double consonant '${a.w.text} ${b.w.text}'`, [i, j], before, `${a.connected.render()}‿${b.connected.render()}`,
          `When the same consonant ends one word and starts the next ('${a.w.text} ${b.w.text}'), natives say it once, slightly longer — not twice.`, 'medium');
      }
    }
  }

  passStress() {
    for (const aw of this.words) {
      if (aw.absorbed) { aw.stressed = false; continue; }
      const t = aw.w.text;
      aw.stressed = !FUNCTION_WORDS.has(t) || t === 'not' || t === 'no';
      if (t.endsWith("n't") || ['what', 'why', 'where', 'when', 'who', 'how', 'this', 'that', 'these', 'those'].includes(t)) {
        aw.stressed = !aw.phenomena.some(p => this.phen[p].type === 'weak_form');
      }
    }
  }
}

export function analyze(words) {
  const e = new Engine(words); e.run();
  return { words: e.words, phenomena: e.phen };
}
