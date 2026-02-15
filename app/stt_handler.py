import asyncio
import json
from typing import Optional, Callable
from deepgram import (
    DeepgramClient,
    DeepgramClientOptions,
    LiveTranscriptionEvents,
    LiveOptions,
)
from app.config import config


class STTHandler:
    def __init__(self):
        """Initialize Deepgram streaming STT handler"""
        self.api_key = config.DEEPGRAM_API_KEY
        self.dg_client = None
        self.dg_connection = None
        self.is_connected = False
        self.transcription_callback = None
        self.final_callback = None
        self.last_speech_time = None
        self.silence_timer_task = None
        self.has_triggered_end = False  # Prevent multiple triggers
        self.keepalive_task = None  # Keepalive task during idle periods
        self.is_reconnecting = False  # Prevent multiple reconnection attempts
        self.is_manual_close = False  # Flag to distinguish manual vs unexpected closes
        self.silence_sender_task = None  # Task that sends silence during speaking

        print("STT Handler initialized")

    async def connect(
            self,
            transcription_callback: Callable[[str, bool], None],
            final_callback: Callable[[str], None]
    ):
        """
        Connect to Deepgram streaming API

        Args:
            transcription_callback: Called with (text, is_final) for each transcription
            final_callback: Called with full text when speech ends
        """
        self.transcription_callback = transcription_callback
        self.final_callback = final_callback
        self.has_triggered_end = False  # Reset flag for new conversation
        self.is_manual_close = False  # Reset manual close flag

        # Cancel any existing silence timer
        if self.silence_timer_task and not self.silence_timer_task.done():
            print("🔄 Cancelling existing silence timer before connect")
            self.silence_timer_task.cancel()
            try:
                await self.silence_timer_task
            except asyncio.CancelledError:
                pass
            self.silence_timer_task = None

        try:
            # Configure Deepgram client
            dg_config = DeepgramClientOptions(
                options={"keepalive": "true"}
            )
            self.dg_client = DeepgramClient(self.api_key, dg_config)

            # Create connection
            self.dg_connection = self.dg_client.listen.asyncwebsocket.v("1")

            # Set up event handlers
            self.dg_connection.on(LiveTranscriptionEvents.Open, self._on_open)
            self.dg_connection.on(LiveTranscriptionEvents.Transcript, self._on_transcript)
            self.dg_connection.on(LiveTranscriptionEvents.Error, self._on_error)
            self.dg_connection.on(LiveTranscriptionEvents.Close, self._on_close)

            # Configure live transcription options
            options = LiveOptions(
                model=config.DEEPGRAM_MODEL,
                language=config.DEEPGRAM_LANGUAGE,
                encoding=config.DEEPGRAM_ENCODING,
                sample_rate=config.DEEPGRAM_SAMPLE_RATE,
                channels=config.DEEPGRAM_CHANNELS,
                punctuate=True,
                interim_results=True,  # Get partial results
                endpointing=300,  # ms of silence before considering utterance complete
                vad_events=True,  # Voice activity detection events
            )

            # Start connection
            await self.dg_connection.start(options)

            # Wait for connection to be established
            await asyncio.sleep(0.5)

            print("✅ Connected to Deepgram STT")

        except Exception as e:
            print(f"❌ Failed to connect to Deepgram: {e}")
            raise

    async def _on_open(self, *args, **kwargs):
        """Called when WebSocket connection opens"""
        self.is_connected = True
        print("🎙️ Deepgram WebSocket opened")

    async def _on_transcript(self, *args, **kwargs):
        """Called when transcription received"""
        try:
            import time
            receive_time = time.time()

            # Extract result from args
            result = kwargs.get('result') or (args[1] if len(args) > 1 else args[0])

            if not result:
                return

            # Parse transcript
            sentence = result.channel.alternatives[0].transcript

            if len(sentence) == 0:
                return

            is_final = result.is_final
            speech_final = result.speech_final if hasattr(result, 'speech_final') else False

            print(f"📝 [{receive_time:.3f}] Transcript: '{sentence}' | is_final={is_final} | speech_final={speech_final}")

            # Update last speech time
            self.last_speech_time = asyncio.get_event_loop().time()

            # Send transcription to callback
            if self.transcription_callback:
                await self.transcription_callback(sentence, is_final)

            # If final OR speech_final, start silence detection timer
            # But ONLY if we don't already have a timer running from a previous final
            if (is_final or speech_final):
                if not self.silence_timer_task or self.silence_timer_task.done():
                    print(f"🔔 Starting NEW silence timer (is_final={is_final}, speech_final={speech_final})")
                    self._start_silence_timer()
                else:
                    print(f"🔄 Restarting silence timer (is_final={is_final}, speech_final={speech_final})")
                    # Cancel old timer and start new one
                    self.silence_timer_task.cancel()
                    self._start_silence_timer()

        except Exception as e:
            print(f"Error processing transcript: {e}")
            import traceback
            traceback.print_exc()

    def _start_silence_timer(self):
        """Start timer to detect end of speech"""
        # Cancel existing timer if any
        if self.silence_timer_task and not self.silence_timer_task.done():
            self.silence_timer_task.cancel()

        # Start new timer
        self.silence_timer_task = asyncio.create_task(self._silence_timer())

    async def _silence_timer(self):
        """Wait for silence threshold, then trigger final callback"""
        import time
        try:
            start_time = time.time()
            print(f"⏱️ Silence timer started, waiting {config.SILENCE_THRESHOLD}s...")
            await asyncio.sleep(config.SILENCE_THRESHOLD)

            # If we reach here, silence threshold met
            elapsed = time.time() - start_time
            print(f"✅ Silence threshold met after {elapsed:.2f}s")

            # Check if we've already triggered (race condition protection)
            if self.has_triggered_end:
                print("⚠️ Callback already triggered, skipping")
                return

            self.has_triggered_end = True

            if self.final_callback:
                print("📞 Triggering speech end callback...")
                # Signal that speech has ended
                await self.final_callback()
            else:
                print("⚠️ No final_callback set!")

        except asyncio.CancelledError:
            # Timer was cancelled (more speech detected or new conversation started)
            print(f"🔄 Silence timer cancelled")
            # Don't raise - just exit gracefully
            pass

    async def _on_error(self, *args, **kwargs):
        """Called on error - trigger auto-reconnect"""
        error = kwargs.get('error') or (args[1] if len(args) > 1 else args[0])
        print(f"❌ Deepgram error: {error}")

        # Trigger auto-reconnect
        if not self.is_reconnecting:
            print("🔄 Triggering auto-reconnect due to error...")
            asyncio.create_task(self._auto_reconnect())

    async def _on_close(self, *args, **kwargs):
        """Called when connection closes - trigger auto-reconnect if unexpected"""
        was_connected = self.is_connected
        self.is_connected = False
        print("🔌 Deepgram WebSocket closed")

        # Only auto-reconnect if this was NOT a manual close
        if was_connected and not self.is_reconnecting and not self.is_manual_close and self.transcription_callback:
            print("🔄 Unexpected closure - triggering auto-reconnect...")
            asyncio.create_task(self._auto_reconnect())

    async def send_audio(self, audio_data: bytes):
        """Send audio chunk to Deepgram"""
        if not self.is_connected or not self.dg_connection:
            return

        try:
            await self.dg_connection.send(audio_data)
        except Exception as e:
            print(f"Error sending audio: {e}")

    async def send_keepalive(self):
        """Send keepalive message to Deepgram to prevent timeout"""
        if not self.is_connected or not self.dg_connection:
            return

        try:
            await self.dg_connection.keep_alive()
        except Exception as e:
            print(f"⚠️ Error sending keepalive: {e}")

    async def start_keepalive_task(self):
        """Start periodic keepalive task to prevent timeout during idle periods"""
        if self.keepalive_task and not self.keepalive_task.done():
            return  # Already running

        print("🔄 Starting keepalive task (5s interval)")
        self.keepalive_task = asyncio.create_task(self._keepalive_loop())

    async def stop_keepalive_task(self):
        """Stop the keepalive task"""
        if self.keepalive_task and not self.keepalive_task.done():
            print("🛑 Stopping keepalive task")
            self.keepalive_task.cancel()
            try:
                await self.keepalive_task
            except asyncio.CancelledError:
                pass
            self.keepalive_task = None

    async def _keepalive_loop(self):
        """Periodically send keepalive messages"""
        try:
            while True:
                await asyncio.sleep(5)  # Send keepalive every 5 seconds
                if self.is_connected:
                    await self.send_keepalive()
        except asyncio.CancelledError:
            print("✅ Keepalive task cancelled")
        except Exception as e:
            print(f"❌ Keepalive loop error: {e}")

    async def start_silence_sender(self):
        """Start sending silence audio to Deepgram to prevent timeout"""
        if self.silence_sender_task and not self.silence_sender_task.done():
            return  # Already running

        print("🔇 Starting silence sender (2s interval)")
        self.silence_sender_task = asyncio.create_task(self._silence_sender_loop())

    async def stop_silence_sender(self):
        """Stop the silence sender task"""
        if self.silence_sender_task and not self.silence_sender_task.done():
            print("🛑 Stopping silence sender")
            self.silence_sender_task.cancel()
            try:
                await self.silence_sender_task
            except asyncio.CancelledError:
                pass
            self.silence_sender_task = None

    async def _silence_sender_loop(self):
        """Periodically send silence audio frames to keep connection alive"""
        import numpy as np

        try:
            # Generate 100ms of silence at 16kHz
            sample_rate = config.DEEPGRAM_SAMPLE_RATE
            duration_ms = 100
            num_samples = int(sample_rate * duration_ms / 1000)
            silence = np.zeros(num_samples, dtype=np.int16)
            silence_bytes = silence.tobytes()

            while True:
                await asyncio.sleep(2)  # Send silence every 2 seconds
                if self.is_connected and self.dg_connection:
                    try:
                        await self.dg_connection.send(silence_bytes)
                        print("🔇 Sent silence to Deepgram")
                    except Exception as e:
                        print(f"⚠️ Error sending silence: {e}")
                        break

        except asyncio.CancelledError:
            print("✅ Silence sender task cancelled")
        except Exception as e:
            print(f"❌ Silence sender loop error: {e}")

    async def _auto_reconnect(self):
        """Automatically reconnect to Deepgram after connection loss"""
        if self.is_reconnecting:
            return  # Already reconnecting

        self.is_reconnecting = True
        max_retries = 3
        retry_delay = 2  # seconds

        for attempt in range(max_retries):
            try:
                print(f"🔄 Reconnect attempt {attempt + 1}/{max_retries}...")

                # Close existing connection if any
                if self.dg_connection:
                    try:
                        await self.dg_connection.finish()
                    except:
                        pass

                # Wait before retrying
                if attempt > 0:
                    await asyncio.sleep(retry_delay * attempt)

                # Reconnect with same callbacks
                await self.connect(
                    transcription_callback=self.transcription_callback,
                    final_callback=self.final_callback
                )

                print(f"✅ Successfully reconnected to Deepgram")
                self.is_reconnecting = False
                return

            except Exception as e:
                print(f"❌ Reconnect attempt {attempt + 1} failed: {e}")
                if attempt == max_retries - 1:
                    print(f"❌ All reconnect attempts failed")

        self.is_reconnecting = False

    async def close(self):
        """Close connection to Deepgram (manual close)"""
        try:
            # Mark as manual close to prevent auto-reconnect
            self.is_manual_close = True

            # Stop all tasks
            await self.stop_keepalive_task()
            await self.stop_silence_sender()

            # Cancel silence timer if running
            if self.silence_timer_task and not self.silence_timer_task.done():
                print("🔄 Cancelling silence timer on close")
                self.silence_timer_task.cancel()
                try:
                    await self.silence_timer_task
                except asyncio.CancelledError:
                    pass
                self.silence_timer_task = None

            if self.dg_connection:
                await self.dg_connection.finish()
                self.is_connected = False
                print("✅ Deepgram connection closed (manual)")

            # Reset manual close flag after a short delay
            await asyncio.sleep(0.5)
            self.is_manual_close = False

        except Exception as e:
            print(f"Error closing Deepgram: {e}")
            self.is_manual_close = False