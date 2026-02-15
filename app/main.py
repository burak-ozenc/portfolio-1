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

# Frontend directory (frontend built files)
frontend_2_dir = Path(__file__).parent.parent / "frontend" / "dist"

# Check if frontend built files exist
if frontend_2_dir.exists():
    # Serve frontend static assets
    app.mount("/assets", StaticFiles(directory=str(frontend_2_dir / "assets")), name="assets")
    print("✅ frontend static files mounted at /assets")
else:
    print("⚠️ frontend not found - run 'npm run build' in frontend directory")


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

        # Interruption handling
        self.is_speaking = False
        self.interrupt_requested = False
        self.interruption_enabled = config.INTERRUPTION_ENABLED

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

        # Cancel any existing silence timer from previous turn
        if self.stt_handler and self.stt_handler.silence_timer_task:
            if not self.stt_handler.silence_timer_task.done():
                print("🔄 Cancelling old silence timer from previous turn")
                self.stt_handler.silence_timer_task.cancel()
                try:
                    await self.stt_handler.silence_timer_task
                except asyncio.CancelledError:
                    pass

        # Only connect if not already connected (keep connection alive across turns)
        if not self.stt_handler.is_connected:
            connect_start = time.time()
            print("🔌 Connecting to Deepgram...")
            await self.stt_handler.connect(
                transcription_callback=self.on_transcription,
                final_callback=self.on_speech_end
            )
            connect_duration = time.time() - connect_start
            print(f"✅ Connected in {connect_duration:.2f}s")
        else:
            print("✅ Reusing existing Deepgram connection")
            # Reset the has_triggered_end flag for new turn
            self.stt_handler.has_triggered_end = False

        await self.send_message("status", "listening")

        total_duration = time.time() - start_time
        print(f"\n{'='*60}")
        print(f"✅ CONVERSATION STARTED")
        print(f"{'='*60}")
        print(f"   Total Time: {total_duration:.2f}s")
        print(f"{'='*60}\n")

    async def on_transcription(self, text: str, is_final: bool):
        """Called when transcription received from Deepgram"""
        print(f"📨 Transcription: '{text}' | is_final={is_final} | is_speaking={self.is_speaking}")

        # INTERRUPT: If speaking and ANY text received, stop immediately
        if self.is_speaking and text.strip():
            print(f"🛑 INTERRUPT: '{text}'")
            self.interrupt_requested = True  # Break audio loop
            self.is_speaking = False
            self.is_processing = False
            self.current_transcription = ""
            await self.websocket.send_json({"type": "audio_config", "stream_status": "stop_stream"})
            await self.send_message("audio_stopped", "interrupted")
            await self.send_message("status", "listening")
            return

        # Normal transcription (during listening)
        if self.is_processing:
            return

        if is_final and text.strip():
            if self.current_transcription:
                self.current_transcription += " " + text
            else:
                self.current_transcription = text
            print(f"📝 Full: '{self.current_transcription}'")

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
        print(f"   STT handler state: {self.stt_handler.has_triggered_end if self.stt_handler else 'None'}")
        print(f"{'='*60}\n")

        if self.is_processing:
            print("⚠️ Already processing, ignoring (this prevents double-trigger)")
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
            # Keep STT connection open and start sending silence to prevent timeout
            print("⏰ [0.0s] Keeping STT connection open...")

            # Start silence sender immediately to prevent timeout during thinking/speaking
            if self.stt_handler:
                await self.stt_handler.start_silence_sender()

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

            # Check for interrupt request during thinking phase
            if self.interrupt_requested:
                print("🛑 Interrupt detected during thinking phase - skipping TTS")
                await self.handle_interruption()
                return

            # Send LLM response to frontend
            await self.send_message("response", llm_response)
            print(f"⏰ [{time.time() - start_time:.1f}s] Response sent to frontend")

            # STT remains open for interruption monitoring (no need to reconnect)
            # is_speaking flag will be set to True, so on_transcription handles interrupts
            print(f"🎙️ STT already listening for interruptions (continuous connection)")

            # Generate TTS audio
            await self.send_message("status", "speaking")
            print(f"⏰ [{time.time() - start_time:.1f}s] Status: speaking")

            tts_start = time.time()
            print(f"\n🔊 GENERATING TTS ({len(llm_response)} chars)")
            audio_stream = self.tts_handler.synthesize_stream(llm_response)
            tts_duration = time.time() - tts_start
            print(f"✅ TTS Generated ({tts_duration:.2f}s)")

            # Send audio to frontend
            send_start = time.time()
            print(f"\n📤 SENDING AUDIO TO FRONTEND")

            # Stop silence sender - we need clean audio for interruption detection
            if self.stt_handler:
                await self.stt_handler.stop_silence_sender()

            self.is_speaking = True
            await self.send_audio(audio_stream)
            send_duration = time.time() - send_start
            print(f"✅ Audio send completed in {send_duration:.2f}s")

            # Check if interrupted during streaming
            if self.interrupt_requested:
                print(f"🛑 Audio loop was interrupted - cleanup done in on_transcription")
                self.interrupt_requested = False
                return

            print(f"✅ Audio playback completed without interruption")
            self.is_speaking = False
            print("🎙️ STT remains open for next turn")

            # Reset for next turn
            self.is_processing = False

            # Ready for next input
            print(f"\n📨 SENDING READY STATUS")
            await self.send_message("status", "ready")
            print(f"✅ Ready status sent")

            # Reset STT handler flag for next turn
            if self.stt_handler:
                self.stt_handler.has_triggered_end = False
                print(f"✅ STT handler reset for next turn")

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

    async def handle_interruption(self):
        """Handle user interruption during AI response"""
        print(f"\n{'='*60}")
        print(f"🛑 HANDLING INTERRUPTION")
        print(f"{'='*60}\n")

        # Clear state
        self.is_speaking = False
        self.interrupt_requested = False
        self.is_processing = False
        self.current_transcription = ""

        # Stop silence sender and reset STT state
        if self.stt_handler:
            # Stop silence sender if running
            await self.stt_handler.stop_silence_sender()

            # Reset state for new turn
            self.stt_handler.has_triggered_end = False

            # Cancel any running silence timer
            if self.stt_handler.silence_timer_task and not self.stt_handler.silence_timer_task.done():
                self.stt_handler.silence_timer_task.cancel()
                try:
                    await self.stt_handler.silence_timer_task
                except asyncio.CancelledError:
                    pass
            print("🎙️ STT state reset after interruption")


        # send signal to stop stream
        await self.websocket.send_json({ "type": "audio_config", "stream_status": "stop_stream"})
        
        # Notify frontend
        await self.send_message("audio_stopped", "interrupted")

        # Go back to listening state immediately (no reconnection delay!)
        await self.send_message("status", "listening")
        print("✅ Ready for new input immediately (no reconnection needed)")

    async def process_audio_chunk(self, audio_data: bytes):
        """Process incoming audio chunk"""
        import time

        # Always send audio to STT during speaking (for interruption detection)
        # Only ignore during thinking phase
        if self.is_processing and not self.is_speaking:
            return

        self.audio_chunks_received += 1
        current_time = time.time()

        # Log every 5 seconds
        if current_time - self.last_audio_log_time >= 5.0:
            print(f"🎵 Audio streaming: {self.audio_chunks_received} chunks received")
            self.last_audio_log_time = current_time

        if self.stt_handler:
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

    async def send_audio(self, audio_bytes: [bytes]):
        """Send audio data to frontend"""
        if not self.websocket:
            print(f"⚠️ Cannot send audio: No websocket")
            return

        try:
            # Check if websocket is still connected
            ws_state = self.websocket.client_state.name
            print(f"📤 Attempting to send audio: WebSocket state = {ws_state}")

            if ws_state != "CONNECTED":
                print(f"⚠️ Cannot send audio: WebSocket state is {ws_state}")
                return
            # Send sample rate first
            await self.websocket.send_json({
                "type": "audio_config",
                "data": {
                    "sample_rate": self.tts_handler.get_sample_rate()
                },
                "stream_status": "begin_stream"
            })
            print(f"✅ Sent audio config")
           
            print(f"🔍 Monitoring for interruptions...")
            # stream audio data
            async for pcm_chunk in audio_bytes:
                # Check if interrupted
                if self.interrupt_requested:
                    print("🛑 Stopping audio stream - interrupt requested")
                    break

                await asyncio.sleep(0)
                await self.websocket.send_bytes(pcm_chunk)
            
            # send signal to stop stream
            await self.websocket.send_json({
                "type": "audio_config",
                "stream_status": "stop_stream"
            })

        except Exception as e:
            print(f"❌ Error sending audio: {e}")
            import traceback
            traceback.print_exc()

    async def cleanup(self):
        """Cleanup resources"""
        if self.stt_handler:
            await self.stt_handler.close()


@app.get("/")
async def root():
    """Serve frontend (React UI)"""
    if frontend_2_dir.exists():
        return FileResponse(frontend_2_dir / "index.html")
    else:
        return {"error": "Frontend not found. Run 'npm run build' in frontend directory."}


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

                        elif msg_type == "interrupt":
                            # User interrupted the AI response (already validated by frontend)
                            print("🛑 Interrupt message received from frontend")
                            if manager.is_speaking or manager.is_processing:
                                print("✅ Handling interruption immediately")
                                manager.interrupt_requested = True
                                await manager.handle_interruption()
                            else:
                                print("⚠️ Interrupt ignored - not currently processing")

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

            except Exception as receive_error:
                # Log the specific error instead of breaking immediately
                print(f"⚠️ Error in receive loop: {receive_error}")
                import traceback
                traceback.print_exc()
                # Don't break - try to continue if possible
                await asyncio.sleep(0.1)
                continue

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