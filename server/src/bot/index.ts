import { Telegraf } from 'telegraf';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { Express } from 'express';

export function createBot(): Telegraf {
  const bot = new Telegraf(config.BOT_TOKEN);

  bot.start((ctx) => {
    const webAppUrl = `${config.WEBAPP_URL}/?v=${Date.now()}`;

    ctx.reply(
      '💘 Добро пожаловать в «Спросил, увидел, полюбил»!\n\n' +
      'Задай вопрос, получи ответы, выбери лучшего — и, может, это будет взаимно!\n\n' +
      'Нажми кнопку ниже, чтобы начать игру:',
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🎮 Играть',
                web_app: { url: webAppUrl },
              },
            ],
          ],
        },
      },
    );
  });

  bot.help((ctx) => {
    ctx.reply(
      '📖 Как это работает:\n\n' +
      '1. Задай интересный вопрос\n' +
      '2. Попади в игровую комнату с 6 участниками\n' +
      '3. Отвечай на вопросы противоположного пола\n' +
      '4. Выбирай лучший ответ\n' +
      '5. Если выбор взаимный — это матч! 💕\n\n' +
      'Нажми /start чтобы начать!',
    );
  });

  bot.catch((err: any) => {
    logger.error('Bot error', { error: err.message });
  });

  return bot;
}

export async function setupBotWebhook(bot: Telegraf, app: Express) {
  const webhookPath = `/bot${config.BOT_TOKEN}`;
  const webhookUrl = `${config.WEBAPP_URL}${webhookPath}`;

  // Set webhook handler as Express route
  app.use(webhookPath, (req, res) => bot.handleUpdate(req.body, res));

  // Tell Telegram to use webhook
  await bot.telegram.setWebhook(webhookUrl, { drop_pending_updates: true });

  logger.info('Telegram bot webhook set', { url: webhookUrl });
}
