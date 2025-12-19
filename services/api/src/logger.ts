import pino from 'pino';

// Create a simple pino logger instance. Fastify will use its own
// logger when the `logger: true` option is passed, but having a
// separate logger can be useful in services and background jobs.
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export default logger;