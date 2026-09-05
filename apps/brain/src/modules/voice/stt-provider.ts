import { aiClient, DEFAULT_MODEL, FAST_FALLBACK_MODELS } from '@/lib/ai/gemini';
import { logger } from '@/lib/logging/logger';

export interface TranscriptionResult {
  transcript: string;
}

export interface SpeechToTextProvider {
  transcribe(audioBuffer: Buffer, mimeType?: string): Promise<TranscriptionResult>;
}

const SILENCE_TOKENS = [
  'silence',
  'background noise',
  'noise',
  'music',
  'applause',
  'laughter',
  'whispering',
  'coughing',
  'inaudible',
  'no speech',
  'thank you',
  'thank you.',
  'thank you for watching',
  'thank you for watching.',
  'thanks for watching',
  'subtitles by',
  'amara org',
  'i have completed your request',
  'i have completed your request.',
  'i completed your request',
  'i completed your request.',
  'i have completed your task',
  'i completed your task',
];

export function sanitizeTranscript(raw: string): string {
  const clean = raw.trim();
  if (!clean) return '';
  const lower = clean.toLowerCase().replace(/[.,!?;:"'()\[\]]/g, '').trim();

  if (SILENCE_TOKENS.some((t) => lower === t || lower.startsWith(t + ' ') || lower.endsWith(' ' + t))) {
    return '';
  }

  return clean;
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
                  text: 'Transcribe the spoken audio into text. If the audio is silent, contains only background noise, or has no human speech, respond with an empty string. Output only the transcription without explanation.',
                },
              ],
            },
          ],
        });

        const rawTranscript = response.text?.trim() || '';
        const transcript = sanitizeTranscript(rawTranscript);
        logger.info('Voice STT Transcription completed', { model, rawLength: rawTranscript.length, cleanLength: transcript.length });
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
