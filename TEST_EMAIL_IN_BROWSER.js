// =====================================================
// TEST WELCOME EMAIL IN BROWSER CONSOLE
// =====================================================
// 1. Open http://localhost:3000 in your browser
// 2. Press F12 to open Developer Console
// 3. Paste this entire script
// 4. Watch the terminal where npm run dev is running
// =====================================================

// Replace this with a user_id from your SQL query
const TEST_USER_ID = '63b28d67-cc7b-4f88-b34f-57a8a409cd4d'; // Mila Catherine (student)

console.log('🧪 Testing Welcome Email API...');
console.log('User ID:', TEST_USER_ID);

fetch('http://localhost:3000/api/send-welcome-email', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json' 
  },
  body: JSON.stringify({ 
    userId: TEST_USER_ID
  })
})
.then(response => {
  console.log('Response Status:', response.status);
  return response.json();
})
.then(data => {
  console.log('📨 API Response:', data);
  
  if (data.success) {
    console.log('✅ SUCCESS! Welcome email sent!');
    console.log('📧 Email ID:', data.emailId);
    console.log('');
    console.log('Next steps:');
    console.log('1. Check your terminal - should see detailed logs');
    console.log('2. Go to https://resend.com/emails');
    console.log('3. Look for the email that was just sent');
    console.log('');
    console.log('Now run this SQL to verify:');
    console.log(`SELECT * FROM email_send_logs WHERE user_id = '${TEST_USER_ID}' ORDER BY created_at DESC;`);
  } else {
    console.error('❌ FAILED to send email');
    console.error('Error:', data.error);
    console.error('Message:', data.message);
    console.log('');
    console.log('Check your terminal for detailed error logs');
  }
})
.catch(error => {
  console.error('❌ Network Error:', error);
  console.error('Make sure dev server is running on localhost:3000');
});
