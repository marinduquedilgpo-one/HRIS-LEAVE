 
// email-config.js
const nodemailer = require('nodemailer');

// Create a transporter using Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'alaizajoycebaculo@gmail.com', // CHANGE THIS to your Gmail
    pass: 'bangtansonyeondan'      // CHANGE THIS to your App Password
  }
});

// Function to send email
async function sendEmail(to, subject, html) {
  try {
    const mailOptions = {
      from: 'alaizajoycebaculo@gmail.com', // CHANGE THIS to your Gmail
      to: to,
      subject: subject,
      html: html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent to:', to, 'ID:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { sendEmail };