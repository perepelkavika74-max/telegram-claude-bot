require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const cheerio = require('cheerio');

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
• Аналіз соцмереж — оцінка контенту, позиціонування, рекомендації

Стиль відповідей: конкретно, по суті, з цифрами та чіткими кроками. Уникай загальних слів — давай практичні рекомендації.`;

const history = {};

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

async function fetchPageContent(url) {
  const { data } = await axios.get(url, {
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'uk-UA,uk;q=0.9,ru;q=0.8,en;q=0.7',
    },
    maxRedirects: 5,
  });

  const $ = cheerio.load(data);
  $('script, style, nav, footer, iframe, noscript').remove();

  const title = $('title').text().trim();
  const description = $('meta[name="description"]').attr('content') || '';
  const ogDescription = $('meta[property="og:description"]').attr('content') || '';
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 3000);

  return `Заголовок: ${title}\nОпис: ${description || ogDescription}\nКонтент:\n${bodyText}`;
}

function detectPlatform(url) {
  if (url.includes('instagram.com')) return 'Instagram';
  if (url.includes('facebook.com') || url.includes('fb.com')) return 'Facebook';
  if (url.includes('tiktok.com')) return 'TikTok';
  if (url.includes('linkedin.com')) return 'LinkedIn';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'Twitter/X';
  if (url.includes('youtube.com')) return 'YouTube';
  return null;
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    '👋 Вітаю! Я ваш AI бізнес-асистент.\n\n' +
    'Можу допомогти з:\n' +
    '• Стратегією та розвитком бізнесу\n' +
    '• Маркетингом і залученням клієнтів\n' +
    '• Фінансовим плануванням\n' +
    '• Продажами і переговорами\n' +
    '• Діловою комунікацією\n' +
    '• 📊 Аналізом соцмереж — надішліть посилання!\n\n' +
    'Просто напишіть питання або надішліть посилання на сторінку в соцмережах.\n\n' +
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

  await bot.sendChatAction(chatId, 'typing');

  const urls = text.match(URL_REGEX);
  let userMessage = text;

  if (urls && urls.length > 0) {
    const url = urls[0];
    const platform = detectPlatform(url);
    const platformLabel = platform ? `сторінку ${platform}` : 'сторінку';

    await bot.sendMessage(chatId, `🔍 Завантажую ${platformLabel}...`);

    try {
      const pageContent = await fetchPageContent(url);
      userMessage = `Проаналізуй цю ${platformLabel} з точки зору бізнесу та маркетингу. Що добре, що покращити, які конкретні рекомендації?\n\nURL: ${url}\n\n${pageContent}`;
    } catch (err) {
      const isPrivate = err.response?.status === 403 || err.response?.status === 401;
      if (platform === 'Instagram' || isPrivate) {
        await bot.sendMessage(chatId,
          `⚠️ ${platform || 'Ця сторінка'} закрита для автоматичного завантаження.\n\n` +
          `Скопіюйте та вставте сюди:\n` +
          `• Текст з шапки профілю (bio)\n` +
          `• Кілька підписів до постів\n` +
          `• Які теми висвітлюєте\n\n` +
          `Тоді я зроблю повний аналіз! 🎯`
        );
        return;
      }
      await bot.sendMessage(chatId, `⚠️ Не вдалося завантажити сторінку. Спробуйте вставити текст вручну.`);
      return;
    }
  }

  history[chatId].push({ role: 'user', content: userMessage });
  if (history[chatId].length > 20) history[chatId] = history[chatId].slice(-20);

  try {
    await bot.sendChatAction(chatId, 'typing');
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
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
