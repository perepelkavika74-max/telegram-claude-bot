require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Anthropic = require('@anthropic-ai/sdk');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

let systemPrompt = `Ти — AI бізнес-асистент для підприємців. Завжди відповідай українською мовою, навіть якщо питання задане іншою мовою.

Твої сильні сторони:
• Стратегічне мислення — аналіз бізнес-ідей, оцінка ризиків
• Управління — пріоритети, делегування, процеси
• Маркетинг — стратегії просування, залучення клієнтів
• Комунікація — ділові листи, презентації, переговори
• Фінанси — unit-економіка, ROI, грошові потоки
• Продажі — скрипти, воронки, робота із запереченнями

Стиль відповідей: конкретно, по суті, з цифрами та чіткими кроками. Уникай загальних слів — давай практичні рекомендації.`;

const history = {};

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    '👋 Вітаю! Я ваш AI бізнес-асистент.\n\n' +
    'Можу допомогти з:\n' +
    '• Стратегією та розвитком бізнесу\n' +
    '• Маркетингом і залученням клієнтів\n' +
    '• Фінансовим плануванням\n' +
    '• Продажами і переговорами\n' +
    '• Діловою комунікацією\n\n' +
    'Просто напишіть ваше питання або опишіть ситуацію.\n\n' +
    'Команди:\n' +
    '/reset — очистити історію розмови\n' +
    '/system [текст] — змінити інструкції асистента'
  );
});

bot.onText(/\/reset/, (msg) => {
  history[msg.chat.id] = [];
  bot.sendMessage(msg.chat.id, '✅ Історію очищено');
});

bot.onText(/\/system (.+)/, (msg, match) => {
  systemPrompt = match[1];
  bot.sendMessage(msg.chat.id, '✅ System prompt оновлено');
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith('/')) return;

  if (!history[chatId]) history[chatId] = [];
  history[chatId].push({ role: 'user', content: text });
  if (history[chatId].length > 20) history[chatId] = history[chatId].slice(-20);

  try {
    await bot.sendChatAction(chatId, 'typing');
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: history[chatId],
    });
    const reply = response.content[0].text;
    history[chatId].push({ role: 'assistant', content: reply });
    bot.sendMessage(chatId, reply);
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, '❌ Помилка. Спробуйте ще раз.');
  }
});

console.log('🤖 Bot started');
