/**
 * WebSocket Message Types
 * Matches the backend FastAPI WebSocket API protocol
 */

export type AppState = 'warming' | 'ready' | 'listening' | 'thinking' | 'speaking' | 'loading_tts';

export interface TranscriptionData {
  text: string;
  is_final: boolean;
  full_text: string;
}

export interface AudioConfig {
  sample_rate: number;
}

export type StreamStatus = 'begin_stream' | 'stop_stream';

/**
 * Messages sent from client to server
 */
export type ClientMessage =
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'reset' }
  | { type: 'interrupt' }
  | { type: 'ping' };

/**
 * Messages received from server
 */
export type ServerMessage =
  | { type: 'status'; data: AppState }
  | { type: 'transcription'; data: TranscriptionData }
  | { type: 'response'; data: string }
  | { type: 'audio_config'; data: AudioConfig; stream_status: StreamStatus }
  | { type: 'interrupting' }
  | { type: 'audio_stopped' }
  | { type: 'error'; data: string }
  | { type: 'pong'; data: string };

/**
 * Union type of all WebSocket messages
 */
export type WebSocketMessage = ClientMessage | ServerMessage;
