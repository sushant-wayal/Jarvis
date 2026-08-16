import { aiClient, DEFAULT_MODEL } from '@/lib/ai/gemini';
import { logger } from '@/lib/logging/logger';

export interface TranscriptionResult {
  transcript: string;
}

export interface SpeechToTextProvider {
  transcribe(audioBuffer: Buffer, mimeType?: string): Promise<TranscriptionResult>;
}

export class GeminiSpeechToTextProvider implements SpeechToTextProvider {
  async transcribe(audioBuffer: Buffer, mimeType = 'audio/mp3'): Promise<TranscriptionResult> {
    try {
      const base64Data = audioBuffer.toString('base64');
      const response = await aiClient.models.generateContent({
        model: DEFAULT_MODEL,
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
                text: 'Transcribe the audio accurately. Output strictly the exact spoken text and nothing else.',
              },
            ],
          },
        ],
      });

      const transcript = response.text?.trim() || '';
      logger.info('Voice STT Transcription completed', { length: transcript.length });
      return { transcript };
    } catch (err) {
      logger.error('STT Provider transcription error', err);
      return { transcript: '' };
    }
  }
}

export const sttProvider: SpeechToTextProvider = new GeminiSpeechToTextProvider();
