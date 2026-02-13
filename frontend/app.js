// WebSocket connection
let ws = null;
let audioContext = null;
let mediaStream = null;
let isRecording = false;

// Audio configuration
const SAMPLE_RATE = 16000;
let ttsSampleRate = 22050; // Default pyttsx3 sample rate, will be updated from server

// Interruption handling
let currentAudioSource = null;
let currentAudioContext = null;
let isAIPlaying = false;
const INTERRUPTION_ENABLED = true;
const INTERRUPT_VOLUME_THRESHOLD = 0.02;
const INTERRUPT_SUSTAINED_FRAMES = 3;
let interruptVolumeFrames = 0;

// DOM elements
const toggleBtn = document.getElementById('toggleBtn');
const toggleBtnText = document.getElementById('toggleBtnText');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const errorMessage = document.getElementById('errorMessage');
const partialText = document.getElementById('partialText');
const finalText = document.getElementById('finalText');
const responseBox = document.getElementById('responseBox');
const responseContent = document.getElementById('responseContent');

// Conversation state
let isConversationActive = false;
let shouldProcessAudio = false;  // Only process audio when backend is ready to receive

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Page loaded, initializing...');

    // Catch any unhandled errors
    window.addEventListener('error', (event) => {
        console.error('💥 Unhandled error:', event.error);
        showError('JavaScript error: ' + event.error.message);
    });

    initializeWebSocket();

    toggleBtn.addEventListener('click', toggleConversation);
});

function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    updateStatus('connecting', 'Connecting...');

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('✅ Connected to server');
        updateStatus('ready', 'Ready to talk');
        toggleBtn.disabled = false;

        // Send keepalive ping every 30 seconds
        setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
    };

    ws.onmessage = async (event) => {
        if (typeof event.data === 'string') {
            // JSON message
            const message = JSON.parse(event.data);
            handleMessage(message);
        } else {
            // Binary audio data
            await playAudio(event.data);
        }
    };

    ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        showError('Connection error. Please refresh the page.');
    };

    ws.onclose = (event) => {
        console.log('🔌 WebSocket closed');
        console.log('   Code:', event.code);
        console.log('   Reason:', event.reason);
        console.log('   Was clean:', event.wasClean);
        console.log('   isConversationActive:', isConversationActive);
        console.log('   isRecording:', isRecording);

        updateStatus('disconnected', 'Disconnected');
        toggleBtn.disabled = true;

        // Try to reconnect after 3 seconds
        setTimeout(() => {
            if (ws.readyState === WebSocket.CLOSED) {
                console.log('🔄 Attempting to reconnect...');
                initializeWebSocket();
            }
        }, 3000);
    };
}

function handleMessage(message) {
    const { type, data } = message;

    switch (type) {
        case 'status':
            handleStatusUpdate(data);
            break;

        case 'transcription':
            handleTranscription(data);
            break;

        case 'response':
            handleResponse(data);
            break;

        case 'audio_config':
            // Audio configuration received (sample rate)
            console.log('Audio config:', data);
            if (data.sample_rate) {
                ttsSampleRate = data.sample_rate;
                console.log('TTS sample rate updated to:', ttsSampleRate);
            }
            break;

        case 'pong':
            // Keepalive response - connection is alive
            break;

        case 'audio_stopped':
            // Backend confirmed audio stopped
            console.log('🛑 Audio stopped confirmation:', data);
            break;

        case 'interrupting':
            // Backend is handling interruption
            console.log('🛑 Interruption being handled by backend');
            break;

        case 'error':
            showError(data);
            break;

        default:
            console.log('Unknown message type:', type);
    }
}

function handleStatusUpdate(status) {
    console.log('📥 Status update received:', status);
    console.log('   isConversationActive:', isConversationActive);
    console.log('   isRecording:', isRecording);
    console.log('   WebSocket state:', ws.readyState);

    switch (status) {
        case 'ready':
            updateStatus('ready', 'Ready - Click to start');

            // If conversation is active, automatically restart for next input
            if (isConversationActive && isRecording) {
                console.log('🔄 Auto-restarting conversation for next input...');
                // Send start message to begin new turn
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'start' }));
                    console.log('✅ Sent start message');
                } else {
                    console.error('❌ Cannot send start - WebSocket state:', ws.readyState);
                }
            } else {
                console.log('⚠️ Not auto-restarting:');
                console.log('   isConversationActive:', isConversationActive);
                console.log('   isRecording:', isRecording);
                if (!isConversationActive) {
                    toggleBtn.disabled = false;
                }
            }
            break;

        case 'listening':
            updateStatus('listening', 'Listening...');
            shouldProcessAudio = true;  // Start processing audio
            console.log('🎤 Audio processing enabled');
            break;

        case 'thinking':
            updateStatus('thinking', 'Thinking...');
            shouldProcessAudio = false;  // Stop processing audio during LLM
            console.log('🔇 Audio processing paused (thinking)');
            break;

        case 'speaking':
            updateStatus('speaking', 'Speaking...');
            shouldProcessAudio = false;  // Stop processing audio during TTS
            console.log('🔇 Audio processing paused (speaking)');
            break;

        case 'loading_tts':
            updateStatus('thinking', 'Loading voice model...');
            shouldProcessAudio = false;
            break;
    }
}

