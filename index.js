require("dotenv").config();
const axios = require("axios");
const express = require("express");

const app = express();
const port = process.env.PORT || 3000;
const webhookVerifyToken = process.env.WEBHOOK_VERIFY_TOKEN;

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Wati WhatsApp Bot with Gemini AI Integration");
});

// Webhook verification endpoint for Wati
app.get("/webhook", (req, res) => {
    // const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (token === webhookVerifyToken) {
        console.log("Webhook verified successfully");
        res.status(200).send(challenge);
    } else {
        console.log("Webhook verification failed");
        res.sendStatus(403);
    }
});

// Main webhook endpoint to handle incoming messages from Wati
app.post("/webhook", async (req, res) => {
    const body = req.body;
    console.log("Received webhook:", JSON.stringify(body, null, 2));

    try {
        // Handle different types of Wati webhook events
        if (body.type === "message") {
            await handleIncomingMessage(body);
        } else if (body.type === "status") {
            await handleMessageStatus(body);
        } else if (body.type === "text") {
            await handleIncomingMessage(body);
        } else {
            console.log("Unhandled webhook type:", body.type);
        }

        res.status(200).send("WEBHOOK RECEIVED");
    } catch (error) {
        console.error("Error processing webhook:", error);
        res.status(500).send("Error processing webhook");
    }
});

// Handle incoming messages
async function handleIncomingMessage(messageData) {
    const { whatsappMessageId, text, type, waId, senderName } = messageData;

    console.log(`Received ${type} message from ${waId}: ${text}`);

    // Only process text messages
    if (type === "text" && text && senderName == "Mantosh sharma") {
        try {
            // Generate AI response using Gemini
            const aiResponse = await generateGeminiResponse(text);

            if (aiResponse && aiResponse.trim()) {
                console.log("AI Response to send:", aiResponse);
                await sendWatiMessage(waId, aiResponse);
            } else {
                console.warn("Empty response from Gemini, sending fallback.");
                await sendWatiMessage(
                    waId,
                    "Sorry, I couldn't generate a proper response. Please try again.",
                );
            }
        } catch (error) {
            console.error("Error handling message:", error);
            // Send error message to user
            await sendWatiMessage(
                waId,
                "I'm experiencing technical difficulties. Please try again later.",
            );
        }
    } else {
        console.log(`Ignoring message type: ${type} or sender: ${senderName}`);
    }
}

// Handle message status updates
async function handleMessageStatus(statusData) {
    const { whatsappMessageId, status, waId } = statusData;
    console.log(`Message ${whatsappMessageId} to ${waId} status: ${status}`);
}

async function generateGeminiResponse(userMessage) {
    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [
                    {
                        parts: [{ text: userMessage }],
                    },
                ],
            },
            {
                headers: {
                    "Content-Type": "application/json",
                },
            },
        );

        console.log(
            "Gemini full response:",
            JSON.stringify(response.data, null, 2),
        );

        const aiText =
            response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (aiText && aiText.trim()) {
            return aiText.trim();
        } else {
            return null;
        }
    } catch (error) {
        console.error(
            "Error calling Gemini API:",
            error.response?.data || error.message,
        );
        return null;
    }
}

// CORRECTED: Send message through Wati API using query parameter
async function sendWatiMessage(waId, message) {
    try {
        // Clean and validate the message
        const cleanMessage = message.trim();

        if (!cleanMessage) {
            console.error("Message is empty after cleaning");
            return;
        }

        console.log(`Sending message to ${waId}: "${cleanMessage}"`);

        // Build URL with messageText as query parameter (matching your working curl)
        const url = `${process.env.WATI_API_URL}/api/v1/sendSessionMessage/${waId}?messageText=${encodeURIComponent(cleanMessage)}`;

        console.log(`Sending POST to: ${url}`);

        const response = await axios.post(
            url,
            '', // Empty body, just like your working curl command
            {
                headers: {
                    'accept': '*/*',
                    'Authorization': `Bearer ${process.env.WATI_API_TOKEN}`,
                },
            },
        );

        console.log(
            "Message sent successfully:",
            response.status,
            response.data,
        );
        return response.data;
    } catch (error) {
        console.error(
            "Error sending message:",
            error.response?.status,
            error.response?.data || error.message,
        );
        throw error;
    }
}

// Send template message through Wati (optional)
async function sendWatiTemplateMessage(waId, templateName, parameters = []) {
    try {
        const response = await axios.post(
            `${process.env.WATI_API_URL}/api/v1/sendTemplateMessage`,
            {
                whatsappNumber: waId,
                templateName: templateName,
                bodyValues: parameters,
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.WATI_API_TOKEN}`,
                    "Content-Type": "application/json",
                },
            },
        );

        console.log(
            "Template message sent successfully:",
            response.status,
            response.data,
        );
        return response.data;
    } catch (error) {
        console.error(
            "Error sending template message:",
            error.response?.status,
            error.response?.data || error.message,
        );
        throw error;
    }
}

// Send interactive message (buttons) through Wati
async function sendWatiInteractiveMessage(waId, bodyText, buttons) {
    try {
        const response = await axios.post(
            `${process.env.WATI_API_URL}/api/v1/sendInteractiveButtonsMessage`,
            {
                whatsappNumber: waId,
                bodyText: bodyText,
                buttons: buttons,
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.WATI_API_TOKEN}`,
                    "Content-Type": "application/json",
                },
            },
        );

        console.log(
            "Interactive message sent successfully:",
            response.status,
            response.data,
        );
        return response.data;
    } catch (error) {
        console.error(
            "Error sending interactive message:",
            error.response?.status,
            error.response?.data || error.message,
        );
        throw error;
    }
}

// Send list message through Wati
async function sendWatiListMessage(waId, bodyText, listItems) {
    try {
        const response = await axios.post(
            `${process.env.WATI_API_URL}/api/v1/sendInteractiveListMessage`,
            {
                whatsappNumber: waId,
                bodyText: bodyText,
                listItems: listItems,
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.WATI_API_TOKEN}`,
                    "Content-Type": "application/json",
                },
            },
        );

        console.log(
            "List message sent successfully:",
            response.status,
            response.data,
        );
        return response.data;
    } catch (error) {
        console.error(
            "Error sending list message:",
            error.response?.status,
            error.response?.data || error.message,
        );
        throw error;
    }
}

// Utility function to send a welcome message with options
async function sendWelcomeMessage(waId) {
    const buttons = [
        {
            text: "Get Help",
            id: "help",
        },
        {
            text: "Information",
            id: "info",
        },
        {
            text: "Contact Support",
            id: "support",
        },
    ];

    await sendWatiInteractiveMessage(
        waId,
        "Welcome! How can I assist you today?",
        buttons,
    );
}

// Error handling middleware
app.use((error, req, res, next) => {
    console.error("Unhandled error:", error);
    res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log("Wati WhatsApp bot with Gemini AI integration is ready!");
});

module.exports = app;