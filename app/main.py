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
        self.audio_chunks_received = 0
        self.last_audio_log_time = 0

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
        import time
        start_time = time.time()

        print(f"\n{'='*60}")
        print(f"🎙️ STARTING NEW CONVERSATION")
        print(f"{'='*60}\n")

        self.current_transcription = ""
        self.is_processing = False
        self.audio_chunks_received = 0
        self.last_audio_log_time = time.time()

        # Connect to Deepgram
        connect_start = time.time()
        await self.stt_handler.connect(
            transcription_callback=self.on_transcription,
            final_callback=self.on_speech_end
        )
        connect_duration = time.time() - connect_start

        await self.send_message("status", "listening")

        total_duration = time.time() - start_time
        print(f"\n{'='*60}")
        print(f"✅ CONVERSATION STARTED")
        print(f"{'='*60}")
        print(f"   Connection Time: {connect_duration:.2f}s")
        print(f"   Total Time: {total_duration:.2f}s")
        print(f"{'='*60}\n")

    async def on_transcription(self, text: str, is_final: bool):
        """Called when transcription received from Deepgram"""
        print(f"📨 Received transcription: '{text}' | is_final={is_final}")

        if is_final:
            # Append to current transcription
            if text.strip():
                if self.current_transcription:
                    self.current_transcription += " " + text
                else:
                    self.current_transcription = text
                print(f"📝 Full transcription so far: '{self.current_transcription}'")

        # Send to frontend (both partial and final)
        await self.send_message("transcription", {
            "text": text,
            "is_final": is_final,
            "full_text": self.current_transcription
        })

    async def on_speech_end(self):
        """Called when speech ends (silence detected)"""
        import time
        import re
        start_time = time.time()

        print(f"\n{'='*60}")
        print(f"🎤 SPEECH END TRIGGERED")
        print(f"{'='*60}")
        print(f"   is_processing: {self.is_processing}")
        print(f"   transcription: '{self.current_transcription}'")
        print(f"{'='*60}\n")

        if self.is_processing:
            print("⚠️ Already processing, ignoring")
            return

        if not self.current_transcription.strip():
            print("⚠️ No transcription to process")
            return

        # Mark as processing FIRST to prevent race conditions
        self.is_processing = True
        user_message = self.current_transcription

        # Simple deduplication: remove consecutive duplicate words
        # "I I I was was was" -> "I was"
        # "Great. Great. Great." -> "Great."
        words = user_message.split()
        deduped_words = []
        prev_word = None
        for word in words:
            if word != prev_word:
                deduped_words.append(word)
                prev_word = word

        cleaned_message = ' '.join(deduped_words)

        if cleaned_message != user_message:
            print(f"🧹 Cleaned duplicates:")
            print(f"   Original: '{user_message}'")
            print(f"   Cleaned:  '{cleaned_message}'")

        # Clear transcription for next turn
        self.current_transcription = ""

        try:
            # Close STT connection (but don't await - let it close in background)
            print("⏰ [0.0s] Closing STT connection...")
            if self.stt_handler:
                asyncio.create_task(self.stt_handler.close())

            # Send thinking status
            await self.send_message("status", "thinking")
            print(f"⏰ [{time.time() - start_time:.1f}s] Status: thinking")

            # Get LLM response
            llm_start = time.time()
            print(f"\n🤖 CALLING LLM")
            print(f"   Input: '{cleaned_message}'")
            llm_response = await self.llm_handler.generate_response(cleaned_message)
            llm_duration = time.time() - llm_start
            print(f"✅ LLM Response ({llm_duration:.2f}s): '{llm_response[:100]}...'")

            # Send LLM response to frontend
            await self.send_message("response", llm_response)
            print(f"⏰ [{time.time() - start_time:.1f}s] Response sent to frontend")

            # Generate TTS audio
            await self.send_message("status", "speaking")
            print(f"⏰ [{time.time() - start_time:.1f}s] Status: speaking")

            tts_start = time.time()
            print(f"\n🔊 GENERATING TTS ({len(llm_response)} chars)")
            audio_bytes = await self.tts_handler.synthesize(llm_response)
            tts_duration = time.time() - tts_start
            print(f"✅ TTS Generated ({tts_duration:.2f}s): {len(audio_bytes)} bytes")

            # Send audio to frontend
            send_start = time.time()
            await self.send_audio(audio_bytes)
            send_duration = time.time() - send_start
            print(f"✅ Audio Sent ({send_duration:.2f}s)")

            # Reset for next turn
            self.is_processing = False

            # Ready for next input
            await self.send_message("status", "ready")

            total_duration = time.time() - start_time
            print(f"\n{'='*60}")
            print(f"✅ RESPONSE COMPLETE")
            print(f"{'='*60}")
            print(f"   Total Duration: {total_duration:.2f}s")
            print(f"   - LLM: {llm_duration:.2f}s")
            print(f"   - TTS: {tts_duration:.2f}s")
            print(f"   - Send: {send_duration:.2f}s")
            print(f"{'='*60}\n")

        except Exception as e:
            print(f"\n❌ ERROR IN CONVERSATION")
            print(f"   Error: {e}")
            import traceback
            traceback.print_exc()
            await self.send_message("error", str(e))
            self.is_processing = False
            await self.send_message("status", "ready")

    async def process_audio_chunk(self, audio_data: bytes):
        """Process incoming audio chunk"""
        import time

        self.audio_chunks_received += 1
        current_time = time.time()

        # Log every 5 seconds
        if current_time - self.last_audio_log_time >= 5.0:
            print(f"🎵 Audio streaming: {self.audio_chunks_received} chunks received")
            self.last_audio_log_time = current_time

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
                else:
                    print(f"⚠️ Cannot send {message_type}: WebSocket state is {self.websocket.client_state.name}")
            except Exception as e:
                print(f"❌ Error sending {message_type}: {e}")

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
                # Check if websocket is still connected (but don't break on error)
                try:
                    if websocket.client_state.name != "CONNECTED":
                        print("🔌 WebSocket no longer connected, breaking loop")
                        break
                except Exception as state_check_error:
                    # If we can't check state, try to receive anyway
                    print(f"⚠️ Could not check WebSocket state: {state_check_error}")

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
                            # User stopped speaking - process the transcription
                            print("🛑 User clicked stop")
                            await manager.on_speech_end()

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