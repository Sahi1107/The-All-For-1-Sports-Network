import winston from 'winston';
import fs from 'fs';
import path from 'path';

const isProd = process.env.NODE_ENV === 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug');

// ─── Log directory (production only) ─────────────────────────

const LOG_DIR = path.resolve('logs');
if (isProd) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ─── Formats ──────────────────────────────────────────────────

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

/** Human-readable output for local development */
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? ' ' + JSON.stringify(meta, null, 0)
      : '';
    return `${ts} [${level}] ${message}${metaStr}${stack ? '\n' + stack : ''}`;
  }),
);

/** Structured JSON for production log aggregators (CloudWatch, Datadog, etc.) */
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json(),
);

// ─── Transports ───────────────────────────────────────────────

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: isProd ? prodFormat : devFormat,
  }),
];

if (isProd) {
  /** Error-only log — small, easy to grep for incidents */
  transports.push(
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 10,
      tailable: true,
    }),
  );

  /** Full combined log */
  transports.push(
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      maxsize: 50 * 1024 * 1024, // 50 MB
      maxFiles: 10,
      tailable: true,
    }),
  );

  /** Auth-specific log — easy audit trail */
  transports.push(
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'auth.log'),
      maxsize: 20 * 1024 * 1024, // 20 MB
      maxFiles: 10,
      tailable: true,
    }),
  );
}

// ─── Logger ───────────────────────────────────────────────────

const logger = winston.createLogger({
  level: LOG_LEVEL,
  levels: winston.config.npm.levels,
  transports,
  exitOnError: false,
});

export default logger;
