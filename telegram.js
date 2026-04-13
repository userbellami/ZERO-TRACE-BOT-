const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const wa = require('./whatsapp');
const { formatUptime } = require('./handler');
const fs = require('fs');
let bot = null;
const startTime = Date.now();
const initTelegram = async (restartCallback) => {
    if (!config.TG_TOKEN) return console.error('Missing TG_TOKEN');
    bot = new TelegramBot(config.TG_TOKEN, { polling: true });
    const auth = (msg) => !config.TG_ADMIN_ID || msg.from.id.toString() === config.TG_ADMIN_ID.toString();
    bot.onText(/\/start/, (msg) => { if (auth(msg)) bot.sendMessage(msg.chat.id, `🤖 ${config.BOT_NAME}\n/pair <num>\n/uptime\n/owner`); });
    bot.onText(/\/pair\s+(.+)/, async (msg, match) => {
        if (!auth(msg)) return;
        const phone = match[1].replace(/[^0-9]/g, '');
        if (!phone || phone.length < 10) return bot.sendMessage(msg.chat.id, 'Invalid number. Example: /pair 254712345678');
        bot.sendMessage(msg.chat.id, `📱 Generating code for ${phone}...`);
        try {
            await restartCallback(phone, (code, num, err) => {
                if (err) bot.sendMessage(msg.chat.id, `❌ ${err}`);
                else if (code) bot.sendMessage(msg.chat.id, `✅ Pairing code: ${code}\nEnter in WhatsApp on ${num}`);
            });
        } catch (e) { bot.sendMessage(msg.chat.id, `❌ ${e.message}`); }
    });
    bot.onText(/\/uptime/, (msg) => {
        if (!auth(msg)) return;
        const total = formatUptime(Math.floor((Date.now() - startTime) / 1000));
        const waUp = wa.isWAConnected() ? `\nWA Uptime: ${formatUptime(wa.getWAUptime())}` : '\nWA: Disconnected';
        bot.sendMessage(msg.chat.id, `⏱️ Bot: ${total}${waUp}`);
    });
    bot.onText(/\/owner/, (msg) => { if (auth(msg)) bot.sendMessage(msg.chat.id, `👑 Owner: ${config.OWNER_NUMBER}`); });
    if (config.TG_ADMIN_ID && fs.existsSync(config.STARTUP_IMAGE))
        setTimeout(() => bot.sendPhoto(config.TG_ADMIN_ID, config.STARTUP_IMAGE, { caption: `🚀 ${config.BOT_NAME} started` }).catch(e=>{}), 2000);
    return bot;
};
module.exports = { initTelegram };
