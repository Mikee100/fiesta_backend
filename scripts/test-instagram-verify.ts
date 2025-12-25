
import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function testInstagramVerify() {
    const verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN;
    if (!verifyToken) {
        console.error('Error: INSTAGRAM_VERIFY_TOKEN not found in .env');
        process.exit(1);
    }

    const challenge = '1234567890';
    const url = `http://localhost:3000/webhooks/instagram?hub.mode=subscribe&hub.challenge=${challenge}&hub.verify_token=${verifyToken}`;

    console.log(`Testing verification with token: ${verifyToken}`);
    console.log(`URL: ${url}`);

    try {
        const response = await axios.get(url);
        console.log('Response status:', response.status);
        console.log('Response data:', response.data);

        if (response.data == challenge) {
            console.log('✅ Verification SUCCESS: Challenge returned correctly.');
        } else {
            console.log('❌ Verification FAILED: Challenge mismatch.');
        }
    } catch (error) {
        console.error('Error sending verification request:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

testInstagramVerify();
