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
    
    // No admin restriction – anyone can use the bot
    bot.onText(/\/start/, async (msg) => {
        // Send startup image first
        if (fs.existsSync(config.STARTUP_IMAGE)) {
            await bot.sendPhoto(msg.chat.id, config.STARTUP_IMAGE, {
                caption: `🤖 *${config.BOT_NAME}*\n\n💧 Prefix: ${config.PREFIX}\n👑 Owner: LORD MONK\n\nCommands:\n/pair <num> - Connect WhatsApp\n/uptime - Bot uptime\n/owner - Show owner`
            });
        } else {
            await bot.sendMessage(msg.chat.id, `🤖 *${config.BOT_NAME}*\n\n💧 Prefix: ${config.PREFIX}\n👑 Owner: LORD MONK\n\nCommands:\n/pair <num>\n/uptime\n/owner`);
        }
    });
    
    bot.onText(/\/pair\s+(.+)/, async (msg, match) => {
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
        const total = formatUptime(Math.floor((Date.now() - startTime) / 1000));
        const waUp = wa.isWAConnected() ? `\nWA Uptime: ${formatUptime(wa.getWAUptime())}` : '\nWA: Disconnected';
        bot.sendMessage(msg.chat.id, `⏱️ Bot: ${total}${waUp}`);
    });
    
    bot.onText(/\/owner/, (msg) => {
        bot.sendMessage(msg.chat.id, `👑 *Owner*: LORD MONK\n🤖 *Bot*: ${config.BOT_NAME}`);
    });
    
    // Send startup image to the original admin (optional – still sends on boot)
    if (config.TG_ADMIN_ID && fs.existsSync(config.STARTUP_IMAGE))
        setTimeout(() => bot.sendPhoto(config.TG_ADMIN_ID, config.STARTUP_IMAGE, { caption: `🚀 ${config.BOT_NAME} started` }).catch(e=>{}), 2000);
    return bot;
};
module.exports = { initTelegram };
