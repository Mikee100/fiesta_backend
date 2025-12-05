// Find Instagram Username from ID
const axios = require('axios');

const ACCESS_TOKEN = 'EAALTWSjLtPABQG0NLSaRzXlbjGaQB3PUk5pwhagbYnpjzyQpkMibqheY10XQ0usKlcFsTEtJGN1HIxlSIwiroHHZBsBwfR6ebz8q77AJYBCfJQ2Y7AyXRdTSRbDR0ZBjzZAeKzDz0g3tD1BNJvqHMz9pDnHstq411ZAgsUIfQmW6n8SQ9DeTtsZB86STDRUIgyLVllRIA';
const INSTAGRAM_USER_ID = '2016354235886760';

async function getUsername() {
  try {
    const response = await axios.get(`https://graph.facebook.com/v21.0/${INSTAGRAM_USER_ID}`, {
      params: {
        fields: 'id,username,name',
        access_token: ACCESS_TOKEN
      }
    });
    
    console.log('Instagram User Info:');
    console.log('Username:', response.data.username || 'N/A');
    console.log('Name:', response.data.name || 'N/A');
    console.log('ID:', response.data.id);
    console.log('\n📝 Add this Instagram account as a tester:');
    console.log('@' + (response.data.username || 'unknown'));
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    console.log('\n💡 The user might not have a public Instagram account or you need different permissions to see their info.');
  }
}

getUsername();
