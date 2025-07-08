const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// WATI Configuration
const WATI_API_ENDPOINT = process.env.WATI_API_ENDPOINT || 'https://live-server-113452.wati.io';
const WATI_API_TOKEN = process.env.WATI_API_TOKEN;

// Helper function to send message via WATI API
async function sendWATIMessage(phoneNumber, message) {
  try {
    const response = await axios.post(
      `${WATI_API_ENDPOINT}/api/v1/sendSessionMessage/${phoneNumber}`,
      {
        messageText: message
      },
      {
        headers: {
          'Authorization': `Bearer ${WATI_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Message sent successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
    throw error;
  }
}

// Helper function to get AI response from Gemini
async function getGeminiResponse(userMessage, phoneNumber) {
  try {
    // Create a context-aware prompt
    const prompt = `
    You are a helpful WhatsApp chatbot assistant. 
    User message: "${userMessage}"
    
    Please provide a helpful, friendly, and concise response. 
    Keep your response under 1000 characters for WhatsApp compatibility.
    Be conversational and helpful.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log(`AI Response for ${phoneNumber}:`, text);
    return text;
  } catch (error) {
    console.error('Error generating AI response:', error);
    return 'Sorry, I encountered an error while processing your message. Please try again.';
  }
}

// Main webhook endpoint for WATI
app.post('/webhook', async (req, res) => {
  try {
    console.log('Webhook received:', JSON.stringify(req.body, null, 2));
    
    const webhookData = req.body;
    
    // Check if this is a message webhook
    if (webhookData.type === 'message' && webhookData.data) {
      const { 
        whatsappMessageId,
        conversationId,
        ticketId,
        text,
        fromMe,
        senderName,
        timestamp 
      } = webhookData.data;
      
      // Extract phone number from conversation ID or use a different field
      const phoneNumber = webhookData.data.contactPhone || 
                         webhookData.data.phone || 
                         conversationId.split('@')[0];
      
      // Only respond to messages not sent by us
      if (!fromMe && text && text.trim() !== '') {
        console.log(`Processing message from ${senderName} (${phoneNumber}): ${text}`);
        
        // Get AI response
        const aiResponse = await getGeminiResponse(text, phoneNumber);
        
        // Send response back via WATI
        await sendWATIMessage(phoneNumber, aiResponse);
        
        console.log(`Response sent to ${phoneNumber}: ${aiResponse}`);
      }
    }
    
    // Always respond with 200 OK to acknowledge receipt
    res.status(200).json({ 
      success: true, 
      message: 'Webhook processed successfully' 
    });
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    watiConfigured: !!process.env.WATI_API_TOKEN
  });
});

// Test endpoint to verify Gemini integration
app.post('/test-gemini', async (req, res) => {
  try {
    const { message } = req.body;
    const response = await getGeminiResponse(message || 'Hello, how are you?', 'test');
    res.json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test endpoint to verify WATI integration
app.post('/test-wati', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;
    const response = await sendWATIMessage(phoneNumber, message);
    res.json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`WATI + Gemini Webhook Server running on port ${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  
  // Check environment variables
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  GEMINI_API_KEY not found in environment variables');
  }
  if (!process.env.WATI_API_TOKEN) {
    console.warn('⚠️  WATI_API_TOKEN not found in environment variables');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  process.exit(0);
});