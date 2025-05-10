import winston, { Logform } from 'winston'; // Import Logform
import { config } from './config.js';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

// Determine log level based on environment
const level = () => {
  // return config.logLevel || (config.nodeEnv === 'production' ? 'warn' : 'debug');
  return config.nodeEnv === 'production' ? 'warn' : 'debug'; // Simplified level setting
};

// Define colors for log levels
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};
winston.addColors(colors);

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  // Colorize only if not in production or if TTY is available
  (config.nodeEnv !== 'production' || process.stdout.isTTY) ? winston.format.colorize({ all: true }) : winston.format.uncolorize(),
  winston.format.printf(
    // Add type annotation for info
    (info: Logform.TransformableInfo) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Define transports (console, file, etc.)
const transports = [
  new winston.transports.Console(),
  // Example: Add file transport for production logs
  // new winston.transports.File({
  //   filename: 'logs/error.log',
  //   level: 'error',
  // }),
  // new winston.transports.File({ filename: 'logs/all.log' }),
];

// Create the logger instance
export const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
  exitOnError: false, // Do not exit on handled exceptions
});

// Example usage:
// logger.error('This is an error log');
// logger.warn('This is a warning log');
// logger.info('This is an info log');
// logger.http('This is an HTTP log');
// logger.debug('This is a debug log');
