// Find Instagram Business Account ID
const axios = require('axios');

const ACCESS_TOKEN = 'EAALTWSjLtPABQJDTFpAvyixgC6dfkud5miIX0ZA3ZA4euqTsuCFxVtZBejN9cN3wqrk7ylowt9QxZBZAGTdqHSabq9wG7qCO6w2VkPrXPRnCSJVskO6jx2fxORuEl0oMbbkpytDAbTSNhKM4Wlov9GvRuxtgQZCFvd9vN2J6ss8yIgu4iB7mAybHKrMtec';
const USER_ID = '1368210941325721'; // From previous test

async function findInstagramAccount() {
  console.log('🔍 Finding Instagram Business Accounts...\n');

  try {
    // Get all pages managed by this user
    console.log('1️⃣ Getting Facebook Pages...');
    const pagesResponse = await axios.get(`https://graph.facebook.com/v21.0/${USER_ID}/accounts`, {
      params: {
        access_token: ACCESS_TOKEN
      }
    });

    console.log('Found Pages:', pagesResponse.data.data.length);
    
    for (const page of pagesResponse.data.data) {
      console.log(`\n📄 Page: ${page.name} (ID: ${page.id})`);
      
      // Check if this page has an Instagram Business Account
      try {
        const igResponse = await axios.get(`https://graph.facebook.com/v21.0/${page.id}`, {
          params: {
            fields: 'instagram_business_account',
            access_token: ACCESS_TOKEN
          }
        });
        
        if (igResponse.data.instagram_business_account) {
          const igId = igResponse.data.instagram_business_account.id;
          console.log(`  ✅ Connected Instagram Business Account: ${igId}`);
          
          // Get Instagram account details
          const igDetails = await axios.get(`https://graph.facebook.com/v21.0/${igId}`, {
            params: {
              fields: 'id,username,name',
              access_token: ACCESS_TOKEN
            }
          });
          
          console.log(`  📷 Instagram: @${igDetails.data.username} (${igDetails.data.name})`);
          console.log(`\n  📝 ADD TO YOUR .env FILE:`);
          console.log(`  INSTAGRAM_BUSINESS_ACCOUNT_ID=${igId}`);
          console.log(`  INSTAGRAM_PAGE_ID=${page.id}`);
          console.log(`  INSTAGRAM_PAGE_ACCESS_TOKEN=${page.access_token}`);
        } else {
          console.log(`  ❌ No Instagram account connected`);
        }
      } catch (err) {
        console.log(`  ❌ Error checking Instagram:`, err.response?.data?.error?.message || err.message);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

findInstagramAccount();
