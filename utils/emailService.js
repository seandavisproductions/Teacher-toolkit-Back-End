// utils/emailService.js
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

// Configure your email transporter for Ionos SMTP
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST, // This will be your Ionos SMTP host (e.g., 'smtp.ionos.co.uk')
    port: process.env.EMAIL_PORT, // This will typically be 587 (for TLS)
    secure: process.env.EMAIL_SECURE === 'true', // 'true' for port 465 (SSL), 'false' for other ports (like 587 TLS)
    auth: {
        user: process.env.EMAIL_USER, // Your Ionos email address (teachertoolkit@seandavisproductions.co.uk)
        pass: process.env.EMAIL_PASS, // The password for that Ionos email
    },
    // If you encounter certificate issues during local development, you might temporarily
    // add this line. REMOVE THIS IN PRODUCTION!
    tls: {
        rejectUnauthorized: false
    }
});

// Function to send a generic email
const sendEmail = async (options) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_FROM, // Sender address (e.g., "Teacher Toolkit <teachertoolkit@seandavisproductions.co.uk>")
            to: options.to,
            subject: options.subject,
            html: options.html,
            text: options.text,
        };

        let info = await transporter.sendMail(mailOptions);
        console.log('Message sent: %s', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error: error.message };
    }
};

// Function specifically for sending verification email
const sendVerificationEmail = async (toEmail, verificationToken) => {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    const htmlContent = `
        <p>Hello,</p>
        <p>Thank you for registering. Please verify your email by clicking the link below:</p>
        <p><a href="${verificationUrl}">Verify Your Email Address</a></p>
        <p>This link will expire in 24 hours.</p>
        <p>If you did not register for this account, please ignore this email.</p>
        <p>Regards,</p>
        <p>The Teacher Toolkit Team</p>
    `;

    return sendEmail({
        to: toEmail,
        subject: 'Verify Your Email Address for Teacher Toolkit',
        html: htmlContent,
        text: `Please verify your email for Teacher Toolkit by clicking this link: ${verificationUrl}`
    });
};

// Function specifically for sending password reset email
const sendPasswordResetEmail = async (toEmail, resetToken) => {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const htmlContent = `
        <p>Hello,</p>
        <p>You have requested a password reset for your Teacher Toolkit account.</p>
        <p>Please click the link below to reset your password:</p>
        <p><a href="${resetUrl}">Reset Your Password</a></p>
        <p>This link is valid for 1 hour.</p>
        <p>If you did not request a password reset, please ignore this email.</p>
        <p>Regards,</p>
        <p>The Teacher Toolkit Team</p>
    `;

    return sendEmail({
        to: toEmail,
        subject: 'Teacher Toolkit Password Reset Request',
        html: htmlContent,
        text: `You have requested a password reset for Teacher Toolkit. Please click this link to reset your password: ${resetUrl}`
    });
};


module.exports = {
    sendEmail,
    sendVerificationEmail,
    sendPasswordResetEmail
};