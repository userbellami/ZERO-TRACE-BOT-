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
            printQRInTerminal: false,  // No QR
            browser: ['Zero Trace Bot', 'Chrome', '120.0.0.0'],  // Correct format for pairing
            syncFullHistory: false,
            markOnlineOnConnect: true,
            patchMessageBeforeSending: (msg) => {
                if (msg.text && msg.text.length > 500) msg.text = msg.text.substring(0,500)+'...';
                return msg;
            },
            generateHighQualityLinkPreview: false,
            logger: require('pino')({ level: 'silent' }),
            maxCachedMessages: 50,
            maxMessageRetryCount: 1
        });

        connectionStartTime = Date.now();
        sock.ev.on('creds.update', saveCreds);

        // Handle pairing code if number provided
        if (pairingNumber && typeof pairingNumber === 'string') {
            // Wait for socket to be ready before requesting code
            setTimeout(async () => {
                try {
                    const formattedNumber = pairingNumber.replace(/[^0-9]/g, '');
                    console.log(`[PAIR] Requesting code for ${formattedNumber}`);
                    const code = await sock.requestPairingCode(formattedNumber);
                    console.log(`[PAIR] Code received: ${code}`);
                    if (onPairingCode && typeof onPairingCode === 'function') {
                        onPairingCode(code, formattedNumber, null);
                    }
                } catch (err) {
                    console.error('[PAIR] Error:', err);
                    if (onPairingCode) onPairingCode(null, null, err.message);
                }
            }, 3000); // Increased delay to ensure socket is ready
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log(`[WA] Connection closed, reconnecting: ${shouldReconnect}`);
                isConnected = false;
                
                if (shouldReconnect) {
                    setTimeout(() => connectWA(), 5000);
                }
            } else if (connection === 'open') {
                isConnected = true;
                console.log('[WA] Connected successfully!');
                
                const ownerJid = config.OWNER_NUMBER + '@s.whatsapp.net';
                if (fs.existsSync(config.STARTUP_IMAGE)) {
                    try {
                        const imageBuffer = fs.readFileSync(config.STARTUP_IMAGE);
                        await sock.sendMessage(ownerJid, {
                            image: imageBuffer,
                            caption: `🚀 ${config.BOT_NAME} online!\n💧 Prefix: ${config.PREFIX}`
                        });
                        console.log('[WA] Startup image sent to owner');
                    } catch (err) {
                        console.error('[WA] Failed to send startup image:', err);
                    }
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

const disconnectWA = async () => {
    if (sock) {
        await sock.logout();
        isConnected = false;
        sock = null;
    }
};

const restartWithPairing = async (phoneNumber, onPairingCode) => {
    console.log(`[PAIR] Restarting with pairing for ${phoneNumber}`);
    await disconnectWA();
    return await connectWA(phoneNumber, onPairingCode);
};

const getWAConnection = () => sock;
const isWAConnected = () => isConnected;
const getWAUptime = () => connectionStartTime ? Math.floor((Date.now() - connectionStartTime) / 1000) : 0;

module.exports = {
    connectWA,
    disconnectWA,
    restartWithPairing,
    getWAConnection,
    isWAConnected,
    getWAUptime
};
