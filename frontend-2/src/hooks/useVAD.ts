/**
 * Voice Activity Detection Hook
 * Wraps @ricky0123/vad-react for speech detection
 */

import { useEffect, useState, useRef } from 'react';
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
    redemptionMs?: number;

    /**
     * Pre-speech padding (ms) - captures audio before speech starts
     * Default: 300ms
     */
    preSpeechPadMs?: number;

    /**
     * Minimum speech frames before considering it speech
     * Default: 10
     */
    minSpeechMs?: number;
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

  const [userSpeaking, setUserSpeaking] = useState(false);

  // Store callbacks in refs to keep them stable
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);
  const onVADMisfireRef = useRef(onVADMisfire);

  useEffect(() => {
    onSpeechStartRef.current = onSpeechStart;
    onSpeechEndRef.current = onSpeechEnd;
    onVADMisfireRef.current = onVADMisfire;
  }, [onSpeechStart, onSpeechEnd, onVADMisfire]);

  const vad = useMicVAD({
    startOnLoad: false, // Don't auto-start, we'll control it manually

    // Callbacks - use refs to keep them stable
    onSpeechStart: () => {
      console.log('🎙️ VAD: Speech started - setting userSpeaking=true');
      setUserSpeaking(true);
      onSpeechStartRef.current?.();
    },

    onSpeechEnd: () => {
      console.log('🎙️ VAD: Speech ended - setting userSpeaking=false');
      setUserSpeaking(false);
      onSpeechEndRef.current?.();
    },

    onVADMisfire: () => {
      console.log('⚠️ VAD: Misfire (false positive)');
      setUserSpeaking(false);
      onVADMisfireRef.current?.();
    },

    // Configuration
    positiveSpeechThreshold: config.positiveSpeechThreshold ?? 0.8, // More sensitive = lower value
    negativeSpeechThreshold: config.negativeSpeechThreshold ?? 0.8 - 0.15, // Speech ending threshold
    redemptionMs: config.redemptionMs ?? 8, // Allow brief pauses (8 frames @ 30fps = ~267ms)
    preSpeechPadMs: config.preSpeechPadMs ?? 10, // Capture 10 frames before speech (~333ms)
    minSpeechMs: config.minSpeechMs ?? 5, // Minimum speech duration (5 frames @ 30fps = ~167ms)

    // Submission config (we don't use this, but VAD requires it)
    submitUserSpeechOnPause: false, // We handle audio capture separately
  });

  // Auto-start/pause based on enabled prop
  const isListening = vad?.listening ?? false;

  useEffect(() => {
    if (!vad) return;

    if (enabled && !isListening) {
      vad.start();
    } else if (!enabled && isListening) {
      vad.pause();
      setUserSpeaking(false);
    }
  }, [enabled, isListening, vad]);

  return {
    listening: vad?.listening ?? false,
    loading: vad?.loading ?? true,
    userSpeaking,
    start: () => vad?.start(),
    pause: () => vad?.pause(),
    toggle: () => vad?.toggle(),
  };
}
