"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");
async function testInstagramWebhook() {
    const url = 'http://localhost:3000/webhooks/instagram';
    const payload = {
        object: 'instagram',
        entry: [
            {
                id: '123456789',
                time: Date.now(),
                messaging: [
                    {
                        sender: {
                            id: '99999999'
                        },
                        recipient: {
                            id: '123456789'
                        },
                        timestamp: Date.now(),
                        message: {
                            mid: 'm_123456789',
                            text: 'Hello from test script'
                        }
                    }
                ]
            }
        ]
    };
    try {
        console.log(`Sending webhook to ${url}...`);
        const response = await axios_1.default.post(url, payload);
        console.log('Response status:', response.status);
        console.log('Response data:', response.data);
    }
    catch (error) {
        console.error('Error sending webhook:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}
testInstagramWebhook();
//# sourceMappingURL=test-webhook-hit.js.map