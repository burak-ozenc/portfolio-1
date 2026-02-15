---
title: Talk to Burak - Voice Portfolio
emoji: 🎙️
colorFrom: purple
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# Voice Portfolio Assistant

AI-powered voice assistant for real-time conversations with an AI version of given persona.

## Tech Stack
- **STT:** Deepgram (speech-to-text)
- **LLM:** Groq (AI responses)
- **TTS:** Pocket TTS (text-to-speech)
- **Backend:** FastAPI + WebSockets
- **Frontend:** TypeScript  + React

## Quick Start

### Prompt Injection
Go to **config/system_prompt.txt** and fill out your custom prompt.

### Local Development
```bash
# Install dependencies
pip install -r requirements.txt
npm install

# Create .env file
echo "GROQ_API_KEY=your_key" >> .env
echo "DEEPGRAM_API_KEY=your_key" >> .env

# Run server
uvicorn app.main:app --reload --port 7860

# Run frontend
npm run dev
# Open http://localhost:3000

```

### Docker
```bash
docker-compose up --build
```

## Required API Keys
- **GROQ_API_KEY:**
- **DEEPGRAM_API_KEY:**

## How It Works
1. User speaks → Browser captures audio
2. Audio streams to Deepgram → Real-time transcription
3. Transcription sent to Groq LLM → AI generates response
4. Response synthesized via Pocket TTS → Audio plays back
5. Conversation continues with context maintained