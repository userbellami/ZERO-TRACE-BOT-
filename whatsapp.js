const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const config = require('./config');

let sock = null;
let isConnected = false;
let connectionStartTime = null;

const connectWA = async (pairingNumber = null, onPairingCode = null) => {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(config.SESSION_DIR);
        
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: ['ZeroTraceBot', 'Safari', '15.0'],  // Known working browser
            syncFullHistory: false,
            markOnlineOnConnect: true,
            patchMessageBeforeSending: (msg) => {
                if (msg.text && msg.text.length > 500) msg.text = msg.text.substring(0,500)+'...';
                return msg;
            },
            generateHighQualityLinkPreview: false,
            logger: require('pino')({ level: 'silent' }),
            maxCachedMessages: 50,
            maxMessageRetryCount: 1,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000
        });

        connectionStartTime = Date.now();
        sock.ev.on('creds.update', saveCreds);

        // Handle pairing code
        if (pairingNumber && typeof pairingNumber === 'string') {
            // Wait for socket to be fully ready (connection open event)
            const waitForOpen = () => {
                return new Promise((resolve) => {
                    const checkOpen = (update) => {
                        if (update.connection === 'open') {
                            sock.ev.off('connection.update', checkOpen);
                            resolve();
                        }
                    };
                    sock.ev.on('connection.update', checkOpen);
                    // Also resolve after 10 seconds max to avoid hanging
                    setTimeout(resolve, 10000);
                });
            };
            
            await waitForOpen();
            
            try {
                const formattedNumber = pairingNumber.replace(/[^0-9]/g, '');
                console.log(`[PAIR] Requesting code for ${formattedNumber}`);
                const code = await sock.requestPairingCode(formattedNumber);
                console.log(`[PAIR] Code received: ${code}`);
                if (onPairingCode) onPairingCode(code, formattedNumber, null);
            } catch (err) {
                console.error('[PAIR] Error:', err);
                if (onPairingCode) onPairingCode(null, null, err.message);
            }
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            console.log(`[WA] Connection update: ${connection || 'unknown'}`);
            
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log(`[WA] Connection closed, reconnecting: ${shouldReconnect}`);
                isConnected = false;
                if (shouldReconnect) setTimeout(() => connectWA(), 5000);
            } else if (connection === 'open') {
                isConnected = true;
                console.log('[WA] Connected successfully!');
                
                const ownerJid = config.OWNER_NUMBER + '@s.whatsapp.net';
                if (fs.existsSync(config.STARTUP_IMAGE)) {
                    await sock.sendMessage(ownerJid, { image: fs.readFileSync(config.STARTUP_IMAGE), caption: `🚀 ${config.BOT_NAME} online!\n💧 Prefix: ${config.PREFIX}` });
                } else {
                    await sock.sendMessage(ownerJid, { text: `🚀 ${config.BOT_NAME} online!` });
                }
            }
        });

        return sock;
    } catch (error) {
        console.error('[WA] Connection error:', error);
        throw error;
    }
};

const disconnectWA = async () => { if (sock) await sock.logout(); sock = null; isConnected = false; };
const restartWithPairing = async (phone, cb) => { await disconnectWA(); return await connectWA(phone, cb); };
const getWAConnection = () => sock;
const isWAConnected = () => isConnected;
const getWAUptime = () => connectionStartTime ? Math.floor((Date.now() - connectionStartTime) / 1000) : 0;

module.exports = { connectWA, disconnectWA, restartWithPairing, getWAConnection, isWAConnected, getWAUptime };
