// Decode any audio/video file in the browser and resample to mono 16 kHz Float32Array.
export async function decodeTo16k(file) {
  const buf = await file.arrayBuffer();
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  let decoded;
  try { decoded = await ac.decodeAudioData(buf.slice(0)); }
  finally { ac.close(); }
  const sr = 16000;
  const len = Math.ceil(decoded.duration * sr);
  const off = new OfflineAudioContext(1, len, sr);
  const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
  const out = await off.startRendering();
  return { samples: out.getChannelData(0), sampleRate: sr, duration: decoded.duration, playable: decoded };
}

// WAV blob for the <audio> element (so playback works even for video containers)
export function toWavBlob(samples, sr) {
  const n = samples.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}
