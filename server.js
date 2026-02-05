const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let qrCodeData = null;
let isReady = false;

// Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    // Convert QR text to Data URL for easy display in PHP
    qrcode.toDataURL(qr, (err, url) => {
        qrCodeData = url;
    });
});

client.on('ready', () => {
    console.log('Client is ready!');
    isReady = true;
    qrCodeData = null; // Clear QR once logged in
});

client.on('disconnected', () => {
    console.log('Client disconnected');
    isReady = false;
    client.initialize();
});

client.initialize();

// API: Check Status & Get QR
app.get('/status', (req, res) => {
    res.json({
        connected: isReady,
        qr: qrCodeData
    });
});

// API: Send Message
app.post('/send-message', async (req, res) => {
    if (!isReady) {
        return res.status(500).json({ status: 'error', message: 'WhatsApp not connected' });
    }

    const { number, message } = req.body;
    
    // Format number (strip + or special chars, ensure @c.us suffix)
    // Assuming input is like "919876543210"
    const chatId = number.replace(/[^0-9]/g, '') + "@c.us";

    try {
        await client.sendMessage(chatId, message);
        res.json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.toString() });
    }
});

app.listen(port, () => {
    console.log(`WhatsApp Bridge running on http://localhost:${port}`);
});
