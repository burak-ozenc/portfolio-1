from pocket_tts import TTSModel
import numpy as np
from pathlib import Path
from app.config import config

class TTSHandler:
    def __init__(self):
        print("Loading Pocket TTS model...")
        self.tts_model = TTSModel.load_model()

        # Load voice state
        # script_dir = Path(__file__).parent
        # voice_abs = (script_dir / config.TTS_VOICE).absolute()
        voice_path = download_voice_file(config.TTS_VOICE)

        self.voice_state = self.tts_model.get_state_for_audio_prompt(
            voice_path,
        )
        print("TTS model loaded successfully")

        

    async def synthesize(self, text: str) -> bytes:
        """Synthesize text to speech audio"""
        try:
            # Generate audio
            audio_tensor = self.tts_model.generate_audio(
                self.voice_state,
                text
            )

            # Convert to bytes (16-bit PCM)
            audio_np = audio_tensor.numpy()
            audio_int16 = (audio_np * 32767).astype(np.int16)

            return audio_int16.tobytes()

        except Exception as e:
            print(f"TTS Error: {e}")
            return b""
    async def synthesize_stream(self, text: str) -> [bytes]:
        """Synthesize text to speech audio stream"""
        try:
            # Generate audio stream
            for chunk in self.tts_model.generate_audio_stream(self.voice_state, text):
                audio_np = np.clip(chunk.numpy(), -1.0, 1.0) 
                audio_int16 = (audio_np * 32767).astype(np.int16)
                yield audio_int16.tobytes()
            
        except Exception as e:
            print(f"TTS Error: {e}")
            return

    def get_sample_rate(self) -> int:
        """Get the sample rate of the TTS model"""
        return self.tts_model.sample_rate


def download_voice_file(dataset_url):
    import requests
    import tempfile

    """Download voice file from HF dataset to temp storage"""
    response = requests.get(dataset_url)
    response.raise_for_status()

    # Create temp file with .wav extension
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
    temp_file.write(response.content)
    temp_file.close()

    return temp_file.name