/**
 * Measuring microphone loudness for the microphone check. Browsers give audio
 * samples as bytes centred on 128 (silence), so loudness is how far they stray
 * from that, as a share of the full range.
 */

/** Root-mean-square loudness of byte time-domain samples, from 0 (silent) to 1 (full scale). */
export function rmsLevel(samples: Uint8Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) {
    const centred = (sample - 128) / 128;
    sum += centred * centred;
  }
  return Math.sqrt(sum / samples.length);
}

/** Louder than room noise, quieter than ordinary speech, so a normal voice clears it easily. */
export const SPEECH_LEVEL = 0.03;

/** How many readings above the speech level count as having heard the participant (readings are 100 ms apart). */
export const READINGS_TO_HEAR = 3;

/** How long to listen before suggesting that something is wrong. */
export const SILENCE_TIMEOUT_MS = 8000;
