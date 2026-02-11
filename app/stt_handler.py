from groq import Groq
from app.config import config
import tempfile
import os

class STTHandler:
    def __init__(self):
        self.client = Groq(api_key=config.GROQ_API_KEY)
        print("STT Handler initialized with Groq Whisper API")

    async def transcribe(self, audio_bytes: bytes) -> str:
        """Transcribe audio bytes to text using Groq Whisper"""
        try:
            # Save audio to temporary file (Groq needs file-like object)
            with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_audio:
                temp_audio.write(audio_bytes)
                temp_path = temp_audio.name

            try:
                # Transcribe using Groq Whisper
                with open(temp_path, 'rb') as audio_file:
                    transcription = self.client.audio.transcriptions.create(
                        file=audio_file,
                        model="whisper-large-v3",
                        language="en"
                    )

                return transcription.text
            finally:
                # Clean up temp file
                os.unlink(temp_path)

        except Exception as e:
            print(f"STT Error: {e}")
            return ""