/**
 * Audio Processing Utilities
 * Handles resampling and audio level calculation
 */

/**
 * Resample audio from one sample rate to another using linear interpolation
 * Used to convert microphone audio (typically 48kHz) to Deepgram's required 16kHz
 *
 * @param input Float32Array of input samples
 * @param inputRate Input sample rate (e.g., 48000)
 * @param outputRate Output sample rate (e.g., 16000)
 * @returns Float32Array of resampled audio
 */
export function resampleAudio(
  input: Float32Array,
  inputRate: number,
  outputRate: number
): Float32Array {
  // If rates match, no resampling needed
  if (inputRate === outputRate) {
    return input;
  }

  const ratio = inputRate / outputRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    // Calculate corresponding position in input array
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;

    // Linear interpolation between two nearest samples
    if (index + 1 < input.length) {
      output[i] = input[index] * (1 - fraction) + input[index + 1] * fraction;
    } else {
      // Last sample - no interpolation needed
      output[i] = input[index];
    }
  }

  return output;
}

/**
 * Calculate Root Mean Square (RMS) audio level
 * Returns a value between 0 and 1 representing audio amplitude
 * Used for visualizations and voice activity detection
 *
 * @param samples Float32Array of audio samples
 * @returns RMS level between 0 and 1
 */
export function calculateRMS(samples: Float32Array): number {
  if (samples.length === 0) return 0;

  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }

  const rms = Math.sqrt(sum / samples.length);

  // Clamp to [0, 1] range
  return Math.min(1, Math.max(0, rms));
}

/**
 * Calculate smoothed audio level with exponential moving average
 * Provides smoother visualization by averaging with previous value
 *
 * @param currentLevel Current RMS level
 * @param previousLevel Previous smoothed level
 * @param smoothingFactor Smoothing factor (0-1), higher = smoother
 * @returns Smoothed audio level
 */
export function smoothAudioLevel(
  currentLevel: number,
  previousLevel: number,
  smoothingFactor: number = 0.3
): number {
  return previousLevel * smoothingFactor + currentLevel * (1 - smoothingFactor);
}

/**
 * Detect if audio contains speech based on RMS threshold
 * Simple voice activity detection
 *
 * @param rmsLevel Current RMS audio level
 * @param threshold Threshold value (default: 0.02)
 * @returns True if speech is detected
 */
export function detectSpeech(rmsLevel: number, threshold: number = 0.02): boolean {
  return rmsLevel > threshold;
}
