from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
import json
import base64
from pathlib import Path

from app.config import config
from app.stt_handler import STTHandler
from app.llm_handler import LLMHandler
from app.tts_handler import TTSHandler

# Initialize FastAPI
app = FastAPI(title="Voice Portfolio Assistant")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize handlers (loaded once at startup)
stt_handler = None
llm_handler = None
tts_handler = None

@app.on_event("startup")
async def startup_event():
    """Initialize models on startup"""
    global stt_handler, llm_handler, tts_handler

    print("Validating configuration...")
    config.validate()

    print("Loading models...")
    stt_handler = STTHandler()
    llm_handler = LLMHandler()
    tts_handler = TTSHandler()
    print("All models loaded successfully!")

# Serve static frontend files
frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")

@app.get("/")
async def root():
    """Serve the main page"""
    index_file = frontend_path / "index.html"
    if index_file.exists():
        return HTMLResponse(content=index_file.read_text())
    return {"message": "Voice Portfolio Assistant API"}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "models_loaded": all([stt_handler, llm_handler, tts_handler])
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time audio communication"""
    await websocket.accept()
    print("WebSocket connection established")

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)

            msg_type = message.get("type")

            if msg_type == "audio":
                # Receive audio data (base64 encoded)
                audio_b64 = message.get("audio")
                audio_bytes = base64.b64decode(audio_b64)

                print("Received audio, transcribing...")

                # Step 1: Speech to Text
                transcription = await stt_handler.transcribe(audio_bytes)
                print(f"Transcription: {transcription}")

                # Send transcription to client
                await websocket.send_json({
                    "type": "transcription",
                    "text": transcription
                })

                if not transcription:
                    continue

                # Step 2: LLM Processing
                print("Generating LLM response...")
                response_text = await llm_handler.generate_response(transcription)
                print(f"LLM Response: {response_text}")

                # Send text response to client
                await websocket.send_json({
                    "type": "text_response",
                    "text": response_text
                })

                # Step 3: Text to Speech
                print("Synthesizing speech...")
                audio_response = await tts_handler.synthesize(response_text)

                # Send audio response (base64 encoded)
                audio_response_b64 = base64.b64encode(audio_response).decode('utf-8')
                await websocket.send_json({
                    "type": "audio_response",
                    "audio": audio_response_b64,
                    "sample_rate": tts_handler.get_sample_rate()
                })

                print("Response sent!")

            elif msg_type == "reset":
                # Reset conversation
                llm_handler.reset_conversation()
                await websocket.send_json({
                    "type": "reset_confirmed"
                })
                print("Conversation reset")

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.close()