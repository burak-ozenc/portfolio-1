/**
 * Audio-related type definitions
 */

export interface AudioConfig {
  sample_rate: number;
}

/**
 * Audio sample rates used in the application
 */
export const AUDIO_RATES = {
  /** Deepgram STT required sample rate */
  STT_SAMPLE_RATE: 16000,
  /** Pocket TTS output sample rate */
  TTS_SAMPLE_RATE: 24000,
  /** Common microphone sample rate (Firefox) */
  MIC_SAMPLE_RATE: 48000,
} as const;

/**
 * Audio processing configuration
 */
export interface AudioProcessingConfig {
  bufferSize: number;
  numberOfChannels: number;
  sampleRate: number;
}

/**
 * Audio level (RMS) value between 0 and 1
 */
export type AudioLevel = number;

/**
 * Audio stream state
 */
export type AudioStreamState = 'idle' | 'streaming' | 'paused' | 'stopped';
