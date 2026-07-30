export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelOrder: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export function createLogger(minLevel: LogLevel = 'info'): Logger {
  const log = (level: LogLevel, msg: string, meta?: Record<string, unknown>) => {
    if (levelOrder[level] < levelOrder[minLevel]) return;
    const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${msg}`;
    const out = level === 'error' || level === 'warn' ? console.error : console.log;
    out(meta ? `${line} ${JSON.stringify(meta)}` : line);
  };

  return {
    debug: (msg, meta) => log('debug', msg, meta),
    info: (msg, meta) => log('info', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
  };
}
