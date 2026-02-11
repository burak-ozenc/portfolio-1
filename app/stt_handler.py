import torch
import torchaudio
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor
from app.config import config
import io
import numpy as np

class STTHandler:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model_id = "kyutai/stt-2.6b-en-trfs"

        print(f"Loading STT model on {self.device}...")
        self.processor = AutoProcessor.from_pretrained(
            self.model_id,
            token=config.HF_TOKEN
        )
        self.model = AutoModelForSpeechSeq2Seq.from_pretrained(
            self.model_id,
            torch_dtype=torch.float32,
            token=config.HF_TOKEN
        ).to(self.device)
        print("STT model loaded successfully")

    async def transcribe(self, audio_bytes: bytes) -> str:
        """Transcribe audio bytes to text"""
        try:
            # Convert bytes to tensor
            audio_array = np.frombuffer(audio_bytes, dtype=np.int16)
            audio_float = audio_array.astype(np.float32) / 32768.0

            # Convert to tensor
            waveform = torch.from_numpy(audio_float).unsqueeze(0)

            # Resample to 16kHz if needed
            sample_rate = 16000  # Assuming 16kHz input

            # Process audio
            inputs = self.processor(
                waveform.squeeze().numpy(),
                sampling_rate=sample_rate,
                return_tensors="pt"
            ).to(self.device)

            # Generate transcription
            with torch.no_grad():
                generated_ids = self.model.generate(**inputs)

            # Decode
            transcription = self.processor.batch_decode(
                generated_ids,
                skip_special_tokens=True
            )[0]

            return transcription

        except Exception as e:
            print(f"STT Error: {e}")
            return ""