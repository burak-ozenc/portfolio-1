/**
 * Audio Playback Hook
 * Handles TTS audio playback from backend with waveform visualization
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { AUDIO_RATES } from '../types/audio.types';
import { arrayBufferToFloat32 } from '../utils/pcmConverter';
import { calculateRMS, smoothAudioLevel } from '../utils/audioProcessor';

interface UseAudioPlaybackOptions {
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onError?: (error: string) => void;
}

interface UseAudioPlaybackReturn {
  isPlaying: boolean;
  audioLevel: number;
  playAudio: (audioData: ArrayBuffer) => void;
  stopPlayback: () => void;
  queueAudio: (audioData: ArrayBuffer) => void;
  clearQueue: () => void;
}

/**
 * Hook for playing back TTS audio from backend
 *
 * Features:
 * - Plays 24kHz Int16 PCM audio from backend
 * - Queues multiple audio chunks for smooth streaming
 * - Calculates audio level for Character waveform visualization
 * - Handles interruption (stop on user speech)
 *
 * @param options Configuration options
 * @returns Audio playback controls and state
 */
export function useAudioPlayback(options: UseAudioPlaybackOptions = {}): UseAudioPlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const smoothedLevelRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const isPlayingRef = useRef(false);
  const optionsRef = useRef(options);

  // Detect Firefox for browser-specific handling
  const isFirefox = /firefox/i.test(navigator.userAgent);

  // Keep options ref up to date
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Keep isPlaying ref in sync
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  /**
   * Initialize audio context if needed
   */
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: AUDIO_RATES.TTS_SAMPLE_RATE });
      console.log('🔊 Audio context created for playback');
    }
  }, []);

  /**
   * Queue audio chunk for playback
   */
  const queueAudio = useCallback((audioData: ArrayBuffer) => {
    audioQueueRef.current.push(audioData);

    // Start playing if not already playing
    if (!isPlayingRef.current) {
      playNextChunk();
    }
  }, []);

  /**
   * Play next audio chunk from queue
   */
  const playNextChunk = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      setIsPlaying(false);
      setAudioLevel(0);
      smoothedLevelRef.current = 0;
      optionsRef.current.onPlaybackEnd?.();
      return;
    }

    const audioData = audioQueueRef.current.shift()!;
    playAudioChunk(audioData);
  }, []);

  /**
   * Play a single audio chunk
   */
  const playAudioChunk = useCallback((audioData: ArrayBuffer) => {
    try {
      initAudioContext();

      if (!audioContextRef.current) {
        throw new Error('Audio context not initialized');
      }

      // console.log('🔊 Received audio chunk:', {
      //   bufferByteLength: audioData.byteLength,
      //   bufferType: Object.prototype.toString.call(audioData),
      // });

      // Convert Int16 PCM to Float32 for Web Audio API
      const float32Data = arrayBufferToFloat32(audioData);

      // console.log('🔊 After conversion:', {
      //   float32Length: float32Data.length,
      //   firstSamples: float32Data.slice(0, 5),
      // });

      // Create audio buffer
      const audioBuffer = audioContextRef.current.createBuffer(
        1, // mono
        float32Data.length,
        AUDIO_RATES.TTS_SAMPLE_RATE
      );

      // Copy data to buffer
      audioBuffer.getChannelData(0).set(float32Data);

      // Create source node
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;

      // Create analyser for waveform visualization
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      // Create gain node for volume control (Firefox needs lower volume)
      const gainNode = audioContextRef.current.createGain();
      gainNodeRef.current = gainNode;

      // Reduce volume on Firefox to minimize echo feedback
      if (isFirefox) {
        gainNode.gain.value = 0.5; // 50% volume on Firefox
        console.log('🔊 Firefox detected: Reducing output volume to 50%');
      } else {
        gainNode.gain.value = 1.0; // 100% volume on Chrome/Edge
      }

      // Connect: source → analyser → gain → destination
      source.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);

      // Handle playback end
      source.onended = () => {
        currentSourceRef.current = null;
        stopVisualization();

        // Play next chunk if available
        if (audioQueueRef.current.length > 0) {
          playNextChunk();
        } else {
          setIsPlaying(false);
          setAudioLevel(0);
          smoothedLevelRef.current = 0;
          optionsRef.current.onPlaybackEnd?.();
        }
      };

      // Start playback
      source.start();
      currentSourceRef.current = source;
      setIsPlaying(true);
      startVisualization();

      if (!isPlayingRef.current) {
        optionsRef.current.onPlaybackStart?.();
      }

      // console.log('🔊 Playing audio chunk:', {
      //   sampleRate: AUDIO_RATES.TTS_SAMPLE_RATE,
      //   samples: float32Data.length,
      //   duration: `${(float32Data.length / AUDIO_RATES.TTS_SAMPLE_RATE).toFixed(2)}s`,
      // });
    } catch (err) {
      console.error('❌ Audio playback error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to play audio';
      optionsRef.current.onError?.(errorMsg);
      setIsPlaying(false);
    }
  }, [initAudioContext, playNextChunk]);

  /**
   * Play audio immediately (single chunk, non-queued)
   */
  const playAudio = useCallback((audioData: ArrayBuffer) => {
    playAudioChunk(audioData);
  }, [playAudioChunk]);

  /**
   * Stop playback and clear queue
   */
  const stopPlayback = useCallback(() => {
    console.log('🛑 Stopping audio playback');

    // Stop current source
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch (e) {
        // Ignore errors if already stopped
      }
      currentSourceRef.current = null;
    }

    // Clear gain node reference
    gainNodeRef.current = null;

    // Clear queue
    audioQueueRef.current = [];

    // Stop visualization
    stopVisualization();

    setIsPlaying(false);
    setAudioLevel(0);
    smoothedLevelRef.current = 0;
  }, []);

  /**
   * Clear audio queue without stopping current playback
   */
  const clearQueue = useCallback(() => {
    audioQueueRef.current = [];
    console.log('🗑️ Audio queue cleared');
  }, []);

  /**
   * Start waveform visualization
   */
  const startVisualization = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Float32Array(analyserRef.current.fftSize);

    const updateLevel = () => {
      if (!analyserRef.current || !isPlaying) return;

      // Get time-domain data for RMS calculation
      analyserRef.current.getFloatTimeDomainData(dataArray);

      // Calculate RMS
      const rms = calculateRMS(dataArray);
      const smoothed = smoothAudioLevel(rms, smoothedLevelRef.current);
      smoothedLevelRef.current = smoothed;
      setAudioLevel(smoothed);

      // Continue animation
      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();
  }, []);

  /**
   * Stop waveform visualization
   */
  const stopVisualization = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      stopPlayback();

      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [stopPlayback]);

  return {
    isPlaying,
    audioLevel,
    playAudio,
    stopPlayback,
    queueAudio,
    clearQueue,
  };
}
