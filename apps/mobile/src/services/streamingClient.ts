import { IntermediateStatusUpdate, VoiceResponse } from '@jarvis/shared';

export interface StreamEventHandlers {
  onStart?: (data: { requestId: string; conversationId?: string }) => void;
  onTranscript?: (transcript: string) => void;
  onStatus?: (status: IntermediateStatusUpdate) => void;
  onTextDelta?: (text: string) => void;
  onFinalResponse?: (response: VoiceResponse) => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
}

export interface StreamRequestOptions {
  url: string;
  body: Record<string, unknown>;
  handlers: StreamEventHandlers;
  timeoutMs?: number;
}

export interface ActiveStream {
  abort: () => void;
}

/**
 * Universal SSE Streaming Client for React Native using XMLHttpRequest.
 * Works consistently across Android, iOS, and Web without extra native dependencies.
 */
export function startSseStream(options: StreamRequestOptions): ActiveStream {
  const { url, body, handlers, timeoutMs = 90000 } = options;
  const xhr = new XMLHttpRequest();
  let seenIndex = 0;
  let buffer = '';
  let aborted = false;

  let timeoutTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    if (!aborted) {
      xhr.abort();
      handlers.onError?.(new Error('Streaming connection timed out'));
    }
  }, timeoutMs);

  const clearTimer = () => {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
  };

  const processBuffer = () => {
    // Process double-newline separated SSE messages
    let boundaryIndex: number;
    while ((boundaryIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawBlock = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);

      const lines = rawBlock.split('\n');
      let currentEvent = 'message';
      let currentData = '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          currentData = line.slice(5).trim();
        }
      }

      if (currentData) {
        try {
          const parsed = JSON.parse(currentData);
          dispatchSseEvent(currentEvent, parsed, handlers);
        } catch {
          // If not JSON, pass as raw string
          dispatchSseEvent(currentEvent, currentData, handlers);
        }
      }
    }
  };

  xhr.open('POST', url, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Accept', 'text/event-stream');

  xhr.onprogress = () => {
    if (aborted) return;
    const newText = xhr.responseText.slice(seenIndex);
    seenIndex = xhr.responseText.length;
    buffer += newText;
    processBuffer();
  };

  xhr.onload = () => {
    clearTimer();
    if (aborted) return;
    if (xhr.status >= 200 && xhr.status < 300) {
      // Process remaining buffer
      if (seenIndex < xhr.responseText.length) {
        buffer += xhr.responseText.slice(seenIndex);
        processBuffer();
      }
      handlers.onDone?.();
    } else {
      let errMsg = `Server returned HTTP ${xhr.status}`;
      try {
        const parsed = JSON.parse(xhr.responseText);
        if (parsed.error?.message || parsed.message) {
          errMsg = parsed.error?.message || parsed.message;
        }
      } catch {}
      handlers.onError?.(new Error(errMsg));
    }
  };

  xhr.onerror = () => {
    clearTimer();
    if (aborted) return;
    handlers.onError?.(new Error('Network transport failure connecting to Jarvis stream'));
  };

  xhr.onabort = () => {
    clearTimer();
  };

  try {
    xhr.send(JSON.stringify(body));
  } catch (err) {
    clearTimer();
    handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
  }

  return {
    abort: () => {
      aborted = true;
      clearTimer();
      try {
        xhr.abort();
      } catch {}
    },
  };
}

function dispatchSseEvent(event: string, data: any, handlers: StreamEventHandlers): void {
  switch (event.toUpperCase()) {
    case 'START':
      handlers.onStart?.(data);
      break;
    case 'TRANSCRIPT':
      handlers.onTranscript?.(typeof data === 'string' ? data : data?.transcript || '');
      break;
    case 'STATUS':
      handlers.onStatus?.(data as IntermediateStatusUpdate);
      break;
    case 'TEXT_DELTA':
      handlers.onTextDelta?.(typeof data === 'string' ? data : data?.text || '');
      break;
    case 'FINAL_RESPONSE':
    case 'COMPLETED':
      handlers.onFinalResponse?.(data as VoiceResponse);
      break;
    case 'DONE':
      handlers.onDone?.();
      break;
    case 'ERROR':
      handlers.onError?.(new Error(data?.message || 'Stream encountered an error'));
      break;
  }
}
