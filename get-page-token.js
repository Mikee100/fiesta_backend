// Get Fresh Page Access Token
const axios = require('axios');

const USER_ACCESS_TOKEN = 'EAALTWSjLtPABQJDTFpAvyixgC6dfkud5miIX0ZA3ZA4euqTsuCFxVtZBejN9cN3wqrk7ylowt9QxZBZAGTdqHSabq9wG7qCO6w2VkPrXPRnCSJVskO6jx2fxORuEl0oMbbkpytDAbTSNhKM4Wlov9GvRuxtgQZCFvd9vN2J6ss8yIgu4iB7mAybHKrMtec';
const PAGE_ID = '288941610963841';

async function getPageAccessToken() {
  console.log('🔑 Getting Fresh Page Access Token...\n');

  try {
    // Get page access token
    const response = await axios.get(`https://graph.facebook.com/v21.0/${PAGE_ID}`, {
      params: {
        fields: 'access_token',
        access_token: USER_ACCESS_TOKEN
      }
    });

    const pageAccessToken = response.data.access_token;
    
    console.log('✅ Page Access Token Retrieved!\n');
    console.log('Token Length:', pageAccessToken.length, 'characters\n');
    console.log('📝 COPY THIS COMPLETE TOKEN TO YOUR .env FILE:\n');
    console.log('INSTAGRAM_PAGE_ACCESS_TOKEN=' + pageAccessToken);
    console.log('\n⚠️ IMPORTANT: Make sure to copy the ENTIRE token!');
    
    // Verify the token works
    console.log('\n🧪 Testing token...');
    const testResponse = await axios.get(`https://graph.facebook.com/v21.0/${PAGE_ID}`, {
      params: {
        fields: 'name,instagram_business_account',
        access_token: pageAccessToken
      }
    });
    
    console.log('✅ Token works! Page:', testResponse.data.name);
    if (testResponse.data.instagram_business_account) {
      console.log('✅ Instagram account connected:', testResponse.data.instagram_business_account.id);
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

getPageAccessToken();
