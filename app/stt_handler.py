from groq import Groq
from app.config import config
import tempfile
import wave
import os

class STTHandler:
    def __init__(self):
        self.client = Groq(api_key=config.GROQ_API_KEY)
        print("STT Handler initialized with Groq Whisper API")

    async def transcribe(self, audio_bytes: bytes) -> str:
        """Transcribe audio bytes to text using Groq Whisper"""
        try:
            # Save audio to temporary file (Groq needs file-like object)
            # Create a proper WAV file from PCM data
            with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_audio:
                temp_path = temp_audio.name

            # Write WAV file with proper headers
            with wave.open(temp_path, 'wb') as wav_file:
                # Set WAV parameters
                wav_file.setnchannels(1)  # Mono
                wav_file.setsampwidth(2)  # 16-bit
                wav_file.setframerate(16000)  # 16kHz
                wav_file.writeframes(audio_bytes)

            try:
                # Transcribe using Groq Whisper
                with open(temp_path, 'rb') as audio_file:
                    transcription = self.client.audio.transcriptions.create(
                        file=(temp_path, audio_file.read(), "audio/wav"),
                        model="whisper-large-v3",
                        language="en",
                        response_format="text"
                    )

                return transcription.text
            finally:
                # Clean up temp file
                os.unlink(temp_path)

        except Exception as e:
            print(f"STT Error: {e}")
            return ""