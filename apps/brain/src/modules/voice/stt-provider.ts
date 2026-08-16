import { aiClient, DEFAULT_MODEL, FAST_FALLBACK_MODELS } from '@/lib/ai/gemini';
import { logger } from '@/lib/logging/logger';

export interface TranscriptionResult {
  transcript: string;
}

export interface SpeechToTextProvider {
  transcribe(audioBuffer: Buffer, mimeType?: string): Promise<TranscriptionResult>;
}

export class GeminiSpeechToTextProvider implements SpeechToTextProvider {
  private fallbackModels = [DEFAULT_MODEL, ...FAST_FALLBACK_MODELS];

  async transcribe(audioBuffer: Buffer, mimeType = 'audio/mp3'): Promise<TranscriptionResult> {
    const base64Data = audioBuffer.toString('base64');
    const uniqueModels = Array.from(new Set(this.fallbackModels));

    for (const model of uniqueModels) {
      try {
        const response = await aiClient.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: base64Data,
                  },
                },
                {
                  text: 'Transcribe the spoken audio into text. Output only the transcription without explanation.',
                },
              ],
            },
          ],
        });

        const transcript = response.text?.trim() || '';
        logger.info('Voice STT Transcription completed', { model, length: transcript.length });
        return { transcript };
      } catch (err) {
        logger.warn(`STT Provider attempt with model ${model} failed, trying fallback`, {
          model,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.error('All STT Provider models failed to transcribe audio');
    return { transcript: '' };
  }
}

export const sttProvider: SpeechToTextProvider = new GeminiSpeechToTextProvider();
