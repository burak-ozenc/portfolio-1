// WebSocket connection
let ws = null;
let audioContext = null;
let mediaStream = null;
let isRecording = false;

// Audio configuration
const SAMPLE_RATE = 16000;

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

    ws.onclose = () => {
        console.log('🔌 Disconnected from server');
        updateStatus('disconnected', 'Disconnected');
        toggleBtn.disabled = true;

        // Try to reconnect after 3 seconds
        setTimeout(() => {
            if (ws.readyState === WebSocket.CLOSED) {
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
            break;

        case 'pong':
            // Keepalive response - connection is alive
            break;

        case 'error':
            showError(data);
            break;

        default:
            console.log('Unknown message type:', type);
    }
}

function handleStatusUpdate(status) {
    console.log('Status:', status);

    switch (status) {
        case 'ready':
            updateStatus('ready', 'Ready - Click to start');
            if (!isConversationActive) {
                toggleBtn.disabled = false;
            }
            break;

        case 'listening':
            updateStatus('listening', 'Listening...');
            break;

        case 'thinking':
            updateStatus('thinking', 'Thinking...');
            break;

        case 'speaking':
            updateStatus('speaking', 'Speaking...');
            break;

        case 'loading_tts':
            updateStatus('thinking', 'Loading voice model...');
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

        // Create audio context for RAW audio processing
        // Note: Browser may use a different sample rate than requested
        audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: SAMPLE_RATE
        });

        console.log('AudioContext created with sample rate:', audioContext.sampleRate);

        // Create media stream source
        const source = audioContext.createMediaStreamSource(mediaStream);

        // Create script processor for raw audio samples
        // Buffer size: 4096 samples = ~256ms at 16kHz
        const processor = audioContext.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (e) => {
            if (!isRecording) return;

            // Get raw PCM samples (Float32Array)
            const inputData = e.inputBuffer.getChannelData(0);

            // Convert Float32 to Int16 PCM
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                const sample = Math.max(-1, Math.min(1, inputData[i]));
                pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            }

            // Send to server
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(pcmData.buffer);
            }
        };

        // Connect nodes: source -> processor -> destination (for monitoring)
        source.connect(processor);
        processor.connect(audioContext.destination);

        isRecording = true;
        isConversationActive = true;

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
    try {
        // Create audio context
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Decode audio buffer (expect 16-bit PCM from server)
        const arrayBuffer = await audioData.arrayBuffer();
        const int16Array = new Int16Array(arrayBuffer);

        // Convert to Float32Array
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }

        // Create audio buffer (assume Pocket TTS sample rate is 24kHz)
        const sampleRate = 24000; // Pocket TTS default
        const audioBuffer = audioContext.createBuffer(1, float32Array.length, sampleRate);
        audioBuffer.getChannelData(0).set(float32Array);

        // Create source and play
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        source.onended = () => {
            audioContext.close();
        };

        source.start(0);

    } catch (error) {
        console.error('Error playing audio:', error);
        showError('Could not play audio response.');
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

// Cleanup on page unload
window.addEventListener('beforeunload', async () => {
    if (isRecording) {
        await endConversation();
    }
    if (ws) {
        ws.close();
    }
});