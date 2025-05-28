// controllers/authController.js
const Teacher = require("../models/Teacher");
const jwt = require("jsonwebtoken"); // Make sure you have 'jsonwebtoken' installed: npm install jsonwebtoken
const crypto = require('crypto'); // Built-in Node.js module
const { sendVerificationEmail, sendPasswordResetEmail } = require("../utils/emailService");

// --- IMPORTANT: Ensure process.env.JWT_SECRET is set in your .env file ---
// For example: JWT_SECRET=your_super_secret_jwt_key_here

// Register a teacher
const register = async (req, res) => { // Changed from exports.register
    try {
        const { email, password } = req.body;

        let teacher = await Teacher.findOne({ email });
        if (teacher) {
            if (!teacher.isVerified) {
                // You might choose to resend the verification email here or just inform them
                return res.status(400).json({ success: false, message: 'User already exists, but email is not verified. Please check your inbox or try logging in.' });
            }
            return res.status(400).json({ success: false, message: 'User already exists with this email.' });
        }

        teacher = new Teacher({ email, password }); // Password will be hashed by the pre('save') hook

        const verificationToken = teacher.getResetPasswordToken(); // Reusing method for token generation
        teacher.verificationToken = teacher.resetPasswordToken; // Store the hashed token for verification
        teacher.resetPasswordToken = undefined; // Clear these specific fields
        teacher.resetPasswordExpires = undefined;

        await teacher.save();

        await sendVerificationEmail(teacher.email, verificationToken);

        res.status(201).json({
            success: true,
            message: "Registration successful! Please check your email to verify your account."
        });

    } catch (error) {
        console.error('Registration error:', error.message);
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
};

// Login a teacher
const login = async (req, res) => { // Changed from exports.login
    try {
        const { email, password } = req.body;

        const teacher = await Teacher.findOne({ email });
        if (!teacher) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        if (!teacher.isVerified) {
            return res.status(401).json({ success: false, message: 'Please verify your email address to log in.' });
        }

        const isMatch = await teacher.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid credentials." });
        }

        const token = jwt.sign(
            { id: teacher._id },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        res.status(200).json({
            success: true,
            message: "Logged in successfully!",
            token,
            userId: teacher._id,
            email: teacher.email
        });

    } catch (error) {
        console.error('Login error:', error.message);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
};

// Verify Email Address
const verifyEmail = async (req, res) => { // Changed from exports.verifyEmail
    const { token } = req.query;

    if (!token) {
        return res.status(400).json({ success: false, message: 'No verification token provided.' });
    }

    const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    try {
        const teacher = await Teacher.findOne({ verificationToken: hashedToken });

        if (!teacher) {
            return res.status(400).json({ success: false, message: 'Invalid or expired verification link.' });
        }

        teacher.isVerified = true;
        teacher.verificationToken = undefined;

        await teacher.save();

        res.status(200).json({ success: true, message: 'Email verified successfully! You can now log in.' });
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({ success: false, message: 'Server error during email verification.' });
    }
};


// Request Password Reset Link
const forgotPassword = async (req, res) => { // Changed from exports.forgotPassword
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, message: 'Please provide an email address.' });
    }

    try {
        const teacher = await Teacher.findOne({ email });

        if (!teacher) {
            console.log(`Forgot password requested for non-existent email: ${email}`);
            return res.status(200).json({
                success: true,
                message: 'If an account with that email exists, a password reset link has been sent to your inbox.'
            });
        }

        const resetToken = teacher.getResetPasswordToken();
        await teacher.save({ validateBeforeSave: false });

        const emailResult = await sendPasswordResetEmail(teacher.email, resetToken);

        if (!emailResult.success) {
            console.error(`Error sending password reset email to ${teacher.email}:`, emailResult.error);
            return res.status(200).json({
                success: true,
                message: 'If an account with that email exists, a password reset link has been sent to your inbox, though there was an issue sending the email.'
            });
        }

        res.status(200).json({
            success: true,
            message: 'If an account with that email exists, a password reset link has been sent to your inbox.'
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
    }
};

// Reset Password
const resetPassword = async (req, res) => { // Changed from exports.resetPassword
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }

    const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    try {
        const teacher = await Teacher.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!teacher) {
            return res.status(400).json({ success: false, message: 'Invalid or expired password reset link.' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
        }

        teacher.password = newPassword;
        teacher.resetPasswordToken = undefined;
        teacher.resetPasswordExpires = undefined;

        await teacher.save();

        res.status(200).json({ success: true, message: 'Password reset successfully. You can now log in with your new password.' });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
    }
};

// Export all the functions
module.exports = {
    register,
    login,
    verifyEmail,
    forgotPassword,
    resetPassword
};