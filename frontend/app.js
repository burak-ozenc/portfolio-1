// WebSocket connection
let ws = null;
let audioContext = null;
let mediaStream = null;
let mediaRecorder = null;
let isRecording = false;
let audioChunksInterval = null;
let pcmConverter = null; // Reusable audio context for conversion

// Audio configuration
const SAMPLE_RATE = 16000;
const CHUNK_INTERVAL = 100; // Send chunks every 100ms

// DOM elements
const talkBtn = document.getElementById('talkBtn');
const resetBtn = document.getElementById('resetBtn');
const talkBtnText = document.getElementById('talkBtnText');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const errorMessage = document.getElementById('errorMessage');
const partialText = document.getElementById('partialText');
const finalText = document.getElementById('finalText');
const responseBox = document.getElementById('responseBox');
const responseContent = document.getElementById('responseContent');

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Page loaded, initializing...');

    // Catch any unhandled errors
    window.addEventListener('error', (event) => {
        console.error('💥 Unhandled error:', event.error);
        showError('JavaScript error: ' + event.error.message);
    });

    initializeWebSocket();

    talkBtn.addEventListener('click', toggleRecording);
    resetBtn.addEventListener('click', resetConversation);
});

function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    updateStatus('connecting', 'Connecting...');

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('✅ Connected to server');
        updateStatus('ready', 'Ready to talk');
        talkBtn.disabled = false;

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
        talkBtn.disabled = true;

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
            updateStatus('ready', 'Ready to talk');
            talkBtn.disabled = false;
            talkBtnText.textContent = 'Start Talking';
            isRecording = false;
            break;

        case 'listening':
            updateStatus('listening', 'Listening...');
            talkBtnText.textContent = 'Stop';
            break;

        case 'thinking':
            updateStatus('thinking', 'Thinking...');
            talkBtn.disabled = true;
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
    const { text, is_final, full_text } = data;

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

async function toggleRecording() {
    if (isRecording) {
        await stopRecording();
    } else {
        await startRecording();
    }
}

async function startRecording() {
    try {
        // Clear previous transcription
        partialText.textContent = '';
        finalText.textContent = '';
        responseBox.classList.remove('visible');

        // Request microphone access
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                sampleRate: SAMPLE_RATE,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        // Create audio context for processing
        audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: SAMPLE_RATE
        });

        // Create MediaRecorder
        const options = {
            mimeType: 'audio/webm;codecs=opus',
            audioBitsPerSecond: 16000
        };

        mediaRecorder = new MediaRecorder(mediaStream, options);

        // Collect audio chunks
        const audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);

                // Convert and send immediately
                const reader = new FileReader();
                reader.onloadend = () => {
                    const arrayBuffer = reader.result;

                    // Convert to PCM
                    convertToPCM(arrayBuffer).then(pcmData => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(pcmData);
                        }
                    });
                };
                reader.readAsArrayBuffer(event.data);
            }
        };

        mediaRecorder.start();

        // Request data every 100ms
        audioChunksInterval = setInterval(() => {
            if (mediaRecorder.state === 'recording') {
                mediaRecorder.requestData();
            }
        }, CHUNK_INTERVAL);

        isRecording = true;

        // Send start message
        ws.send(JSON.stringify({ type: 'start' }));

    } catch (error) {
        console.error('Error starting recording:', error);
        showError('Could not access microphone. Please check permissions.');
    }
}

async function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    if (audioChunksInterval) {
        clearInterval(audioChunksInterval);
        audioChunksInterval = null;
    }

    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    if (audioContext) {
        await audioContext.close();
        audioContext = null;
    }

    isRecording = false;

    // Send stop message
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stop' }));
    }
}

async function convertToPCM(arrayBuffer) {
    try {
        // Create or reuse audio context for conversion
        if (!pcmConverter || pcmConverter.state === 'closed') {
            pcmConverter = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: SAMPLE_RATE
            });
        }

        // Decode audio data
        const audioBuffer = await pcmConverter.decodeAudioData(arrayBuffer);

        // Get channel data
        const channelData = audioBuffer.getChannelData(0);

        // Convert to 16-bit PCM
        const pcmData = new Int16Array(channelData.length);
        for (let i = 0; i < channelData.length; i++) {
            // Clamp and convert to 16-bit
            const sample = Math.max(-1, Math.min(1, channelData[i]));
            pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }

        return pcmData.buffer;

    } catch (error) {
        console.error('Error converting to PCM:', error);
        return new ArrayBuffer(0);
    }
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

function resetConversation() {
    if (isRecording) {
        stopRecording();
    }

    // Clear UI
    partialText.textContent = '';
    finalText.textContent = '';
    responseBox.classList.remove('visible');
    errorMessage.classList.remove('visible');

    // Send reset message
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'reset' }));
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
        await stopRecording();
    }
    if (ws) {
        ws.close();
    }
    if (pcmConverter && pcmConverter.state !== 'closed') {
        await pcmConverter.close();
    }
});