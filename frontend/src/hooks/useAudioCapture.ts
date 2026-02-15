/**
 * Audio Capture Hook
 * Captures microphone audio, resamples to 16kHz, and streams to WebSocket
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { AUDIO_RATES } from '../types/audio.types';
import { resampleAudio, calculateRMS, smoothAudioLevel } from '../utils/audioProcessor';
import { float32ToInt16 } from '../utils/pcmConverter';

interface UseAudioCaptureOptions {
  onAudioData?: (audioData: Int16Array) => void;
  onError?: (error: string) => void;
}

interface UseAudioCaptureReturn {
  isCapturing: boolean;
  audioLevel: number;
  startCapture: () => Promise<void>;
  stopCapture: () => void;
  error: string | null;
}

/**
 * Hook for capturing microphone audio and streaming to backend
 *
 * Features:
 * - Captures audio from microphone
 * - Resamples to 16kHz (Deepgram requirement)
 * - Converts to Int16 PCM format
 * - Calculates audio level for visualizations
 * - Handles Firefox sample rate compatibility
 *
 * @param options Configuration options
 * @returns Audio capture controls and state
 */
export function useAudioCapture(options: UseAudioCaptureOptions = {}): UseAudioCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const smoothedLevelRef = useRef(0);
  const isCapturingRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    isCapturingRef.current = isCapturing;
  }, [isCapturing]);

  /**
   * Start capturing audio from microphone
   */
  const startCapture = useCallback(async () => {
    try {
      // Check browser support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const errorMsg = 'Microphone access not supported in this browser';
        setError(errorMsg);
        options.onError?.(errorMsg);
        return;
      }

      // Request microphone access
      console.log('🎤 Requesting microphone access...');

      let stream: MediaStream;
      try {
        // Enhanced echo cancellation constraints
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: { ideal: AUDIO_RATES.STT_SAMPLE_RATE },
            // Standard Web Audio constraints (ideal = try hard but don't fail)
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: true },
            autoGainControl: { ideal: true },
            // Chrome/Edge-specific enhancements (ignored by Firefox)
            googEchoCancellation: { ideal: true },
            googAutoGainControl: { ideal: true },
            googNoiseSuppression: { ideal: true },
            googHighpassFilter: { ideal: true },
            googTypingNoiseDetection: { ideal: true },
          } as MediaTrackConstraints,
        });
      } catch (e) {
        console.warn('⚠️ Failed with enhanced constraints, trying basic audio', e);
        // Fallback to basic audio
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      mediaStreamRef.current = stream;

      // Get the actual sample rate from the audio track
      const audioTrack = stream.getAudioTracks()[0];
      const settings = audioTrack.getSettings();
      const nativeSampleRate = settings.sampleRate || AUDIO_RATES.MIC_SAMPLE_RATE;

      console.log('🎤 Microphone accessed:', {
        nativeSampleRate,
        channelCount: settings.channelCount,
      });

      // Create AudioContext matching native sample rate (Firefox compatibility!)
      audioContextRef.current = new AudioContext({ sampleRate: nativeSampleRate });

      // Create audio source from microphone stream
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);

      // Create ScriptProcessor for raw audio access
      // Buffer size: 2048 samples (balance between latency and processing efficiency)
      processorRef.current = audioContextRef.current.createScriptProcessor(2048, 1, 1);

      processorRef.current.onaudioprocess = (event) => {
        if (!isCapturingRef.current) return;  // Use ref instead of closure

        const inputData = event.inputBuffer.getChannelData(0); // Float32Array

        // Calculate audio level for visualization
        const rms = calculateRMS(inputData);
        const smoothed = smoothAudioLevel(rms, smoothedLevelRef.current);
        smoothedLevelRef.current = smoothed;
        setAudioLevel(smoothed);

        // Resample to 16kHz (Deepgram requirement)
        const resampled = resampleAudio(
          inputData,
          audioContextRef.current!.sampleRate,
          AUDIO_RATES.STT_SAMPLE_RATE
        );

        // Convert Float32 to Int16 PCM
        const pcmData = float32ToInt16(resampled);

        // Send to WebSocket
        options.onAudioData?.(pcmData);
      };

      // Create silent gain node to keep processor active without audio output
      // ScriptProcessor needs to be connected to output to fire onaudioprocess
      silentGainRef.current = audioContextRef.current.createGain();
      silentGainRef.current.gain.value = 0; // Silent - no audio to speakers

      // Connect audio pipeline: microphone → processor → silent gain → destination
      // Processor stays active, but no audio feedback through speakers
      sourceRef.current.connect(processorRef.current);
      processorRef.current.connect(silentGainRef.current);
      silentGainRef.current.connect(audioContextRef.current.destination);

      setIsCapturing(true);
      setError(null);
      console.log('✅ Audio capture started');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to access microphone';
      console.error('❌ Audio capture error:', err);
      setError(errorMsg);
      options.onError?.(errorMsg);
      stopCapture();
    }
  }, [options, isCapturing]);

  /**
   * Stop capturing audio and clean up resources
   */
  const stopCapture = useCallback(() => {
    console.log('🛑 Stopping audio capture...');

    // Disconnect audio nodes
    if (silentGainRef.current) {
      silentGainRef.current.disconnect();
      silentGainRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop media stream tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setIsCapturing(false);
    setAudioLevel(0);
    smoothedLevelRef.current = 0;
    console.log('✅ Audio capture stopped');
  }, []);

  return {
    isCapturing,
    audioLevel,
    startCapture,
    stopCapture,
    error,
  };
}