function handleTranscription(data) {
    const { text, is_final } = data;

    if (is_final) {
        // Add to final text
        if (finalText.textContent) {
            finalText.textContent += ' ' + text;
        } else {
            finalText.textContent = text;
        }
        partialText.textContent = '';
    } else {
        // Show as partial
        partialText.textContent = text;
    }
}

function handleResponse(text) {
    responseContent.textContent = text;
    responseBox.classList.add('visible');
}

async function toggleConversation() {
    if (isConversationActive) {
        await endConversation();
    } else {
        await startConversation();
    }
}

async function startConversation() {
    try {
        // Check if getUserMedia is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showError('Your browser does not support microphone access. Please use Chrome, Firefox, or Edge.');
            return;
        }

        // Clear previous content
        partialText.textContent = '';
        finalText.textContent = '';
        responseBox.classList.remove('visible');

        // Request microphone access with fallback
        try {
            // Try with ideal constraints first
            mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: { ideal: SAMPLE_RATE },
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
        } catch (e) {
            console.warn('Failed with ideal constraints, trying basic:', e);
            // Fallback to basic audio
            mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: true
            });
        }

        // Create audio context matching the MediaStream's native sample rate
        // Firefox requires this - we'll resample to 16kHz later
        const audioTrack = mediaStream.getAudioTracks()[0];
        const settings = audioTrack.getSettings();
        const nativeSampleRate = settings.sampleRate || 48000;

        console.log('Native microphone sample rate:', nativeSampleRate);

        audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: nativeSampleRate  // Match native rate to avoid Firefox error
        });

        console.log('AudioContext created with sample rate:', audioContext.sampleRate);

        // Create media stream source
        const source = audioContext.createMediaStreamSource(mediaStream);

        // Create script processor for raw audio samples
        // Buffer size: 4096 samples
        const processor = audioContext.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (e) => {
            // Get raw PCM samples (Float32Array) at native sample rate
            const inputData = e.inputBuffer.getChannelData(0);

            // ALWAYS calculate RMS volume for interruption detection
            let sumSquares = 0;
            for (let i = 0; i < inputData.length; i++) {
                sumSquares += inputData[i] * inputData[i];
            }
            const rms = Math.sqrt(sumSquares / inputData.length);

            // Check for interruption during AI playback
            if (INTERRUPTION_ENABLED && isAIPlaying && rms > INTERRUPT_VOLUME_THRESHOLD) {
                interruptVolumeFrames++;
                if (interruptVolumeFrames >= INTERRUPT_SUSTAINED_FRAMES) {
                    console.log(`🛑 INTERRUPTION DETECTED (RMS: ${rms.toFixed(4)}, threshold: ${INTERRUPT_VOLUME_THRESHOLD})`);
                    handleInterruption();
                    interruptVolumeFrames = 0;
                }
            } else {
                interruptVolumeFrames = 0;
            }

            // Only send to backend when listening
            if (!isRecording || !shouldProcessAudio) return;

            // Resample to 16kHz if needed
            let resampledData;
            if (audioContext.sampleRate !== SAMPLE_RATE) {
                // Simple downsampling (for 48kHz -> 16kHz, keep every 3rd sample)
                const ratio = audioContext.sampleRate / SAMPLE_RATE;
                const outputLength = Math.floor(inputData.length / ratio);
                resampledData = new Float32Array(outputLength);

                for (let i = 0; i < outputLength; i++) {
                    const srcIndex = Math.floor(i * ratio);
                    resampledData[i] = inputData[srcIndex];
                }
            } else {
                resampledData = inputData;
            }

            // Convert Float32 to Int16 PCM
            const pcmData = new Int16Array(resampledData.length);
            for (let i = 0; i < resampledData.length; i++) {
                const sample = Math.max(-1, Math.min(1, resampledData[i]));
                pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            }

            // Send to server
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(pcmData.buffer);
            } else if (ws && ws.readyState !== WebSocket.OPEN) {
                console.warn('⚠️ Cannot send audio - WebSocket state:', ws.readyState);
            }
        };

        // Connect nodes: source -> processor -> destination (for monitoring)
        source.connect(processor);
        processor.connect(audioContext.destination);

        isRecording = true;
        isConversationActive = true;
        shouldProcessAudio = false;  // Will be enabled when backend sends "listening" status

        // Update UI
        toggleBtnText.textContent = 'End Conversation';
        toggleBtn.classList.add('btn-danger');

        // Send start message
        ws.send(JSON.stringify({ type: 'start' }));

    } catch (error) {
        console.error('Error starting conversation:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);

        let errorMsg = 'Could not access microphone. ';
        if (error.name === 'NotAllowedError') {
            errorMsg += 'Please allow microphone access in your browser.';
        } else if (error.name === 'NotFoundError') {
            errorMsg += 'No microphone found on this device.';
        } else if (error.name === 'NotReadableError') {
            errorMsg += 'Microphone is already in use by another application.';
        } else {
            errorMsg += 'Error: ' + error.message;
        }

        showError(errorMsg);
        isConversationActive = false;
    }
}

