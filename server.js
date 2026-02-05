const express = require('express');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pino = require('pino');
const cors = require('cors');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock;
let qrCodeData = null;
let isConnected = false;

// --- NUCLEAR OPTION: WIPE SESSION ON BOOT ---
// This deletes the broken login files every time the server starts.
console.log('>>> SYSTEM STARTUP: Cleaning old session files... <<<');
if (fs.existsSync('auth_info')) {
    fs.rmSync('auth_info', { recursive: true, force: true });
    console.log('>>> Old session deleted. Ready for new QR. <<<');
}
// ---------------------------------------------

async function startWhatsApp() {
    console.log('Starting WhatsApp Client...');
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["VisionPoint", "Chrome", "1.0.0"],
        connectTimeoutMs: 60000, 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('>>> NEW QR CODE GENERATED <<<'); 
            qrcode.toDataURL(qr, (err, url) => {
                qrCodeData = url;
            });
        }

        if (connection === 'close') {
            // If connection closes, DO NOT reconnect automatically if logged out.
            // This prevents the "Loop of Death".
            const reason = (lastDisconnect.error)?.output?.statusCode;
            console.log(`Connection closed. Reason: ${reason}`);

            if (reason === DisconnectReason.loggedOut || reason === 401) {
                console.log('Session invalid. Deleting and restarting...');
                if (fs.existsSync('auth_info')) {
                    fs.rmSync('auth_info', { recursive: true, force: true });
                }
                isConnected = false;
                qrCodeData = null;
                setTimeout(startWhatsApp, 2000); // Restart fresh
            } else {
                // Only reconnect for minor network errors
                console.log('Minor disconnect. Reconnecting...');
                startWhatsApp(); 
            }
        } else if (connection === 'open') {
            console.log('>>> WhatsApp Connected Successfully! <<<');
            isConnected = true;
            qrCodeData = null;
        }
    });
}

// Start the bot
startWhatsApp();

// ---------------------------------------------------------
// API ROUTES
// ---------------------------------------------------------

app.get('/', (req, res) => {
    res.send('<h1>WhatsApp Bridge is Running! 🚀</h1>');
});

app.get('/status', (req, res) => {
    res.json({
        connected: isConnected,
        qr: qrCodeData
    });
});

app.get('/reset', async (req, res) => {
    try {
        if (sock) { sock.end(undefined); }
        if (fs.existsSync('auth_info')) {
            fs.rmSync('auth_info', { recursive: true, force: true });
        }
        isConnected = false;
        qrCodeData = null;
        setTimeout(startWhatsApp, 2000);
        res.json({ status: 'success', message: 'Reset complete.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.toString() });
    }
});

app.post('/send-message', async (req, res) => {
    if (!isConnected) return res.status(500).json({ status: 'error', message: 'Not connected' });
    const { number, message } = req.body;
    if (!number || !message) return res.status(400).json({ status: 'error', message: 'Missing data' });
    
    try {
        const jid = number.replace(/[^0-9]/g, '') + "@s.whatsapp.net";
        await sock.sendMessage(jid, { text: message });
        res.json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.toString() });
    }
});

app.listen(port, () => {
    console.log(`Baileys Bridge running on port ${port}`);
});
