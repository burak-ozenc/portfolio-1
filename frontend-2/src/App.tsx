import { useState, useEffect, useCallback, useRef } from 'react';
import { Character, CharacterState } from './components/Character';
import { StatusText } from './components/StatusText';
import { Tagline } from './components/Tagline';
import { NoiseDetection } from './components/NoiseDetection';
import { useWebSocket } from './hooks/useWebSocket';
import { useAudioCapture } from './hooks/useAudioCapture';
import { useAudioPlayback } from './hooks/useAudioPlayback';
import { useVAD } from './hooks/useVAD';
import type { AppState } from './types/websocket.types';

function App() {
    const [state, setState] = useState<CharacterState>('warming');
    const [audioLevel, setAudioLevel] = useState(0);
    const [transcription, setTranscription] = useState('');
    const [response, setResponse] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isConversationActive, setIsConversationActive] = useState(false);

    // Track if we're currently streaming audio chunks
    const isStreamingRef = useRef(false);

    // Track if we've auto-started conversation (after TTS loads)
    const hasAutoStartedRef = useRef(false);

    // Audio playback (TTS) - initialize first so we can use queueAudio in handleBinaryAudio
    const {
        isPlaying,
        audioLevel: speakerLevel,
        queueAudio,
        stopPlayback,
        clearQueue,
    } = useAudioPlayback({
        onPlaybackEnd: useCallback(() => {
            console.log('🔊 Playback ended');
            // Backend will send status: 'ready' automatically
        }, []),
        onError: useCallback((err: string) => setError(err), []),
    });

    /**
     * Handle binary audio from backend
     */
    const handleBinaryAudio = useCallback((audioData: ArrayBuffer) => {
        if (isStreamingRef.current) {
            queueAudio(audioData);
        }
    }, [queueAudio]);

    // WebSocket connection with message handler
    const {
        isConnected,
        connectionStatus,
        lastMessage,
        sendMessage,
        sendAudio,
    } = useWebSocket({
        onBinaryAudio: handleBinaryAudio,
        onError: useCallback((err: string) => setError(err), []),
    });

    // Audio capture (microphone)
    const {
        isCapturing,
        audioLevel: micLevel,
        startCapture,
        // stopCapture, -- disabled for now
        error: captureError,
    } = useAudioCapture({
        onAudioData: sendAudio,
        onError: useCallback((err: string) => setError(err), []),
    });

    // Voice Activity Detection (VAD) using WASM
    const {
        listening: vadListening,
        loading: vadLoading,
        userSpeaking,
    } = useVAD({
        enabled: isConversationActive,
        onSpeechStart: useCallback(() => {
            console.log('🎙️ VAD: User started speaking');
            // Could trigger UI updates here if needed
        }, []),
        onSpeechEnd: useCallback(() => {
            console.log('🎙️ VAD: User stopped speaking');
            // Could trigger UI updates here if needed
        }, []),
        config: {
            positiveSpeechThreshold: 0.8,
            negativeSpeechThreshold: 0.65,
            redemptionMs: 8, // Allow brief pauses (~267ms)
            preSpeechPadMs: 10, // Capture before speech (~333ms)
            minSpeechMs: 5, // Minimum speech duration (~167ms)
        },
    });

    /**
     * Map backend AppState to Character CharacterState
     */
    const mapBackendStateToCharacterState = useCallback((backendState: AppState): CharacterState => {
        const stateMap: Record<AppState, CharacterState> = {
            warming: 'warming',
            ready: 'ready',
            listening: 'listening',
            thinking: 'ready', // Show neutral face while thinking
            speaking: 'speaking',
            loading_tts: 'warming', // Show warming while loading TTS
        };
        return stateMap[backendState];
    }, []);

    /**
     * Handle WebSocket messages
     */
    useEffect(() => {
        if (!lastMessage) return;

        console.log('📨 Message:', lastMessage);

        switch (lastMessage.type) {
            case 'status': {
                const backendState = lastMessage.data;
                const characterState = mapBackendStateToCharacterState(backendState);
                setState(characterState);
                break;
            }

            case 'transcription': {
                const { full_text, is_final } = lastMessage.data;
                setTranscription(full_text);

                if (is_final) {
                    console.log('📝 Final transcription:', full_text);
                }
                break;
            }

            case 'response': {
                const responseText = lastMessage.data;
                setResponse(responseText);
                console.log('💬 AI Response:', responseText);
                break;
            }

            case 'audio_config': {
                const { stream_status } = lastMessage;

                if (stream_status === 'begin_stream') {
                    console.log('🎬 Audio stream starting');
                    isStreamingRef.current = true;
                    clearQueue(); // Clear any old audio
                } else if (stream_status === 'stop_stream') {
                    console.log('🛑 Audio stream stopped');
                    isStreamingRef.current = false;
                }
                break;
            }

            case 'audio_stopped': {
                console.log('🛑 Audio stopped by backend');
                stopPlayback();
                clearQueue();
                isStreamingRef.current = false;
                break;
            }

            case 'error': {
                console.error('❌ Backend error:', lastMessage.data);
                setError(lastMessage.data);
                break;
            }

            case 'pong': {
                // Keepalive response - no action needed
                break;
            }

            case 'interrupting': {
                console.log('🛑 Backend handling interruption');
                break;
            }
        }
    }, [lastMessage, mapBackendStateToCharacterState, queueAudio, clearQueue, stopPlayback]);

    /**
     * Auto-start conversation when TTS is ready
     */
    useEffect(() => {
        // Auto-start conversation when we receive 'ready' state from backend (TTS loaded)
        // This happens after the backend sends status: 'loading_tts' -> status: 'ready'
        const shouldAutoStart =
            isConnected &&
            !hasAutoStartedRef.current &&
            !isConversationActive &&
            state === 'ready';

        if (shouldAutoStart) {
            console.log('🚀 TTS loaded! Auto-starting conversation...');
            hasAutoStartedRef.current = true;
            startConversation();
        }
    }, [isConnected, state, isConversationActive]);

    /**
     * Start conversation
     */
    const startConversation = useCallback(async () => {
        if (!isConnected) {
            setError('Not connected to server');
            hasAutoStartedRef.current = false; // Allow retry
            return;
        }

        console.log('🎤 Starting conversation');

        // Clear previous state
        setTranscription('');
        setResponse('');
        setError(null);

        try {
            // Start audio capture
            await startCapture();

            // Tell backend to start conversation
            sendMessage({ type: 'start' });
            setIsConversationActive(true);
        } catch (err) {
            console.error('❌ Failed to start conversation:', err);
            hasAutoStartedRef.current = false; // Allow retry
            setError(err instanceof Error ? err.message : 'Failed to start conversation');
        }
    }, [isConnected, startCapture, sendMessage]);

    // /**
    //  * End conversation -- Disabled for now
    //  */
    // const endConversation = useCallback(() => {
    //     console.log('🛑 Ending conversation');
    //
    //     // Stop audio capture
    //     stopCapture();
    //
    //     // Stop audio playback
    //     stopPlayback();
    //     clearQueue();
    //     isStreamingRef.current = false;
    //
    //     // Reset conversation
    //     sendMessage({ type: 'reset' });
    //     setIsConversationActive(false);
    //
    //     // Clear UI
    //     setTranscription('');
    //     setResponse('');
    // }, [stopCapture, stopPlayback, clearQueue, sendMessage]);

    /**
     * Handle interruption (user speaks during AI playback)
     * Uses VAD to detect when user starts speaking during AI response
     */
    const hasInterruptedRef = useRef(false);

    useEffect(() => {
        // Reset interruption flag when not playing
        if (!isPlaying) {
            hasInterruptedRef.current = false;
            return;
        }

        // Check for interruption using VAD (only trigger once per playback session)
        // VAD-based: more accurate than simple audio level threshold
        if (isPlaying && userSpeaking && !hasInterruptedRef.current) {
            console.log('🛑 User interruption detected (VAD)');
            hasInterruptedRef.current = true;
            sendMessage({ type: 'interrupt' });
            stopPlayback();
            clearQueue();
            isStreamingRef.current = false;
        }
    }, [isPlaying, userSpeaking, sendMessage, stopPlayback, clearQueue]);

    /**
     * Update audio level for visualization
     */
    useEffect(() => {
        if (isPlaying) {
            setAudioLevel(speakerLevel);
        } else if (isCapturing) {
            setAudioLevel(micLevel);
        } else {
            setAudioLevel(0);
        }
    }, [isPlaying, isCapturing, speakerLevel, micLevel]);

    /**
     * Override character state to 'speaking' when audio is playing
     * This ensures waveform shows even if backend sends 'ready' too early
     */
    useEffect(() => {
        if (isPlaying) {
            setState('speaking');
        } else if (state === 'speaking' && !isPlaying) {
            // When playback ends, return to ready state
            setState('ready');
        }
    }, [isPlaying, state]);

    return (
        <div className="relative w-screen h-screen bg-black overflow-hidden">
            {/* Main Character */}
            <Character state={state} audioLevel={audioLevel} />

            {/* Status Text */}
            <StatusText state={state} />

            {/* Tagline */}
            <Tagline />

            {/* Noise Detection */}
            <NoiseDetection isActive={state === 'ready' || state === 'listening' || state === 'speaking'} />

            {/* Connection Status */}
            <div className="fixed top-4 right-4 text-xs font-mono">
                <div
                    className={`px-3 py-1 rounded ${
                        connectionStatus === 'connected'
                            ? 'bg-green-500/20 text-green-400'
                            : connectionStatus === 'connecting'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-red-500/20 text-red-400'
                    }`}
                >
                    {connectionStatus}
                </div>
            </div>


            {/* Transcription Display */}
            {transcription && (
                <div className="fixed top-20 left-4 right-4 max-w-2xl mx-auto bg-gray-900/80 backdrop-blur-sm rounded-lg p-4 text-gray-300 text-sm">
                    <div className="text-gray-500 text-xs mb-1">You said:</div>
                    <div>{transcription}</div>
                </div>
            )}

            {/* Response Display */}
            {response && (
                <div className="fixed bottom-32 md:bottom-32 bottom-16 left-4 right-4 max-w-2xl mx-auto bg-gray-900/80 backdrop-blur-sm rounded-lg p-4 text-gray-300 text-sm">
                    <div className="text-gray-500 text-xs mb-1">AI:</div>
                    <div>{response}</div>
                </div>
            )}

            {/* Error Display */}
            {(error || captureError) && (
                <div className="fixed top-4 left-4 max-w-md bg-red-500/20 backdrop-blur-sm border border-red-500 rounded-lg p-4 text-red-400 text-sm">
                    <div className="font-bold mb-1">Error:</div>
                    <div>{error || captureError}</div>
                    <button
                        onClick={() => {
                            setError(null);
                        }}
                        className="mt-2 text-xs underline"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Debug Info */}
            <div className="fixed bottom-4 left-4 text-gray-600 text-xs font-mono">
                <div>State: {state}</div>
                <div>Audio Level: {audioLevel.toFixed(2)}</div>
                <div>Capturing: {isCapturing ? 'Yes' : 'No'}</div>
                <div>Playing: {isPlaying ? 'Yes' : 'No'}</div>
                <div>Streaming: {isStreamingRef.current ? 'Yes' : 'No'}</div>
                <div>VAD: {vadListening ? (userSpeaking ? '🟢 Speaking' : '🔵 Listening') : vadLoading ? '⏳ Loading' : '⚫ Off'}</div>
            </div>
        </div>
    );
}

export default App;