async function endConversation() {
    isRecording = false;
    isConversationActive = false;
    shouldProcessAudio = false;

    console.log('🛑 Ending conversation');

    if (audioContext) {
        await audioContext.close();
        audioContext = null;
    }

    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    // Update UI
    toggleBtnText.textContent = 'Start Conversation';
    toggleBtn.classList.remove('btn-danger');

    // Send reset to clear conversation history
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'reset' }));
    }

    // Clear UI
    partialText.textContent = '';
    finalText.textContent = '';
    responseBox.classList.remove('visible');
}

async function playAudio(audioData) {
    console.log('🔊 Playing audio...');
    try {
        // Stop any existing audio first
        stopCurrentAudio();

        // Create audio context
        currentAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('   AudioContext created for playback');

        // Decode audio buffer (expect 16-bit PCM from server)
        const arrayBuffer = await audioData.arrayBuffer();
        console.log('   Audio buffer size:', arrayBuffer.byteLength, 'bytes');

        // if (arrayBuffer.byteLength === 0) {
        //     console.error('❌ Audio buffer is empty!');
        //     return;
        // }

        const int16Array = new Int16Array(arrayBuffer);
        console.log('   Int16 samples:', int16Array.length);

        // // Check amplitude
        // let maxAmplitude = 0;
        // let sumAmplitude = 0;
        // for (let i = 0; i < int16Array.length; i++) {
        //     const absValue = Math.abs(int16Array[i]);
        //     if (absValue > maxAmplitude) maxAmplitude = absValue;
        //     sumAmplitude += absValue;
        // }
        // const meanAmplitude = sumAmplitude / int16Array.length;
        // console.log('   Audio amplitude: max =', maxAmplitude, ', mean =', meanAmplitude.toFixed(1));

        // if (maxAmplitude === 0) {
        //     console.warn('⚠️ Audio is completely silent (all zeros)!');
        // }

        // Convert to Float32Array
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }

        // Create audio buffer using TTS sample rate from server
        console.log('   Creating AudioBuffer with sample rate:', ttsSampleRate, 'Hz');
        const audioBuffer = currentAudioContext.createBuffer(1, float32Array.length, ttsSampleRate);
        audioBuffer.getChannelData(0).set(float32Array);

        const duration = audioBuffer.duration;
        console.log('   Audio duration:', duration.toFixed(2), 'seconds');

        // Create source and play
        currentAudioSource = currentAudioContext.createBufferSource();
        currentAudioSource.buffer = audioBuffer;
        currentAudioSource.connect(currentAudioContext.destination);

        isAIPlaying = true;

        currentAudioSource.onended = () => {
            console.log('✅ Audio playback finished');
            isAIPlaying = false;
            if (currentAudioContext) {
                currentAudioContext.close();
                currentAudioContext = null;
            }
            currentAudioSource = null;
        };

        currentAudioSource.start(0);
        console.log('🎵 Audio playback started');

    } catch (error) {
        console.error('❌ Error playing audio:', error);
        console.error('   Error name:', error.name);
        console.error('   Error message:', error.message);
        showError('Could not play audio response: ' + error.message);
        isAIPlaying = false;
    }
}

function updateStatus(status, text) {
    statusIndicator.className = 'status-indicator ' + status;
    statusText.textContent = text;
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('visible');

    // Hide after 5 seconds
    setTimeout(() => {
        errorMessage.classList.remove('visible');
    }, 5000);
}

function stopCurrentAudio() {
    console.log('🛑 Stopping current audio playback');

    if (currentAudioSource) {
        try {
            currentAudioSource.stop();
        } catch (e) {
            // Already stopped or not started
            console.log('   Note: Audio source already stopped');
        }
        currentAudioSource = null;
    }

    if (currentAudioContext) {
        try {
            currentAudioContext.close();
        } catch (e) {
            console.log('   Note: Audio context already closed');
        }
        currentAudioContext = null;
    }

    isAIPlaying = false;
    interruptVolumeFrames = 0;
}

function handleInterruption() {
    console.log('🛑 HANDLING INTERRUPTION');

    // Stop audio immediately (no round-trip to backend)
    stopCurrentAudio();

    // Notify backend
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'interrupt' }));
        console.log('📤 Sent interrupt message to backend');
    }

    // Update UI
    updateStatus('listening', 'Listening... (interrupted)');
}

// Cleanup on page unload
window.addEventListener('beforeunload', async () => {
    if (isRecording) {
        await endConversation();
    }
    if (ws) {
        ws.close();
    }
});