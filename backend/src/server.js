const app = require('./app');
const env = require('./config/env');
const { connectDb } = require('./config/db');
const logger = require('./utils/logger');

async function start() {
  await connectDb();
  app.listen(env.port, () => {
    logger.info('Secure backend started', { port: env.port });
  });
}

start().catch((error) => {
  logger.error('Failed to start server', {
    error: process.env.NODE_ENV === 'production' ? 'startup_failure' : error.message
  });
  process.exit(1);
});
