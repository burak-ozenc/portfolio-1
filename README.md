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

An AI-powered voice assistant that lets visitors talk to an AI version of Burak.

## Features
- Real-time voice conversation
- Speech-to-Text (Kyutai STT)
- LLM responses (Groq API)
- Text-to-Speech (Kyutai Pocket TTS)
- Runs entirely on free CPU tier!

## Setup

Required secrets in HF Spaces settings:
- `GROQ_API_KEY`: Your Groq API key
- `HF_TOKEN`: Your Hugging Face token
```

---

**Your complete structure should now be:**
```
your-hf-space/
├── .env
├── .gitignore
├── Dockerfile
├── README.md
├── requirements.txt
├── app/
│   ├── config.py
│   ├── llm_handler.py
│   ├── main.py
│   ├── stt_handler.py
│   └── tts_handler.py
├── config/
│   └── system_prompt.txt
└── frontend/
├── app.js
└── index.html