
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

class Config:
    # API Keys
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY")

    # Server settings
    HOST = "0.0.0.0"
    PORT = 7860

    # Model settings
    GROQ_MODEL = "openai/gpt-oss-120b"

    # TTS settings
    TTS_VOICE = "alba"  # Pocket TTS voice (will be replaced with custom voice later)

    # Deepgram STT settings
    DEEPGRAM_MODEL = "nova-2"  # Latest, most accurate model
    DEEPGRAM_LANGUAGE = "en"
    DEEPGRAM_SAMPLE_RATE = 16000
    DEEPGRAM_ENCODING = "linear16"
    DEEPGRAM_CHANNELS = 1

    # VAD settings
    SILENCE_THRESHOLD = 2.3  # seconds of silence to consider speech ended

    # Interruption settings
    INTERRUPTION_ENABLED = True
    INTERRUPT_VOLUME_THRESHOLD = 0.2  # RMS threshold for speech detection
    INTERRUPT_SUSTAINED_FRAMES = 5  # Frames before trigger (~250ms)

    # Paths
    BASE_DIR = Path(__file__).parent.parent
    SYSTEM_PROMPT_PATH = BASE_DIR / "config" / "system_prompt.txt"

    @classmethod
    def load_system_prompt(cls) -> str:
        try:
            with open(cls.SYSTEM_PROMPT_PATH, 'r', encoding='utf-8') as f:
                return f.read()
        except FileNotFoundError:
            return "You are a helpful assistant."

    @classmethod
    def validate(cls):
        if not cls.GROQ_API_KEY:
            raise ValueError("GROQ_API_KEY not found")
        if not cls.DEEPGRAM_API_KEY:
            raise ValueError("DEEPGRAM_API_KEY not found")

config = Config()