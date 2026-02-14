/**
 * PCM Audio Format Conversion Utilities
 * Handles conversion between Float32 and Int16 audio formats
 */

/**
 * Convert Float32Array audio samples to Int16Array PCM format
 * Used for sending audio to Deepgram (requires Int16 PCM)
 *
 * @param input Float32Array with samples in range [-1.0, 1.0]
 * @returns Int16Array with samples in range [-32768, 32767]
 */
export function float32ToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);

  for (let i = 0; i < input.length; i++) {
    // Clamp value to [-1.0, 1.0] range
    const clamped = Math.max(-1, Math.min(1, input[i]));

    // Scale to Int16 range [-32768, 32767]
    // Use 32767 instead of 32768 to avoid overflow
    output[i] = clamped < 0 ? clamped * 32768 : clamped * 32767;
  }

  return output;
}

/**
 * Convert Int16Array PCM samples to Float32Array
 * Used for playing back TTS audio from backend
 *
 * @param input Int16Array with samples in range [-32768, 32767]
 * @returns Float32Array with samples in range [-1.0, 1.0]
 */
export function int16ToFloat32(input: Int16Array): Float32Array {
  const output = new Float32Array(input.length);

  for (let i = 0; i < input.length; i++) {
    // Scale from Int16 range to Float32 range
    output[i] = input[i] / (input[i] < 0 ? 32768 : 32767);
  }

  return output;
}

/**
 * Convert ArrayBuffer containing Int16 PCM data to Float32Array
 * Convenience function for handling binary WebSocket messages
 *
 * @param buffer ArrayBuffer from WebSocket binary message
 * @returns Float32Array ready for Web Audio API
 */
export function arrayBufferToFloat32(buffer: ArrayBuffer): Float32Array {
  const int16Array = new Int16Array(buffer);
  return int16ToFloat32(int16Array);
}
