import http from 'node:http';

import app from '@/app';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { verifyMailer } from '@config/mailer';
import { connectMongo, disconnectMongo } from '@config/mongoose';
import { initSocketServer } from '@config/socket';

let httpServer: http.Server | null = null;

const startServer = async () => {
  await connectMongo();
  await verifyMailer();

  httpServer = http.createServer(app);
  initSocketServer(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info(`Server listening on http://localhost:${env.PORT}`);
  });
};

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  httpServer?.close();
  await disconnectMongo();

  process.exit(0);
};

void startServer().catch((error) => {
  logger.error(`Bootstrap failed: ${(error as Error).message}`);
  process.exit(1);
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
