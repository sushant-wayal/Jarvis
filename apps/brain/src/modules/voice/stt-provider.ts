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
  'silent',
  'background noise',
  'noise',
  'music',
  'applause',
  'laughter',
  'whispering',
  'coughing',
  'inaudible',
  'no speech',
  'empty',
  'none',
  'thank you',
  'thank you for watching',
  'thanks for watching',
  'subtitles by',
  'amara org',
  'i have completed your request',
  'i completed your request',
  'i have completed your task',
  'i completed your task',
  'i have completed the task',
  'i completed the task',
  'completed the task',
  'completed your task',
  'task completed',
  'task complete',
  'okay',
  'you are welcome',
  'youre welcome',
];

export function sanitizeTranscript(raw: string): string {
  const clean = raw.trim();
  if (!clean) return '';
  const lower = clean.toLowerCase().replace(/[.,!?;:"'()\[\]]/g, '').trim();

  if (
    lower === 'silence' ||
    lower === 'silent' ||
    lower === 'no speech' ||
    lower === 'empty' ||
    SILENCE_TOKENS.some((t) => lower === t || lower.startsWith(t + ' ') || lower.endsWith(' ' + t))
  ) {
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
                  text: 'You are an audio transcription engine. Transcribe human speech in this audio word-for-word.\n\nCRITICAL RULES:\n1. If the audio contains NO human speech (only silence, background room noise, hiss, breath, static, or echo), you MUST respond with EXACTLY: SILENCE\n2. Do NOT guess, imagine, or hallucinate speech. Never output generic phrases like "I completed the task" or "Thank you" unless audibly spoken by a human.\n3. Output ONLY the verbatim spoken text, or SILENCE.',
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
