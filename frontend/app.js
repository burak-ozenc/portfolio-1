class VoiceAssistant {
    constructor() {
        this.ws = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;

        this.micButton = document.getElementById('micButton');
        this.status = document.getElementById('status');
        this.transcript = document.getElementById('transcript');

        this.initializeWebSocket();
        this.setupEventListeners();
    }

    initializeWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.updateStatus('Connected! Click microphone to speak');
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateStatus('Connection error');
        };

        this.ws.onclose = () => {
            console.log('WebSocket closed');
            this.updateStatus('Disconnected. Refresh to reconnect.');
        };
    }

    setupEventListeners() {
        this.micButton.addEventListener('click', () => {
            if (this.isRecording) {
                this.stopRecording();
            } else {
                this.startRecording();
            }
        });
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1
                }
            });

            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm'
            });

            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.processAudio();
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            this.micButton.classList.add('recording');
            this.updateStatus('🔴 Recording... Click again to stop');

        } catch (error) {
            console.error('Error accessing microphone:', error);
            this.updateStatus('Microphone access denied');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            this.isRecording = false;
            this.micButton.classList.remove('recording');
            this.updateStatus('Processing...');
        }
    }

    async processAudio() {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

        // Convert to WAV/PCM format
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioContext = new AudioContext({ sampleRate: 16000 });
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Get audio data as PCM
        const pcmData = audioBuffer.getChannelData(0);
        const int16Data = new Int16Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
            int16Data[i] = Math.max(-32768, Math.min(32767, pcmData[i] * 32768));
        }

        // Convert to base64
        const base64Audio = this.arrayBufferToBase64(int16Data.buffer);

        // Send to backend
        this.ws.send(JSON.stringify({
            type: 'audio',
            audio: base64Audio
        }));
    }

    handleMessage(data) {
        switch (data.type) {
            case 'transcription':
                this.addMessage('You', data.text, 'user-message');
                this.updateStatus('Thinking...');
                break;

            case 'text_response':
                this.addMessage('Burak AI', data.text, 'assistant-message');
                this.updateStatus('Speaking...');
                break;

            case 'audio_response':
                this.playAudio(data.audio, data.sample_rate);
                this.updateStatus('Ready to listen...');
                break;

            case 'reset_confirmed':
                this.transcript.innerHTML = '<p style="color: #999; text-align: center;">Conversation reset</p>';
                break;
        }
    }

    addMessage(speaker, text, className) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${className}`;

        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = speaker;

        const content = document.createElement('div');
        content.textContent = text;

        messageDiv.appendChild(label);
        messageDiv.appendChild(content);

        // Clear initial message if present
        if (this.transcript.querySelector('p[style*="color: #999"]')) {
            this.transcript.innerHTML = '';
        }

        this.transcript.appendChild(messageDiv);
        this.transcript.scrollTop = this.transcript.scrollHeight;
    }

    playAudio(base64Audio, sampleRate) {
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const int16Array = new Int16Array(bytes.buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }

        const audioContext = new AudioContext({ sampleRate: sampleRate });
        const audioBuffer = audioContext.createBuffer(1, float32Array.length, sampleRate);
        audioBuffer.getChannelData(0).set(float32Array);

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start();

        source.onended = () => {
            this.updateStatus('Ready to listen...');
        };
    }

    updateStatus(message) {
        this.status.textContent = message;
    }

    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
    new VoiceAssistant();
});