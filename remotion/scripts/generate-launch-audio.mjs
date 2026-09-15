import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// この動画のためのオリジナル音源。外部楽曲・サンプルを使用しない。
// 48 kHz / stereo / 16 bit PCM。一定seedで何度生成しても同じWAVになる。
const rate = 48000;
const duration = 42;
const samples = rate * duration;
const left = new Float64Array(samples);
const right = new Float64Array(samples);
const beat = 60 / 108;
const tau = Math.PI * 2;
let seed = 42;
function noise() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return (seed / 4294967296) * 2 - 1;
}
function hz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}
function sound(start, seconds, sample, pan = 0) {
  const from = Math.round(start * rate);
  const count = Math.min(Math.ceil(seconds * rate), samples - from);
  const lg = Math.sqrt((1 - pan) / 2);
  const rg = Math.sqrt((1 + pan) / 2);
  for (let i = 0; i < count; i++) {
    const value = sample(i / rate, i / count);
    if (from + i >= 0) {
      left[from + i] += value * lg;
      right[from + i] += value * rg;
    }
  }
}
function tone(start, midi, length, volume, pan = 0) {
  const freq = hz(midi);
  sound(
    start,
    length,
    (t, p) => {
      const attack = Math.min(1, t / 0.008);
      const envelope = attack * Math.exp((-t * 6) / length) * (1 - p) ** 0.5;
      return (
        volume *
        envelope *
        (Math.sin(tau * freq * t) +
          0.22 * Math.sin(tau * freq * 2 * t) +
          0.055 * Math.sin(tau * freq * 3 * t))
      );
    },
    pan,
  );
}
function pad(start, notes, length, volume) {
  notes.forEach((note, n) => {
    const freq = hz(note);
    sound(
      start,
      length,
      (t, p) => {
        const envelope = Math.min(1, t / 1.3) * Math.min(1, (length - t) / 1.4);
        return (
          volume *
          envelope *
          (0.6 * Math.sin(tau * freq * t) +
            0.25 * Math.sin(tau * freq * 1.0018 * t) +
            0.1 * Math.sin(tau * freq * 0.998 * t)) *
          (0.85 + 0.15 * Math.sin(p * Math.PI))
        );
      },
      (n - 1.5) * 0.32,
    );
  });
}
function click(start, pitch = 1700, volume = 0.055) {
  sound(
    start,
    0.085,
    (t) =>
      (Math.sin(tau * pitch * t) * 0.4 + noise() * 0.6) *
      Math.exp(-t * 90) *
      volume,
  );
}
function sweep(start, length, volume) {
  let low = 0;
  sound(start, length, (t, p) => {
    low += 0.06 * (noise() - low);
    return (
      low * Math.sin(Math.PI * p) ** 2 * volume +
      Math.sin(tau * (180 * t + 900 * t * t)) * 0.009 * Math.sin(Math.PI * p)
    );
  });
}

// 空白の「間」から、段階的にリズムと倍音が増える。
pad(0, [52, 59, 66, 71], 7, 0.017);
tone(0.5, 83, 1.7, 0.023, -0.3);
[3, 4, 5, 6].forEach((at, i) => {
  click(at, 1000 + i * 140, 0.025);
});
sweep(6.3, 0.8, 0.3);

const chords = [
  [52, 59, 66, 71],
  [48, 55, 64, 71],
  [55, 62, 69, 74],
  [50, 57, 64, 69],
];
for (let bar = 0; bar < 14; bar++) {
  const at = 7 + bar * beat * 4;
  if (at >= 38) break;
  const chord = chords[Math.floor(bar / 2) % chords.length];
  pad(at, chord, beat * 4 + 0.6, 0.02);
  for (let step = 0; step < 8; step++) {
    const start = at + (step * beat) / 2;
    if (start >= 38) break;
    const note = chord[[0, 2, 1, 3, 2, 1, 3, 2][step]] + 12;
    tone(start, note, 0.52, 0.039, Math.sin(step * 2.3) * 0.5);
    tone(start + 0.21, note, 0.45, 0.01, -Math.sin(step * 2.3) * 0.6);
    sound(
      start,
      0.055,
      (t) => noise() * Math.exp(-t * 105) * 0.012,
      step % 2 ? -0.4 : 0.4,
    );
    if (step % 2 === 0) {
      tone(start, chord[0] - 12, 0.44, 0.1);
      sound(
        start,
        0.25,
        (t) =>
          Math.sin(tau * (45 * t + 0.7 * (1 - Math.exp(-t * 48)))) *
          Math.exp(-t * 20) *
          0.16,
      );
    }
    if (step === 2 || step === 6)
      sound(start, 0.11, (t) => noise() * Math.exp(-t * 45) * 0.022);
  }
}

// シーンの切り替えと、UIの操作が着地する瞬間。
[9, 11, 14, 18, 21, 25, 29, 34].forEach((at) => {
  sweep(at - 0.17, 0.38, 0.12);
});
[9.72, 14.6, 19.74, 20.02, 20.15, 23, 26.94].forEach((at) => {
  click(at);
});
[29 + 55 / 60, 29 + 99 / 60, 29 + 143 / 60, 29 + 187 / 60].forEach((at, i) => {
  click(at, 1100 + i * 260, 0.046);
  tone(at, 76 + i * 2, 0.18, 0.036, i % 2 ? 0.2 : -0.2);
});
[33 + 1 / 3, 36.1].forEach((at) => {
  tone(at, 76, 0.6, 0.065);
  tone(at + 0.065, 83, 0.8, 0.045);
});

pad(37.5, [52, 59, 66, 71], 4.5, 0.025);
[76, 83, 88].forEach((note, i) => {
  tone(38 + i * 0.08, note, 3.0, 0.05, (i - 1) * 0.3);
});

// クリッピングを避け、最後は映像を保持したまま自然に残響を消す。
let peak = 0;
for (let i = 0; i < samples; i++) {
  const t = i / rate;
  const fade = Math.min(1, t / 0.08) * Math.min(1, (duration - t) / 1.3);
  left[i] = Math.tanh(left[i] * 1.5) * fade;
  right[i] = Math.tanh(right[i] * 1.5) * fade;
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
}
const gain = 0.84 / peak;
const dataSize = samples * 4;
const wav = Buffer.alloc(44 + dataSize);
wav.write("RIFF", 0);
wav.writeUInt32LE(36 + dataSize, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(dataSize, 40);
for (let i = 0; i < samples; i++) {
  wav.writeInt16LE(Math.round(left[i] * gain * 32767), 44 + i * 4);
  wav.writeInt16LE(Math.round(right[i] * gain * 32767), 46 + i * 4);
}
const out = fileURLToPath(
  new URL("../../public/launch/idea-boost-score.wav", import.meta.url),
);
mkdirSync(fileURLToPath(new URL("../../public/launch/", import.meta.url)), {
  recursive: true,
});
writeFileSync(out, wav);
console.log(
  `Original score: ${duration}s, 108 BPM, stereo 48 kHz, peak ${(20 * Math.log10(0.84)).toFixed(2)} dBFS → ${out}`,
);
