export interface LogContext {
  requestId?: string;
  userId?: string;
  conversationId?: string;
  durationMs?: number;
  [key: string]: unknown;
}

export const logger = {
  info: (message: string, context?: LogContext) => {
    console.log(
      JSON.stringify({
        level: 'INFO',
        timestamp: new Date().toISOString(),
        message,
        ...context,
      })
    );
  },
  warn: (message: string, context?: LogContext) => {
    console.warn(
      JSON.stringify({
        level: 'WARN',
        timestamp: new Date().toISOString(),
        message,
        ...context,
      })
    );
  },
  error: (message: string, error?: unknown, context?: LogContext) => {
    console.error(
      JSON.stringify({
        level: 'ERROR',
        timestamp: new Date().toISOString(),
        message,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        ...context,
      })
    );
  },
};
