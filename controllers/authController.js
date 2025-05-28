// controllers/authController.js
const Teacher = require("../models/Teacher");
const jwt = require("jsonwebtoken"); // Make sure you have 'jsonwebtoken' installed: npm install jsonwebtoken
const crypto = require('crypto'); // Built-in Node.js module
const { sendVerificationEmail, sendPasswordResetEmail } = require("../utils/emailService");

// --- IMPORTANT: Ensure process.env.JWT_SECRET is set in your .env file ---
// For example: JWT_SECRET=your_super_secret_jwt_key_here

// Register a teacher
exports.register = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Check if user already exists
        let teacher = await Teacher.findOne({ email });
        if (teacher) {
            // If user exists but is not verified, you might want to resend verification email
            // or inform them to verify. For now, we'll just say exists.
            if (!teacher.isVerified) {
                 // Optionally resend email verification, but for simplicity, just tell them it exists.
                 // teacher.verificationToken = teacher.getResetPasswordToken(); // Re-use method for token gen
                 // await teacher.save({ validateBeforeSave: false });
                 // await sendVerificationEmail(teacher.email, teacher.verificationToken);
                 // return res.status(400).json({ success: false, message: 'User already exists, but email is not verified. A new verification link has been sent.' });
            }
            return res.status(400).json({ success: false, message: 'User already exists with this email.' });
        }

        // 2. Create new teacher instance
        teacher = new Teacher({ email, password }); // Password will be hashed by the pre('save') hook in the model

        // 3. Generate verification token for email verification
        // Reusing getResetPasswordToken method from model as it generates a hashed token and expiry
        // For verification, expiry might be longer (e.g., 24 hours), or no expiry.
        // If you need different expiry for verification vs. password reset, create a separate method in Teacher model.
        // For now, it defaults to 1 hour, which is okay for verification.
        const verificationToken = teacher.getResetPasswordToken(); // This method hashes and saves token to model
        teacher.verificationToken = teacher.resetPasswordToken; // Store the hashed token
        teacher.resetPasswordToken = undefined; // Clear these specific fields as they are not for reset
        teacher.resetPasswordExpires = undefined;

        await teacher.save(); // This triggers the pre('save') hook to hash the password

        // 4. Send verification email
        await sendVerificationEmail(teacher.email, verificationToken); // Send the unhashed token

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
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body; // Use email, not username

        // 1. Find teacher by email
        const teacher = await Teacher.findOne({ email });
        if (!teacher) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        // 2. Check if email is verified
        if (!teacher.isVerified) {
            return res.status(401).json({ success: false, message: 'Please verify your email address to log in.' });
        }

        // 3. Compare password (using the method from Teacher model)
        const isMatch = await teacher.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid credentials." });
        }

        // 4. Generate JWT token
        const token = jwt.sign(
            { id: teacher._id }, // Ensure this matches what you expect for user ID
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        // 5. Return success response
        res.status(200).json({
            success: true,
            message: "Logged in successfully!",
            token,
            userId: teacher._id, // Renamed from teacherId to userId for consistency
            email: teacher.email // Use email instead of username
        });

    } catch (error) {
        console.error('Login error:', error.message);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
};

// --- NEW FUNCTION: Verify Email Address ---
// @desc    Verify User's Email
// @route   GET /auth/verify-email?token=<token>
// @access  Public
exports.verifyEmail = async (req, res) => {
    const { token } = req.query; // Token from URL query parameter

    if (!token) {
        return res.status(400).json({ success: false, message: 'No verification token provided.' });
    }

    // Hash the incoming token from the URL to compare with the HASHED token in the database
    const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    try {
        const teacher = await Teacher.findOne({ verificationToken: hashedToken });

        if (!teacher) {
            return res.status(400).json({ success: false, message: 'Invalid or expired verification link.' });
        }

        teacher.isVerified = true; // Mark as verified
        teacher.verificationToken = undefined; // Clear the token after use

        await teacher.save(); // Save the updated teacher document

        res.status(200).json({ success: true, message: 'Email verified successfully! You can now log in.' });
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({ success: false, message: 'Server error during email verification.' });
    }
};


// --- NEW FUNCTION: Request Password Reset Link ---
// @desc    Request Password Reset Link
// @route   POST /auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, message: 'Please provide an email address.' });
    }

    try {
        const teacher = await Teacher.findOne({ email });

        // IMPORTANT: Always send a generic success message to prevent email enumeration attacks.
        // This prevents an attacker from knowing which emails are registered in your system.
        if (!teacher) {
            console.log(`Forgot password requested for non-existent email: ${email}`);
            return res.status(200).json({
                success: true,
                message: 'If an account with that email exists, a password reset link has been sent to your inbox.'
            });
        }

        // Generate reset token and save to database
        // The getResetPasswordToken method in Teacher model hashes the token and sets expiry
        const resetToken = teacher.getResetPasswordToken();
        await teacher.save({ validateBeforeSave: false }); // Save without re-validating password (it hasn't changed)

        // Send email with the reset link
        const emailResult = await sendPasswordResetEmail(teacher.email, resetToken);

        if (!emailResult.success) {
            // Log the error but still send generic success to user for security
            console.error(`Error sending password reset email to ${teacher.email}:`, emailResult.error);
            // Even if email sending fails, we respond with a generic success for security.
            // A more robust system might use a queue for emails and retry.
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

// --- NEW FUNCTION: Reset Password ---
// @desc    Reset User Password
// @route   POST /auth/reset-password
// @access  Public
exports.resetPassword = async (req, res) => {
    // Get token and newPassword from the request body (as frontend sends them this way)
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }

    // Hash the incoming token from the client to compare with the HASHED token in the database
    const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    try {
        const teacher = await Teacher.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() } // Check if token exists and is not expired
        });

        if (!teacher) {
            return res.status(400).json({ success: false, message: 'Invalid or expired password reset link.' });
        }

        // Basic password validation
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
        }

        // Set new password (the pre-save hook in Teacher model will automatically hash it)
        teacher.password = newPassword;
        teacher.resetPasswordToken = undefined; // Clear the token after use
        teacher.resetPasswordExpires = undefined; // Clear the expiration after use

        await teacher.save(); // Save the updated teacher document

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
    verifyEmail, // Make sure to uncomment and use this if you have the frontend for it
    forgotPassword,
    resetPassword
};