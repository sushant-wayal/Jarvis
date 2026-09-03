import { logger } from '@/lib/logging/logger';

export interface AudioResult {
  audioBase64: string;
  mimeType: string;
}

export interface TextToSpeechProvider {
  synthesize(text: string): Promise<AudioResult>;
}

export class DefaultTextToSpeechProvider implements TextToSpeechProvider {
  private maxChunkLength = 100;

  /**
   * Cleans text of markdown and non-verbal symbols for TTS synthesis
   */
  private cleanTextForSpeech(raw: string): string {
    return raw
      .replace(/```[\s\S]*?```/g, '') // remove code blocks
      .replace(/`([^`]+)`/g, '$1') // remove inline code backticks
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // clean markdown links
      .replace(/[*_~#]/g, '') // strip markdown asterisks, hashes, underscores
      .replace(/^[-•*]\s+/gm, '') // strip list bullets
      .replace(/\s+/g, ' ') // collapse whitespace
      .trim();
  }

  /**
   * Splits long text into natural spoken phrase chunks (under ~100 chars)
   */
  private splitIntoChunks(text: string): string[] {
    if (text.length <= this.maxChunkLength) {
      return [text];
    }

    const chunks: string[] = [];
    // Split on sentence boundaries first (. ! ?)
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;

      if (trimmed.length <= this.maxChunkLength) {
        chunks.push(trimmed);
      } else {
        // Split on comma / semicolon / dash clauses
        const clauses = trimmed.split(/(?<=[,;:\-])\s+/);
        let currentChunk = '';

        for (const clause of clauses) {
          if ((currentChunk + ' ' + clause).trim().length <= this.maxChunkLength) {
            currentChunk = (currentChunk + ' ' + clause).trim();
          } else {
            if (currentChunk) chunks.push(currentChunk);
            if (clause.length <= this.maxChunkLength) {
              currentChunk = clause;
            } else {
              // Word boundary split fallback
              const words = clause.split(' ');
              let wordChunk = '';
              for (const word of words) {
                if ((wordChunk + ' ' + word).trim().length <= this.maxChunkLength) {
                  wordChunk = (wordChunk + ' ' + word).trim();
                } else {
                  if (wordChunk) chunks.push(wordChunk);
                  wordChunk = word;
                }
              }
              if (wordChunk) currentChunk = wordChunk;
            }
          }
        }
        if (currentChunk) chunks.push(currentChunk);
      }
    }

    return chunks.filter((c) => c.trim().length > 0);
  }

  /**
   * Fetches single chunk MP3 audio buffer
   */
  private async fetchChunkAudio(chunk: string): Promise<Buffer | null> {
    try {
      const encoded = encodeURIComponent(chunk);
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=en&client=tw-ob`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://translate.google.com/',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
      return null;
    } catch {
      return null;
    }
  }

  async synthesize(text: string): Promise<AudioResult> {
    const cleaned = this.cleanTextForSpeech(text);
    if (!cleaned) {
      return { audioBase64: '', mimeType: 'audio/mp3' };
    }

    try {
      const chunks = this.splitIntoChunks(cleaned);
      const audioBuffers: Buffer[] = [];

      // Fetch chunks sequentially or small concurrent batches to preserve order
      for (const chunk of chunks) {
        const buffer = await this.fetchChunkAudio(chunk);
        if (buffer && buffer.length > 0) {
          audioBuffers.push(buffer);
        }
      }

      if (audioBuffers.length > 0) {
        // Concatenate MP3 frames seamlessly into a single valid MP3 stream
        const combinedBuffer = Buffer.concat(audioBuffers);
        return {
          audioBase64: combinedBuffer.toString('base64'),
          mimeType: 'audio/mp3',
        };
      }
    } catch (e) {
      logger.warn('External TTS fetch warning, generating audio payload fallback', {
        error: String(e),
      });
    }

    return {
      audioBase64: '',
      mimeType: 'audio/mp3',
    };
  }
}

export const ttsProvider: TextToSpeechProvider = new DefaultTextToSpeechProvider();
