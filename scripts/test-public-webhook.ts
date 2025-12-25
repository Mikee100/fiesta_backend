
import axios from 'axios';

async function testPublicWebhook() {
    const url = 'https://unshrunken-nonegotistic-brianne.ngrok-free.dev/webhooks/instagram';
    const payload = {
        object: 'instagram',
        entry: [
            {
                id: '123456789',
                time: Date.now(),
                messaging: [
                    {
                        sender: { id: '99999999' },
                        recipient: { id: '123456789' },
                        timestamp: Date.now(),
                        message: {
                            mid: 'm_public_test_123',
                            text: 'Hello from PUBLIC URL test'
                        }
                    }
                ]
            }
        ]
    };

    console.log(`Sending webhook to PUBLIC URL: ${url}...`);

    try {
        const response = await axios.post(url, payload);
        console.log('✅ Success! Response status:', response.status);
        console.log('This means the ngrok tunnel is WORKING and reachable.');
    } catch (error) {
        console.error('❌ Failed to reach public URL');
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        console.log('\nPossible causes:');
        console.log('1. The ngrok URL is incorrect.');
        console.log('2. ngrok is not truly online.');
        console.log('3. The server is rejecting requests from the public internet (firewall/CORS).');
    }
}

testPublicWebhook();
