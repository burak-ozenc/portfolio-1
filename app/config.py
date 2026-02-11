import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    # API Keys
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    HF_TOKEN = os.getenv("HF_TOKEN")

    # Server settings
    HOST = "0.0.0.0"
    PORT = 7860

    # Model settings
    GROQ_MODEL = "llama-3.1-70b-versatile"  # or "mixtral-8x7b-32768"
    TTS_VOICE = "hf://kyutai/tts-voices/m-ailabs_louise/casual.wav"

    # Paths
    BASE_DIR = Path(__file__).parent.parent
    SYSTEM_PROMPT_PATH = BASE_DIR / "config" / "system_prompt.txt"

    @classmethod
    def load_system_prompt(cls) -> str:
        """Load system prompt from file"""
        try:
            with open(cls.SYSTEM_PROMPT_PATH, 'r', encoding='utf-8') as f:
                return f.read()
        except FileNotFoundError:
            return "You are a helpful assistant."

    @classmethod
    def validate(cls):
        """Validate required configuration"""
        if not cls.GROQ_API_KEY:
            raise ValueError("GROQ_API_KEY not found in environment")
        if not cls.HF_TOKEN:
            raise ValueError("HF_TOKEN not found in environment")

# Create config instance
config = Config()