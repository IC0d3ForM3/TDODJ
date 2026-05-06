const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function writeWavMono16(filePath, samples, sampleRate = SAMPLE_RATE) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i += 1) {
    const v = clamp(samples[i], -1, 1);
    buffer.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

function envelope(t, attack, decay, sustain, release, total) {
  if (t < 0) return 0;
  if (t < attack) return t / attack;
  const dStart = attack;
  const dEnd = attack + decay;
  if (t < dEnd) {
    const k = (t - dStart) / Math.max(0.0001, decay);
    return 1 + (sustain - 1) * k;
  }
  const rStart = Math.max(dEnd, total - release);
  if (t < rStart) return sustain;
  if (t < total) {
    const k = (t - rStart) / Math.max(0.0001, release);
    return sustain * (1 - k);
  }
  return 0;
}

function generateBurning(durationSec = 2.8, seedOffset = 0) {
  const n = Math.floor(durationSec * SAMPLE_RATE);
  const out = new Float32Array(n);
  let rng = 1234567 + seedOffset;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return rng / 4294967296;
  };

  let low = 0;
  let high = 0;
  const popCount = 11 + Math.floor(rand() * 7);
  const pops = [];
  for (let i = 0; i < popCount; i += 1) {
    const intensityRoll = rand();
    const ampBase = intensityRoll < 0.45
      ? 0.25 + rand() * 0.2   // softer pops
      : intensityRoll < 0.85
        ? 0.42 + rand() * 0.28 // medium pops
        : 0.72 + rand() * 0.32; // loud pops
    pops.push({
      t: 0.12 + rand() * Math.max(0.2, durationSec - 0.24),
      amp: ampBase,
      freq: 650 + rand() * 1700,
      len: 0.018 + rand() * 0.04,
    });
  }

  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const white = rand() * 2 - 1;
    low += 0.01 * (white - low);
    high = white - low;

    const crackleGate = Math.pow(rand(), 16) > 0.92 ? 1 : 0;
    const crackle = crackleGate * high * 0.7;
    const bed = low * 0.5 + high * 0.2;

    const lfo = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.35 * t);
    let popLayer = 0;
    for (const pop of pops) {
      const dt = t - pop.t;
      if (dt >= 0 && dt <= pop.len) {
        const k = dt / pop.len;
        const env = Math.exp(-7 * k) * (1 - k);
        popLayer += Math.sin(2 * Math.PI * pop.freq * dt) * pop.amp * env;
      }
    }

    out[i] = (bed * 0.52 + crackle * 0.66 + popLayer * 0.62) * lfo;
  }

  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.03, 0.2, 0.95, 0.2, durationSec);
    out[i] = clamp(out[i] * env * 0.7, -1, 1);
  }

  return out;
}

function generateShock(durationSec = 1.2) {
  const n = Math.floor(durationSec * SAMPLE_RATE);
  const out = new Float32Array(n);

  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.002, 0.08, 0.35, 0.18, durationSec);
    const f = 1300 - 650 * (t / durationSec);
    const tone = Math.sin(2 * Math.PI * f * t);
    const buzz = Math.sin(2 * Math.PI * (f * 0.5) * t) * Math.sin(2 * Math.PI * 45 * t);
    const hiss = (Math.random() * 2 - 1) * 0.16;
    out[i] = (tone * 0.75 + buzz * 0.45 + hiss) * env;
  }

  return out;
}

function generateLightning(durationSec = 1.9) {
  const n = Math.floor(durationSec * SAMPLE_RATE);
  const out = new Float32Array(n);

  let rumble = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;

    const crack1 = envelope(t, 0.0005, 0.03, 0.0, 0.038, 0.13);
    const crack2 = envelope(t - 0.16, 0.00035, 0.038, 0.0, 0.045, 0.16);
    const crackNoise = (Math.random() * 2 - 1);
    const harshLayer = Math.sign(crackNoise) * Math.pow(Math.abs(crackNoise), 0.45);
    const strike = crackNoise * crack1 * 0.9 + harshLayer * crack2 * 1.35;

    const thunderEnv = envelope(t - 0.12, 0.06, 0.36, 0.5, 0.72, durationSec - 0.12);
    const lowNoise = (Math.random() * 2 - 1);
    rumble += 0.004 * (lowNoise - rumble);
    const thunder = (rumble * 0.85 + Math.sin(2 * Math.PI * 45 * t) * 0.15) * thunderEnv;

    out[i] = clamp(strike * 1.05 + thunder * 0.84, -1, 1);
  }

  return out;
}

function generateGlowingMagic(durationSec = 2.4) {
  const n = Math.floor(durationSec * SAMPLE_RATE);
  const out = new Float32Array(n);

  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.08, 0.45, 0.6, 0.5, durationSec);

    const shimmerA = Math.sin(2 * Math.PI * (420 + 18 * Math.sin(2 * Math.PI * 0.7 * t)) * t);
    const shimmerB = Math.sin(2 * Math.PI * (630 + 25 * Math.sin(2 * Math.PI * 0.9 * t + 0.6)) * t);
    const lowBed = Math.sin(2 * Math.PI * 170 * t) * 0.35;
    const sparkle = (Math.random() * 2 - 1) * 0.08 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 5.5 * t));

    out[i] = (shimmerA * 0.45 + shimmerB * 0.35 + lowBed * 0.2 + sparkle) * env;
  }

  return out;
}

function main() {
  const soundsDir = path.resolve(__dirname, '..', 'public', 'sounds');
  if (!fs.existsSync(soundsDir)) {
    fs.mkdirSync(soundsDir, { recursive: true });
  }

  const files = [
    { name: 'sfx-burning-crackle-01.wav', data: generateBurning(2.8, 1) },
    { name: 'sfx-burning-crackle-02.wav', data: generateBurning(3.1, 77) },
    { name: 'sfx-shocking-zap-01.wav', data: generateShock(1.2) },
    { name: 'sfx-lightning-strike-01.wav', data: generateLightning(1.9) },
    { name: 'sfx-glowing-magic-default-01.wav', data: generateGlowingMagic(2.4) },
  ];

  for (const file of files) {
    const fullPath = path.join(soundsDir, file.name);
    writeWavMono16(fullPath, file.data);
    console.log(`Generated ${fullPath}`);
  }
}

main();
