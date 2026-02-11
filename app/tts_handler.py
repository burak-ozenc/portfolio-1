from pocket_tts import TTSModel
import numpy as np
from app.config import config

class TTSHandler:
    def __init__(self):
        print("Loading Pocket TTS model...")
        self.tts_model = TTSModel.load_model()

        # Load voice state
        self.voice_state = self.tts_model.get_state_for_audio_prompt(
            config.TTS_VOICE
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

    def get_sample_rate(self) -> int:
        """Get the sample rate of the TTS model"""
        return self.tts_model.sample_rate