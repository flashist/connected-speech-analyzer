// Listening notes: Claude (with the teacher's own key, kept in localStorage) or a template summary.
const MODEL = 'claude-opus-5';
const SYSTEM = `You are an experienced American-English pronunciation teacher. A student is listening to a short
recording of a NATIVE speaker. You are given the transcript, the connected-speech phenomena an analyzer detected
(with citation and connected IPA) and the intonation pattern of each phrase.

Write short 'listening notes' for the student, in warm plain English (B1-B2 level). Goal: help them NOTICE what the
native speaker did and IMITATE it. Do not grade anyone. Structure:
1. One sentence on the overall rhythm/feel of the speaker.
2. 'Listen for these' — 3 to 6 bullets, each naming a phenomenon with the exact words from the recording and how it
   sounds (use the IPA given, and a respelling like 'gonna', 'didja', 'cup ə coffee'). Prioritise the most useful/frequent.
3. 'Intonation' — 1-3 bullets on the melody: where the voice falls/rises and what that signals.
4. One 'try it' practice tip: which phrase to shadow and what to focus on.
Keep it under 220 words. Use the analyzer's findings; if one looks implausible, you may skip it but do not invent new ones.`;

export function template(R) {
  const names = { contraction: 'contractions', weak_form: 'weak forms', flapping: 'flapped T/D', assimilation: 'assimilation', elision: 'dropped sounds', glottal: 'glottal/unreleased T', linking: 'linking' };
  const lines = ['**Listen for these** (automatic summary — add a Claude API key in Settings for teacher-style notes):'];
  for (const t of Object.keys(names)) {
    const items = R.phenomena.filter(p => p.type === t);
    if (!items.length) continue;
    lines.push(`- ${names[t]} ×${items.length}: ${items.slice(0, 4).map(p => `${p.before} → ${p.after}`).join('; ')}`);
  }
  lines.push('', '**Intonation:**');
  for (const p of R.prosody.phrases) lines.push(`- “${p.text}” — ${p.title} ${p.arrow}, main stress on “${p.nucleus_text}”.`);
  return lines.join('\n');
}

function prompt(R) {
  const out = [`Transcript: ${R.transcript}`, '', 'Detected phenomena:'];
  for (const p of R.phenomena) out.push(`- (${p.type}, ${p.confidence}) ${p.label}: /${p.before}/ → /${p.after}/${p.acoustic ? ` [${p.acoustic}]` : ''}`);
  out.push('', 'Phrases and intonation:');
  for (const p of R.prosody.phrases) out.push(`- “${p.text}”: ${p.title} ${p.arrow}; nuclear stress on “${p.nucleus_text}” (${p.nucleus_kind})`);
  return out.join('\n');
}

export async function explain(R, apiKey) {
  if (!apiKey) return { text: template(R), source: 'template' };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, system: SYSTEM, messages: [{ role: 'user', content: prompt(R) }] }),
  });
  if (!r.ok) { const e = await r.text(); return { text: template(R), source: 'template', error: `Claude request failed (${r.status}): ${e.slice(0, 200)}` }; }
  const j = await r.json();
  if (j.stop_reason === 'refusal') return { text: template(R), source: 'template' };
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  return { text: text || template(R), source: text ? 'claude' : 'template' };
}
