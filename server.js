const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const puppeteer = require('puppeteer'); 
const app = express();

// Render sets the PORT environment variable automatically
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let qrCodeData = null;
let isReady = false;

// ---------------------------------------------------------
// WHATSAPP CLIENT CONFIGURATION
// ---------------------------------------------------------
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', 
            '--disable-gpu'
        ],
        // FIX FOR RENDER: Use the path from environment variable or default
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath()
    }
});

// ---------------------------------------------------------
// EVENT LISTENERS
// ---------------------------------------------------------

// Generate QR Code when needed
client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    // Convert QR text to Data URL for easy display in your PHP app
    qrcode.toDataURL(qr, (err, url) => {
        qrCodeData = url;
    });
});

// Log when client is ready
client.on('ready', () => {
    console.log('Client is ready!');
    isReady = true;
    qrCodeData = null; // Clear QR code since we are logged in
});

// Handle disconnection
client.on('disconnected', (reason) => {
    console.log('Client disconnected:', reason);
    isReady = false;
    client.initialize(); // Auto-reconnect
});

client.initialize();

// ---------------------------------------------------------
// API ROUTES
// ---------------------------------------------------------

// 1. Status Endpoint (For your PHP "Tab 4" to display QR)
app.get('/status', (req, res) => {
    res.json({
        connected: isReady,
        qr: qrCodeData
    });
});

// 2. Send Message Endpoint (Called by your PHP Sms_model.php)
app.post('/send-message', async (req, res) => {
    if (!isReady) {
        return res.status(500).json({ 
            status: 'error', 
            message: 'WhatsApp Client is not ready. Please scan QR code first.' 
        });
    }

    const { number, message } = req.body;

    if (!number || !message) {
        return res.status(400).json({ 
            status: 'error', 
            message: 'Missing number or message' 
        });
    }

    // 3. Number Formatting
    // Remove non-digits and append the suffix required by WhatsApp Web
    const chatId = number.replace(/[^0-9]/g, '') + "@c.us";

    try {
        await client.sendMessage(chatId, message);
        console.log(`Message sent to ${chatId}`);
        res.json({ status: 'success', message: 'Message sent successfully' });
    } catch (error) {
        console.error('Failed to send message:', error);
        res.status(500).json({ status: 'error', message: error.toString() });
    }
});

// ---------------------------------------------------------
// START SERVER
// ---------------------------------------------------------
app.listen(port, () => {
    console.log(`WhatsApp Bridge running on port ${port}`);
});
