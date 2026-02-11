from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import json
import asyncio
from pathlib import Path

from app.config import config
from app.stt_handler import STTHandler
from app.llm_handler import LLMHandler
from app.tts_handler import TTSHandler

# Validate config
config.validate()

# Initialize FastAPI
app = FastAPI(title="Voice Portfolio Assistant")

# Mount static files for frontend
frontend_dir = Path(__file__).parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")


class ConnectionManager:
    """Manages WebSocket connections and conversation state"""

    def __init__(self):
        self.stt_handler: STTHandler = None
        self.llm_handler: LLMHandler = None
        self.tts_handler: TTSHandler = None
        self.websocket: WebSocket = None
        self.current_transcription = ""
        self.is_processing = False

    async def initialize(self, websocket: WebSocket):
        """Initialize handlers for a new connection"""
        self.websocket = websocket

        # Initialize handlers
        print("Initializing handlers...")
        self.stt_handler = STTHandler()
        self.llm_handler = LLMHandler()

        # Initialize TTS (might take a moment to load model)
        if not self.tts_handler:
            await self.send_message("status", "loading_tts")
            self.tts_handler = TTSHandler()

        await self.send_message("status", "ready")

    async def start_conversation(self):
        """Start a new conversation session"""
        self.current_transcription = ""
        self.is_processing = False

        # Connect to Deepgram
        await self.stt_handler.connect(
            transcription_callback=self.on_transcription,
            final_callback=self.on_speech_end
        )

        await self.send_message("status", "listening")

    async def on_transcription(self, text: str, is_final: bool):
        """Called when transcription received from Deepgram"""
        if is_final:
            # Append to current transcription
            if text.strip():
                if self.current_transcription:
                    self.current_transcription += " " + text
                else:
                    self.current_transcription = text

        # Send to frontend (both partial and final)
        await self.send_message("transcription", {
            "text": text,
            "is_final": is_final,
            "full_text": self.current_transcription
        })

    async def on_speech_end(self):
        """Called when speech ends (silence detected)"""
        if self.is_processing:
            return

        if not self.current_transcription.strip():
            return

        self.is_processing = True

        # Close STT connection
        await self.stt_handler.close()

        # Send thinking status
        await self.send_message("status", "thinking")

        try:
            # Get LLM response
            print(f"User: {self.current_transcription}")
            llm_response = await self.llm_handler.generate_response(
                self.current_transcription
            )
            print(f"Assistant: {llm_response}")

            # Send LLM response to frontend
            await self.send_message("response", llm_response)

            # Generate TTS audio
            await self.send_message("status", "speaking")
            audio_bytes = await self.tts_handler.synthesize(llm_response)

            # Send audio to frontend
            await self.send_audio(audio_bytes)

            # Reset for next turn
            self.current_transcription = ""
            self.is_processing = False

            # Ready for next input
            await self.send_message("status", "ready")

        except Exception as e:
            print(f"Error in conversation: {e}")
            await self.send_message("error", str(e))
            self.is_processing = False
            await self.send_message("status", "ready")

    async def process_audio_chunk(self, audio_data: bytes):
        """Process incoming audio chunk"""
        if self.stt_handler and not self.is_processing:
            await self.stt_handler.send_audio(audio_data)

    async def send_message(self, message_type: str, data):
        """Send JSON message to frontend"""
        if self.websocket:
            try:
                # Check if websocket is still connected
                if self.websocket.client_state.name == "CONNECTED":
                    await self.websocket.send_json({
                        "type": message_type,
                        "data": data
                    })
            except Exception as e:
                print(f"Error sending message: {e}")

    async def send_audio(self, audio_bytes: bytes):
        """Send audio data to frontend"""
        if self.websocket:
            try:
                # Check if websocket is still connected
                if self.websocket.client_state.name != "CONNECTED":
                    return

                # Send sample rate first
                await self.websocket.send_json({
                    "type": "audio_config",
                    "data": {
                        "sample_rate": self.tts_handler.get_sample_rate()
                    }
                })

                # Send audio data
                await self.websocket.send_bytes(audio_bytes)

            except Exception as e:
                print(f"Error sending audio: {e}")

    async def cleanup(self):
        """Cleanup resources"""
        if self.stt_handler:
            await self.stt_handler.close()


@app.get("/")
async def root():
    """Serve frontend"""
    return FileResponse(frontend_dir / "index.html")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for voice conversation"""
    await websocket.accept()
    print("🔌 Client connected")

    manager = ConnectionManager()

    try:
        # Initialize connection
        await manager.initialize(websocket)

        # Main message loop
        while True:
            try:
                # Check if websocket is still connected
                if websocket.client_state.name != "CONNECTED":
                    print("🔌 WebSocket no longer connected, breaking loop")
                    break

                # Receive message with timeout
                data = await asyncio.wait_for(
                    websocket.receive(),
                    timeout=300.0  # 5 minutes timeout
                )

                if "text" in data:
                    # JSON message
                    try:
                        message = json.loads(data["text"])
                        msg_type = message.get("type")

                        if msg_type == "start":
                            # Start new conversation
                            await manager.start_conversation()

                        elif msg_type == "stop":
                            # Stop current session
                            await manager.cleanup()
                            await manager.send_message("status", "ready")

                        elif msg_type == "reset":
                            # Reset conversation history
                            manager.llm_handler.reset_conversation()
                            await manager.send_message("status", "ready")

                        elif msg_type == "ping":
                            # Keepalive ping - respond with pong
                            await manager.send_message("pong", "ok")

                    except json.JSONDecodeError as e:
                        print(f"Invalid JSON: {e}")
                        continue

                elif "bytes" in data:
                    # Audio chunk
                    audio_chunk = data["bytes"]
                    await manager.process_audio_chunk(audio_chunk)

            except asyncio.TimeoutError:
                # Timeout waiting for data - check if still connected
                print("⏱️ Receive timeout - connection idle")
                break

    except WebSocketDisconnect:
        print("🔌 Client disconnected normally")

    except Exception as e:
        print(f"❌ WebSocket error: {e}")
        import traceback
        traceback.print_exc()

    finally:
        await manager.cleanup()
        print("✅ Cleanup completed")


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=config.HOST,
        port=config.PORT,
        log_level="info"
    )