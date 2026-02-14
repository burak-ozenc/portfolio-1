/**
 * WebSocket React Hook
 * React-friendly wrapper for WebSocket service with state management
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { websocketService } from '../services/websocket.service';
import type { ClientMessage, ServerMessage } from '../types/websocket.types';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface UseWebSocketOptions {
  url?: string;
  autoConnect?: boolean;
  onMessage?: (message: ServerMessage) => void;
  onBinaryAudio?: (data: ArrayBuffer) => void;
  onError?: (error: string) => void;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  lastMessage: ServerMessage | null;
  sendMessage: (message: ClientMessage) => void;
  sendAudio: (audio: Int16Array) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  error: string | null;
}

/**
 * Get WebSocket URL from environment or auto-detect
 */
function getWebSocketUrl(): string {
  // Try environment variable first
  if (import.meta.env.VITE_WS_URL) {
    console.log('🔌 Using WebSocket URL from environment:', import.meta.env.VITE_WS_URL);
    return import.meta.env.VITE_WS_URL;
  }

  // Auto-detect in production
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/ws`;
  console.log('🔌 Auto-detected WebSocket URL:', url);
  return url;
}

/**
 * Hook for WebSocket connection with React state management
 *
 * Features:
 * - Automatic connection on mount
 * - Reconnection on disconnect
 * - Type-safe message handling
 * - Separate binary audio handling
 * - Connection status tracking
 *
 * @param options Configuration options
 * @returns WebSocket controls and state
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { autoConnect = true, onMessage, onBinaryAudio, onError } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lazy initialization to prevent getWebSocketUrl() from being called on every render
  const wsUrlRef = useRef<string>('');
  if (!wsUrlRef.current) {
    wsUrlRef.current = options.url || getWebSocketUrl();
  }
  const isMountedRef = useRef(true);
  const isConnectingRef = useRef(false);
  const onErrorRef = useRef(onError);
  const onMessageRef = useRef(onMessage);
  const onBinaryAudioRef = useRef(onBinaryAudio);
  const audioChunkCountRef = useRef(0);

  // Keep callback refs up to date
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onBinaryAudioRef.current = onBinaryAudio;
  }, [onBinaryAudio]);

  /**
   * Connect to WebSocket server
   */
  const connect = useCallback(async () => {
    // Prevent multiple simultaneous connection attempts
    if (isConnectingRef.current || websocketService.isConnected()) {
      console.log('🔌 Already connecting or connected, skipping...');
      return;
    }

    try {
      isConnectingRef.current = true;
      setConnectionStatus('connecting');
      setError(null);

      console.log('🔌 Connecting to:', wsUrlRef.current);
      await websocketService.connect(wsUrlRef.current);

      if (isMountedRef.current) {
        setConnectionStatus('connected');
        setIsConnected(true);
        isConnectingRef.current = false;
      }
    } catch (err) {
      isConnectingRef.current = false;
      if (isMountedRef.current) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to connect';
        console.error('❌ Connection failed:', errorMsg);
        setError(errorMsg);
        setConnectionStatus('disconnected');
        setIsConnected(false);
        onErrorRef.current?.(errorMsg);
      }
    }
  }, []); // Empty dependency array - stable function

  /**
   * Disconnect from WebSocket server
   */
  const disconnect = useCallback(() => {
    websocketService.disconnect();
    setConnectionStatus('disconnected');
    setIsConnected(false);
  }, []);

  /**
   * Send a message to the server
   */
  const sendMessage = useCallback((message: ClientMessage) => {
    websocketService.sendMessage(message);
  }, []);

  /**
   * Send audio data to the server
   */
  const sendAudio = useCallback((audio: Int16Array) => {
    audioChunkCountRef.current++;
    if (audioChunkCountRef.current === 1 || audioChunkCountRef.current % 50 === 0) {
      // console.log(`🎤 Sent ${audioChunkCountRef.current} audio chunks (${audio.length} samples each)`);
    }
    websocketService.sendAudioChunk(audio);
  }, []);

  /**
   * Setup WebSocket event listeners
   */
  useEffect(() => {
    // Message handler
    const unsubscribeMessage = websocketService.onMessage((message) => {
      if (!isMountedRef.current) return;

      setLastMessage(message);
      onMessageRef.current?.(message);

      // Clear error on successful pong
      if (message.type === 'pong') {
        setError(null);
      }
    });

    // Binary audio handler
    const unsubscribeBinary = websocketService.onBinaryAudio((data) => {
      if (!isMountedRef.current) return;
      onBinaryAudioRef.current?.(data);
    });

    // Connection status handler
    const unsubscribeConnection = websocketService.onConnectionChange((connected) => {
      if (!isMountedRef.current) return;

      console.log('🔌 Connection status changed:', connected);
      setIsConnected(connected);
      setConnectionStatus(connected ? 'connected' : 'disconnected');
      isConnectingRef.current = false;
    });

    // Error handler
    const unsubscribeError = websocketService.onError((errorMsg) => {
      if (!isMountedRef.current) return;

      setError(errorMsg);
      onErrorRef.current?.(errorMsg);
    });

    // Cleanup subscriptions
    return () => {
      unsubscribeMessage();
      unsubscribeBinary();
      unsubscribeConnection();
      unsubscribeError();
    };
  }, []); // Empty dependencies - use refs for callbacks

  /**
   * Auto-connect on mount
   */
  useEffect(() => {
    console.log('🔌 useWebSocket mount, autoConnect:', autoConnect);

    if (autoConnect && !websocketService.isConnected()) {
      connect();
    }

    return () => {
      console.log('🔌 useWebSocket unmount');
      isMountedRef.current = false;
      // Don't disconnect on unmount - WebSocket should persist
      // Only disconnect when explicitly requested
    };
  }, []); // Only run once on mount

  return {
    isConnected,
    connectionStatus,
    lastMessage,
    sendMessage,
    sendAudio,
    connect,
    disconnect,
    error,
  };
}
