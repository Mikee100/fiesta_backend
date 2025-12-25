
import axios from 'axios';

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
    const response = await axios.post(url, payload);
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
  } catch (error) {
    console.error('Error sending webhook:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testInstagramWebhook();
