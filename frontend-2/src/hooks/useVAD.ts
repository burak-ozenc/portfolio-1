/**
 * Voice Activity Detection Hook
 * Wraps @ricky0123/vad-react for speech detection
 */

import { useCallback, useEffect, useRef } from 'react';
import { useMicVAD } from '@ricky0123/vad-react';

interface UseVADOptions {
  /**
   * Callback when speech starts
   */
  onSpeechStart?: () => void;

  /**
   * Callback when speech ends
   */
  onSpeechEnd?: () => void;

  /**
   * Callback when VAD misfires (false positive)
   */
  onVADMisfire?: () => void;

  /**
   * Whether VAD should be active
   */
  enabled?: boolean;

  /**
   * Custom configuration for VAD
   */
  config?: {
    /**
     * Minimum speech duration (ms) to trigger onSpeechStart
     * Default: 250ms
     */
    positiveSpeechThreshold?: number;

    /**
     * Minimum silence duration (ms) to trigger onSpeechEnd
     * Default: 1000ms
     */
    negativeSpeechThreshold?: number;

    /**
     * Redemption time (ms) - allows brief pauses in speech
     * Default: 5000ms
     */
    redemptionFrames?: number;

    /**
     * Pre-speech padding (ms) - captures audio before speech starts
     * Default: 300ms
     */
    preSpeechPadFrames?: number;

    /**
     * Minimum speech frames before considering it speech
     * Default: 10
     */
    minSpeechFrames?: number;
  };
}

interface UseVADReturn {
  /**
   * Whether VAD is currently listening
   */
  listening: boolean;

  /**
   * Whether VAD is currently loading
   */
  loading: boolean;

  /**
   * Whether user is currently speaking
   */
  userSpeaking: boolean;

  /**
   * Start VAD listening
   */
  start: () => void;

  /**
   * Pause VAD listening
   */
  pause: () => void;

  /**
   * Toggle VAD listening
   */
  toggle: () => void;
}

/**
 * Hook for Voice Activity Detection using WASM VAD
 *
 * Features:
 * - Detects when user starts/stops speaking
 * - Low latency, runs in browser (WASM)
 * - Configurable thresholds and timing
 * - Handles false positives (misfires)
 *
 * @param options Configuration options
 * @returns VAD controls and state
 */
export function useVAD(options: UseVADOptions = {}): UseVADReturn {
  const {
    onSpeechStart,
    onSpeechEnd,
    onVADMisfire,
    enabled = false,
    config = {},
  } = options;

  const userSpeakingRef = useRef(false);

  const vad = useMicVAD({
    startOnLoad: false, // Don't auto-start, we'll control it manually

    // Callbacks
    onSpeechStart: useCallback(() => {
      // console.log('🎙️ VAD: Speech started');
      userSpeakingRef.current = true;
      onSpeechStart?.();
    }, [onSpeechStart]),

    onSpeechEnd: useCallback(() => {
      // console.log('🎙️ VAD: Speech ended');
      userSpeakingRef.current = false;
      onSpeechEnd?.();
    }, [onSpeechEnd]),

    onVADMisfire: useCallback(() => {
      console.log('⚠️ VAD: Misfire (false positive)');
      userSpeakingRef.current = false;
      onVADMisfire?.();
    }, [onVADMisfire]),

    // Configuration
    positiveSpeechThreshold: config.positiveSpeechThreshold ?? 0.8, // More sensitive = lower value
    negativeSpeechThreshold: config.negativeSpeechThreshold ?? 0.8 - 0.15, // Speech ending threshold
    redemptionFrames: config.redemptionFrames ?? 8, // Allow brief pauses (8 frames @ 30fps = ~267ms)
    preSpeechPadFrames: config.preSpeechPadFrames ?? 10, // Capture 10 frames before speech (~333ms)
    minSpeechFrames: config.minSpeechFrames ?? 5, // Minimum speech duration (5 frames @ 30fps = ~167ms)

    // Submission config (we don't use this, but VAD requires it)
    submitUserSpeechOnPause: false, // We handle audio capture separately
  });

  // Auto-start/pause based on enabled prop
  useEffect(() => {
    if (!vad) return;

    if (enabled && !vad.listening) {
      // console.log('🎙️ VAD: Starting...');
      vad.start();
    } else if (!enabled && vad.listening) {
      // console.log('🎙️ VAD: Pausing...');
      vad.pause();
      userSpeakingRef.current = false;
    }
  }, [enabled, vad]);

  return {
    listening: vad?.listening ?? false,
    loading: vad?.loading ?? true,
    userSpeaking: userSpeakingRef.current,
    start: () => vad?.start(),
    pause: () => vad?.pause(),
    toggle: () => vad?.toggle(),
  };
}
