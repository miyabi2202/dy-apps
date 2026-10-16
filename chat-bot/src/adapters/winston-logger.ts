import { join } from 'node:path';
import winston from 'winston';

/**
 * Logs to the console (info and up) and to `<dir>/chat-bot.log` (everything, as JSON lines),
 * keeping up to five 10 MB files.
 */
export function createLogger(dir: string, level = 'debug'): winston.Logger {
  return winston.createLogger({
    level,
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
      new winston.transports.File({
        filename: join(dir, 'chat-bot.log'),
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5,
        tailable: true,
      }),
      new winston.transports.Console({
        level: 'info',
        format: winston.format.combine(
          winston.format.timestamp({ format: 'HH:mm:ss' }),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${String(timestamp)} ${level} ${String(message)}${extra}`;
          }),
        ),
      }),
    ],
  });
}
