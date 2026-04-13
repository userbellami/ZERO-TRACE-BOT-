const wa = require('./whatsapp');
const tg = require('./telegram');
const handler = require('./handler');
const config = require('./config');
const os = require('os');
console.log(`🚀 ${config.BOT_NAME} starting... Node ${process.version} | ${os.platform()}`);
let sock = null;
let msgCount = 0;
setInterval(() => {
    const mem = process.memoryUsage();
    console.log(`[MEM] RSS: ${(mem.rss/1024/1024).toFixed(1)}MB | Heap: ${(mem.heapUsed/1024/1024).toFixed(1)}MB | Msgs: ${msgCount}`);
}, 30000);
const initWA = async () => {
    sock = await wa.connectWA();
    if (sock) sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.key.fromMe) { msgCount++; await handler.processWhatsAppMessage(sock, msg, wa.getWAUptime()); }
    });
};
const restartPair = async (phone, cb) => {
    if (sock) await wa.disconnectWA();
    sock = await wa.restartWithPairing(phone, cb);
    if (sock) sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.key.fromMe) { msgCount++; await handler.processWhatsAppMessage(sock, msg, wa.getWAUptime()); }
    });
};
(async () => {
    await tg.initTelegram(restartPair);
    await initWA();
    console.log('✅ Bot ready');
})();
