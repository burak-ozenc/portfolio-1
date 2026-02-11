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
            # Extract result from args
            result = kwargs.get('result') or (args[1] if len(args) > 1 else args[0])

            if not result:
                return

            # Parse transcript
            sentence = result.channel.alternatives[0].transcript

            if len(sentence) == 0:
                return

            is_final = result.is_final

            # Update last speech time
            self.last_speech_time = asyncio.get_event_loop().time()

            # Send transcription to callback
            if self.transcription_callback:
                await self.transcription_callback(sentence, is_final)

            # If final, start silence detection timer
            if is_final:
                self._start_silence_timer()

        except Exception as e:
            print(f"Error processing transcript: {e}")

    def _start_silence_timer(self):
        """Start timer to detect end of speech"""
        # Cancel existing timer if any
        if self.silence_timer_task and not self.silence_timer_task.done():
            self.silence_timer_task.cancel()

        # Start new timer
        self.silence_timer_task = asyncio.create_task(self._silence_timer())

    async def _silence_timer(self):
        """Wait for silence threshold, then trigger final callback"""
        try:
            await asyncio.sleep(config.SILENCE_THRESHOLD)

            # If we reach here, silence threshold met
            if self.final_callback:
                # Signal that speech has ended
                await self.final_callback()

        except asyncio.CancelledError:
            # Timer was cancelled (more speech detected)
            pass

    async def _on_error(self, *args, **kwargs):
        """Called on error"""
        error = kwargs.get('error') or (args[1] if len(args) > 1 else args[0])
        print(f"❌ Deepgram error: {error}")

    async def _on_close(self, *args, **kwargs):
        """Called when connection closes"""
        self.is_connected = False
        print("🔌 Deepgram WebSocket closed")

    async def send_audio(self, audio_data: bytes):
        """Send audio chunk to Deepgram"""
        if not self.is_connected or not self.dg_connection:
            return

        try:
            await self.dg_connection.send(audio_data)
        except Exception as e:
            print(f"Error sending audio: {e}")

    async def close(self):
        """Close connection to Deepgram"""
        try:
            # Cancel silence timer if running
            if self.silence_timer_task and not self.silence_timer_task.done():
                self.silence_timer_task.cancel()

            if self.dg_connection:
                await self.dg_connection.finish()
                self.is_connected = False
                print("✅ Deepgram connection closed")

        except Exception as e:
            print(f"Error closing Deepgram: {e}")