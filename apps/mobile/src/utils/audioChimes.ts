// Audio Chimes and Base64 WAV Synthesizer for Earbuds Feedback & Background MediaSession Carrier

function createWavHeader(sampleRate: number, numChannels: number, numFrames: number): Uint8Array {
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  // "RIFF" chunk descriptor
  view.setUint8(0, 0x52); // R
  view.setUint8(1, 0x49); // I
  view.setUint8(2, 0x46); // F
  view.setUint8(3, 0x46); // F
  view.setUint32(4, 36 + dataSize, true);
  view.setUint8(8, 0x57); // W
  view.setUint8(9, 0x41); // A
  view.setUint8(10, 0x56); // V
  view.setUint8(11, 0x45); // E

  // "fmt " sub-chunk
  view.setUint8(12, 0x66); // f
  view.setUint8(13, 0x6d); // m
  view.setUint8(14, 0x74); // t
  view.setUint8(15, 0x20); // ' '
  view.setUint32(16, 16, true); // Subchunk1Size for PCM
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // BitsPerSample = 16

  // "data" sub-chunk
  view.setUint8(36, 0x64); // d
  view.setUint8(37, 0x61); // a
  view.setUint8(38, 0x74); // t
  view.setUint8(39, 0x61); // a
  view.setUint32(40, dataSize, true);

  return new Uint8Array(buffer);
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  // Fallback if btoa is not defined
  return Buffer.from(binary, 'binary').toString('base64');
}

/**
 * Generates a clean two-tone synthesized sine WAV chime
 */
export function generateChimeBase64(
  tone1Freq: number,
  tone1DurationMs: number,
  tone2Freq: number,
  tone2DurationMs: number,
  sampleRate = 22050
): string {
  const totalFrames = Math.floor((sampleRate * (tone1DurationMs + tone2DurationMs)) / 1000);
  const pcm16 = new Int16Array(totalFrames);

  const t1Frames = Math.floor((sampleRate * tone1DurationMs) / 1000);
  const t2Frames = totalFrames - t1Frames;

  // Tone 1
  for (let i = 0; i < t1Frames; i++) {
    const t = i / sampleRate;
    const env = Math.sin((Math.PI * i) / t1Frames); // smooth bell envelope
    const sample = Math.sin(2 * Math.PI * tone1Freq * t) * env * 0.45;
    pcm16[i] = Math.floor(sample * 32767);
  }

  // Tone 2
  for (let i = 0; i < t2Frames; i++) {
    const t = i / sampleRate;
    const env = Math.sin((Math.PI * i) / t2Frames);
    const sample = Math.sin(2 * Math.PI * tone2Freq * t) * env * 0.55;
    pcm16[t1Frames + i] = Math.floor(sample * 32767);
  }

  const header = createWavHeader(sampleRate, 1, totalFrames);
  const pcmBytes = new Uint8Array(pcm16.buffer);
  const fullWav = new Uint8Array(header.length + pcmBytes.length);
  fullWav.set(header, 0);
  fullWav.set(pcmBytes, header.length);

  return uint8ToBase64(fullWav);
}

/**
 * Generates an inaudible 1-second silent WAV to anchor background MediaSession
 */
export function generateSilentWavBase64(sampleRate = 8000, durationSec = 1): string {
  const totalFrames = sampleRate * durationSec;
  const pcm16 = new Int16Array(totalFrames); // all zeros
  const header = createWavHeader(sampleRate, 1, totalFrames);
  const pcmBytes = new Uint8Array(pcm16.buffer);
  const fullWav = new Uint8Array(header.length + pcmBytes.length);
  fullWav.set(header, 0);
  fullWav.set(pcmBytes, header.length);

  return uint8ToBase64(fullWav);
}

// Precomputed Chimes
// 1. Wake Chime (Ascending D5 587Hz -> A5 880Hz)
export const WAKE_CHIME_BASE64 = generateChimeBase64(587.33, 140, 880.0, 220);

// 2. Process / Acknowledged Chime (Crisp ping C6 1046Hz -> E6 1318Hz)
export const PROCESS_CHIME_BASE64 = generateChimeBase64(1046.5, 90, 1318.5, 120);

// 3. Error / Interrupted Chime (Descending G4 392Hz -> Eb4 311Hz)
export const ERROR_CHIME_BASE64 = generateChimeBase64(392.0, 150, 311.13, 200);

// 4. Silent Carrier for Background Earbud Standby
export const SILENT_CARRIER_BASE64 = generateSilentWavBase64(8000, 2);
