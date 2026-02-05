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

async function startWhatsApp() {
    console.log('Starting WhatsApp Client...');
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    sock = makeWASocket({
        auth: state,
        // printQRInTerminal: true, <--- DELETED THIS LINE (Fixes your error)
        logger: pino({ level: 'silent' }),
        browser: ["VisionPoint", "Chrome", "1.0.0"], // Browser name
        connectTimeoutMs: 60000, // Wait longer for connection
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('>>> NEW QR CODE GENERATED <<<'); 
            // Convert QR to image immediately
            qrcode.toDataURL(qr, (err, url) => {
                qrCodeData = url;
            });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            isConnected = false;
            
            if (shouldReconnect) {
                // Wait 2 seconds before reconnecting
                setTimeout(startWhatsApp, 2000);
            } else {
                console.log('Logged out. Session cleared.');
                qrCodeData = null;
            }
        } else if (connection === 'open') {
            console.log('>>> WhatsApp Connected Successfully! <<<');
            isConnected = true;
            qrCodeData = null;
        }
    });
}

// Start the bot immediately
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

// HARD RESET - Use this if QR doesn't show
app.get('/reset', async (req, res) => {
    try {
        console.log('Force Resetting Session...');
        if (sock) {
            sock.end(undefined);
            sock = null;
        }
        
        // Delete the session folder
        if (fs.existsSync('auth_info')) {
            fs.rmSync('auth_info', { recursive: true, force: true });
        }

        isConnected = false;
        qrCodeData = null;

        // Restart
        setTimeout(() => {
            startWhatsApp();
        }, 2000);
        
        res.json({ status: 'success', message: 'Session deleted. Wait 10s for new QR.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.toString() });
    }
});

app.post('/send-message', async (req, res) => {
    if (!isConnected) {
        return res.status(500).json({ status: 'error', message: 'WhatsApp not connected' });
    }
    const { number, message } = req.body;
    if (!number || !message) {
        return res.status(400).json({ status: 'error', message: 'Missing number or message' });
    }
    try {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        const jid = cleanNumber + "@s.whatsapp.net";
        await sock.sendMessage(jid, { text: message });
        res.json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.toString() });
    }
});

app.listen(port, () => {
    console.log(`Baileys Bridge running on port ${port}`);
});
