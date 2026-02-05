const express = require('express');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pino = require('pino');
const cors = require('cors'); // <--- NEW LINE 1

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for ALL websites (Fixes your error)
app.use(cors()); // <--- NEW LINE 2
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock;
let qrCodeData = null;
let isConnected = false;

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["VisionPoint", "Chrome", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('NEW QR CODE RECEIVED');
            qrcode.toDataURL(qr, (err, url) => {
                qrCodeData = url;
            });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            isConnected = false;
            
            if (shouldReconnect) {
                startWhatsApp();
            } else {
                console.log('Logged out. Delete auth_info folder to re-scan.');
                qrCodeData = null;
            }
        } else if (connection === 'open') {
            console.log('WhatsApp Connected Successfully!');
            isConnected = true;
            qrCodeData = null;
        }
    });
}

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
        
        console.log(`Message sent to ${jid}`);
        res.json({ status: 'success' });
    } catch (error) {
        console.error('Send failed:', error);
        res.status(500).json({ status: 'error', message: error.toString() });
    }
});
// 3. Reset/Logout Route (Fixes stuck sessions)
app.get('/reset', async (req, res) => {
    try {
        console.log('Resetting session...');
        // Stop the current socket
        if (sock) {
            sock.end(undefined);
        }
        
        // Delete the session folder
        const fs = require('fs');
        if (fs.existsSync('auth_info')) {
            fs.rmSync('auth_info', { recursive: true, force: true });
        }

        // Reset variables
        isConnected = false;
        qrCodeData = null;

        // Restart the bot
        startWhatsApp();
        
        res.json({ status: 'success', message: 'Session reset. Wait 10s for new QR.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.toString() });
    }
});
app.listen(port, () => {
    console.log(`Baileys Bridge running on port ${port}`);
});
