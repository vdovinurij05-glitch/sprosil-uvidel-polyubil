import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import { Server } from 'socket.io';
import { config } from './config';
import { logger } from './utils/logger';
import { prisma } from './utils/db';
import { apiLimiter } from './middleware/rateLimit';
import { setupSocketHandlers } from './socket/handler';
import { createBot } from './bot';
import userRoutes from './routes/user';
import sessionRoutes from './routes/session';
import reportRoutes from './routes/report';
import devRoutes from './routes/dev';

async function main() {
  // Express
  const app = express();
  const server = http.createServer(app);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(apiLimiter);

  // BigInt JSON serialization
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api/user', userRoutes);
  app.use('/api/session', sessionRoutes);
  app.use('/api/report', reportRoutes);
  app.use('/api/dev', devRoutes);

  // Socket.IO
  const io = new Server(server, {
    cors: {
      origin: config.WEBAPP_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  setupSocketHandlers(io);

  // Telegram Bot
  const bot = createBot();
  logger.info('Starting Telegram bot...');
  bot.launch({ dropPendingUpdates: true }).then(() => {
    logger.info('Telegram bot started successfully');
  }).catch((err) => {
    logger.error('Telegram bot FAILED', { error: String(err) });
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    bot.stop('SIGTERM');
    io.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Connect to DB and start server
  await prisma.$connect();
  logger.info('Database connected');

  server.listen(config.PORT, () => {
    logger.info(`Server running on port ${config.PORT}`);
    logger.info(`WebApp URL: ${config.WEBAPP_URL}`);
  });
}

main().catch((error) => {
  logger.error('Failed to start server', { error });
  process.exit(1);
});
