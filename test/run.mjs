// node web/test/run.mjs — compares the JS rule engine with fixtures dumped from the Python engine.
import { readFileSync } from 'node:fs';
import { setDict } from '../js/phonemes.js';
import { analyze } from '../js/rules.js';
setDict(JSON.parse(readFileSync(new URL('../data/cmudict.json', import.meta.url))));
const fx = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url)));
let fails = 0;
for (const f of fx) {
  const { words, phenomena } = analyze(f.words);
  const got = { connected: words.map(w => w.connected.render()), citation: words.map(w => w.citation.render()), link: words.map(w => w.link_next),
    stressed: words.map(w => w.stressed), absorbed: words.map(w => w.absorbed),
    phenomena: phenomena.map(p => ({ type: p.type, label: p.label, words: p.words, before: p.before, after: p.after, confidence: p.confidence })) };
  for (const k of Object.keys(f.expect)) {
    const a = JSON.stringify(got[k]), b = JSON.stringify(f.expect[k]);
    if (a !== b) { fails++; console.log(`✗ ${f.sentence.slice(0, 40)} :: ${k}\n   got ${a.slice(0, 400)}\n   exp ${b.slice(0, 400)}`); }
  }
}
console.log(fails ? `${fails} mismatches` : `all ${fx.length} fixtures match (${fx.reduce((s, f) => s + f.expect.phenomena.length, 0)} phenomena)`);
process.exit(fails ? 1 : 0);
