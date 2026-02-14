/**
 * WebSocket Service
 * Manages WebSocket connection with automatic reconnection and type-safe messaging
 */

import type { ClientMessage, ServerMessage } from '../types/websocket.types';

type MessageCallback = (message: ServerMessage) => void;
type BinaryCallback = (data: ArrayBuffer) => void;
type ConnectionCallback = (connected: boolean) => void;
type ErrorCallback = (error: string) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string = '';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeouts = [1000, 2000, 4000, 8000, 30000]; // Exponential backoff
  private reconnectTimer: number | null = null;
  private pingInterval: number | null = null;
  private isManualClose = false;

  // Event callbacks
  private messageCallbacks: Set<MessageCallback> = new Set();
  private binaryCallbacks: Set<BinaryCallback> = new Set();
  private connectionCallbacks: Set<ConnectionCallback> = new Set();
  private errorCallbacks: Set<ErrorCallback> = new Set();

  /**
   * Connect to WebSocket server
   * @param url WebSocket URL (ws:// or wss://)
   */
  connect(url: string): Promise<void> {
    // If already connected, return immediately
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('🔌 Already connected to WebSocket');
      return Promise.resolve();
    }

    // If connecting, wait for existing connection attempt
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      console.log('🔌 Connection already in progress...');
      return new Promise((resolve, reject) => {
        const checkInterval = window.setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            window.clearInterval(checkInterval);
            resolve();
          } else if (this.ws?.readyState === WebSocket.CLOSED) {
            window.clearInterval(checkInterval);
            reject(new Error('Connection failed'));
          }
        }, 100);
      });
    }

    return new Promise((resolve, reject) => {
      this.url = url;
      this.isManualClose = false;

      console.log('🔌 Creating new WebSocket connection to:', url);

      try {
        this.ws = new WebSocket(url);
        this.ws.binaryType = 'arraybuffer';  // Receive binary data as ArrayBuffer, not Blob

        this.ws.onopen = () => {
          console.log('✅ WebSocket connected');
          this.reconnectAttempts = 0;
          this.notifyConnection(true);
          this.startPingInterval();
          resolve();
        };

        this.ws.onmessage = (event) => {
          if (typeof event.data === 'string') {
            // JSON message
            try {
              const message = JSON.parse(event.data) as ServerMessage;
              this.notifyMessage(message);
            } catch (error) {
              console.error('❌ Failed to parse message:', error);
              this.notifyError('Failed to parse server message');
            }
          } else {
            // Binary audio data
            console.log('📦 Received binary data:', {
              type: Object.prototype.toString.call(event.data),
              isBlob: event.data instanceof Blob,
              isArrayBuffer: event.data instanceof ArrayBuffer,
              size: event.data.byteLength || event.data.size,
            });
            this.notifyBinary(event.data);
          }
        };

        this.ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          this.notifyError('WebSocket connection error');
          reject(new Error('WebSocket connection failed'));
        };

        this.ws.onclose = (event) => {
          console.log('🔌 WebSocket closed:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          });

          this.stopPingInterval();
          this.notifyConnection(false);

          // Auto-reconnect if not manually closed
          if (!this.isManualClose) {
            this.attemptReconnect();
          }
        };
      } catch (error) {
        console.error('❌ Failed to create WebSocket:', error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.isManualClose = true;
    this.stopPingInterval();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    console.log('🔌 WebSocket manually disconnected');
  }

  /**
   * Send a JSON message to the server
   * @param message Typed message object
   */
  sendMessage(message: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ Cannot send message - WebSocket not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      this.notifyError('Failed to send message');
    }
  }

  /**
   * Send binary audio data to the server
   * @param audioData Int16Array PCM audio
   */
  sendAudioChunk(audioData: Int16Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return; // Silently fail for audio chunks (happens frequently)
    }

    try {
      this.ws.send(audioData.buffer);
    } catch (error) {
      console.error('❌ Failed to send audio chunk:', error);
    }
  }

  /**
   * Register callback for JSON messages
   */
  onMessage(callback: MessageCallback): () => void {
    this.messageCallbacks.add(callback);
    // Return unsubscribe function
    return () => this.messageCallbacks.delete(callback);
  }

  /**
   * Register callback for binary audio messages
   */
  onBinaryAudio(callback: BinaryCallback): () => void {
    this.binaryCallbacks.add(callback);
    return () => this.binaryCallbacks.delete(callback);
  }

  /**
   * Register callback for connection status changes
   */
  onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.add(callback);
    return () => this.connectionCallbacks.delete(callback);
  }

  /**
   * Register callback for errors
   */
  onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.add(callback);
    return () => this.errorCallbacks.delete(callback);
  }

  /**
   * Get current connection state
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      this.notifyError('Failed to reconnect after multiple attempts');
      return;
    }

    const timeout = this.reconnectTimeouts[this.reconnectAttempts] || 30000;
    console.log(`🔄 Reconnecting in ${timeout}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectAttempts++;
      this.connect(this.url).catch(() => {
        // Connection failed, will trigger another reconnect attempt
      });
    }, timeout);
  }

  /**
   * Start keepalive ping interval
   */
  private startPingInterval(): void {
    this.stopPingInterval();

    this.pingInterval = window.setInterval(() => {
      if (this.isConnected()) {
        this.sendMessage({ type: 'ping' });
      }
    }, 30000); // 30 seconds
  }

  /**
   * Stop keepalive ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      window.clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Notify all message listeners
   */
  private notifyMessage(message: ServerMessage): void {
    this.messageCallbacks.forEach((callback) => callback(message));
  }

  /**
   * Notify all binary data listeners
   */
  private notifyBinary(data: ArrayBuffer): void {
    this.binaryCallbacks.forEach((callback) => callback(data));
  }

  /**
   * Notify all connection listeners
   */
  private notifyConnection(connected: boolean): void {
    this.connectionCallbacks.forEach((callback) => callback(connected));
  }

  /**
   * Notify all error listeners
   */
  private notifyError(error: string): void {
    this.errorCallbacks.forEach((callback) => callback(error));
  }
}

// Singleton instance
export const websocketService = new WebSocketService();
