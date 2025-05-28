// controllers/authController.js
const Teacher = require("../models/Teacher");
const jwt = require("jsonwebtoken");
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { sendVerificationEmail, sendPasswordResetEmail } = require("../utils/emailService");

// Initialize Google OAuth2Client with your backend's Google Client ID
// IMPORTANT: Make sure GOOGLE_CLIENT_ID is set in your backend's .env file on Render
console.log('Backend Init: Initializing OAuth2Client.');
console.log('Backend Init: GOOGLE_CLIENT_ID for OAuth2Client:', process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Register a teacher
const register = async (req, res) => {
    try {
        const { email, password } = req.body;

        let teacher = await Teacher.findOne({ email });
        if (teacher) {
            if (!teacher.isVerified) {
                return res.status(400).json({ success: false, message: 'User already exists, but email is not verified. Please check your inbox or try logging in.' });
            }
            return res.status(400).json({ success: false, message: 'User already exists with this email.' });
        }

        teacher = new Teacher({ email, password });

        const verificationToken = teacher.getResetPasswordToken();
        teacher.verificationToken = teacher.resetPasswordToken;
        teacher.resetPasswordToken = undefined;
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
const login = async (req, res) => {
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
            email: teacher.email,
            sessionCode: 'default_session_code'
        });

    } catch (error) {
        console.error('Login error:', error.message);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
};

// --- NEW FUNCTION: Google Login/Registration ---
const googleLogin = async (req, res) => {
    console.log('*** googleLogin function started ***'); // ENTRY POINT LOG
    
    // FIX IS HERE: Directly destructure 'idToken' from req.body
    const { idToken } = req.body; 

    console.log('Request body received for Google Login:', req.body); // Log entire incoming body
    console.log('Received idToken (first 50 chars):', idToken ? idToken.substring(0, 50) + '...' : 'ID TOKEN IS MISSING/UNDEFINED - THIS SHOULD NOW NOT HAPPEN!'); // This log should now show the ID token

    if (!idToken) { // This check will now correctly identify if idToken is truly missing.
        console.warn('googleLogin: No ID token received. Returning 400.'); // Log missing token
        return res.status(400).json({ success: false, message: 'Google ID token is required.' });
    }

    try {
        console.log('Attempting to verify ID token with Google...');
        console.log('Using GOOGLE_CLIENT_ID for audience:', process.env.GOOGLE_CLIENT_ID ? 'Set' : 'NOT SET'); // Double-check audience ID env var

        // 1. Verify the ID token with Google
        const ticket = await client.verifyIdToken({
            idToken: idToken,
            audience: process.env.GOOGLE_CLIENT_ID, // Use the same client ID that generated the token
        });
        console.log('ID token verified successfully with Google.');

        const payload = ticket.getPayload();
        console.log('Payload extracted from Google ticket:', payload); // Log the entire payload
        const { sub: googleId, email, name } = payload;

        console.log(`Extracted from payload: googleId=${googleId}, email=${email}, name=${name}`);
        console.log('Searching for teacher in database...');

        // 2. Find or Create Teacher in your database
        let teacher = await Teacher.findOne({
            $or: [
                { googleId: googleId },
                { email: email }
            ]
        });
        console.log('Teacher database search complete. Teacher found:', teacher ? 'Yes, ID: ' + teacher._id : 'No, creating new.');

        if (teacher) {
            console.log('Existing teacher found. Checking for updates...');
            // If they registered with email/password and now log in with Google,
            // link their Google ID if not already linked.
            if (!teacher.googleId) {
                teacher.googleId = googleId;
                await teacher.save({ validateBeforeSave: false }); // No password change, so skip validation
                console.log('Linked Google ID to existing teacher.');
            }
            // Ensure email is verified if logging in via Google
            if (!teacher.isVerified) {
                teacher.isVerified = true;
                teacher.verificationToken = undefined;
                await teacher.save({ validateBeforeSave: false });
                console.log('Existing teacher email marked as verified.');
            }

        } else {
            // New user via Google
            console.log('New user via Google. Creating new teacher record...');
            teacher = new Teacher({
                email: email,
                googleId: googleId,
                name: name || email, // Use name from Google, fallback to email
                isVerified: true, // Google accounts are implicitly verified
                // No password needed for Google-only sign-ups
            });
            await teacher.save(); // This will not hash a password, as none is provided.
            console.log('New teacher created successfully with ID:', teacher._id);
        }

        // 3. Generate JWT for the authenticated teacher
        console.log('Generating JWT token...');
        console.log('Using JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'NOT SET'); // Check JWT_SECRET env var

        if (!process.env.JWT_SECRET) {
            // This is a critical error if JWT_SECRET is not set
            console.error('CRITICAL ERROR: JWT_SECRET environment variable is not configured!');
            throw new Error('JWT_SECRET environment variable is not configured on the server.');
        }

        const token = jwt.sign(
            { id: teacher._id },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );
        console.log('JWT token generated successfully.');

        // 4. Send success response with token and user info
        console.log('Sending success response to frontend.');
        res.status(200).json({
            success: true,
            message: "Google login successful!",
            token,
            userId: teacher._id,
            email: teacher.email,
            sessionCode: 'default_session_code'
        });

    } catch (error) {
        // This catch block will log any errors that occur within the try block
        console.error('*** GOOGLE LOGIN BACKEND ERROR CAUGHT IN TRY/CATCH ***');
        console.error('Error name:', error.name || 'N/A');
        console.error('Error message:', error.message || 'N/A');
        if (error.stack) {
            console.error('Error stack trace:', error.stack);
        }

        // Specific error handling for invalid Google ID token
        if (error.code === 'ERR_INVALID_ARG_VALUE') {
            console.error('Specific error: Invalid Google ID token or audience mismatch.');
            return res.status(401).json({ success: false, message: 'Invalid Google ID token. Please try again.' });
        }

        // Generic 500 for other unexpected errors
        res.status(500).json({ success: false, message: 'Server error during Google login.' });
    }
};

// Verify Email Address
const verifyEmail = async (req, res) => {
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
const forgotPassword = async (req, res) => {
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
const resetPassword = async (req, res) => {
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
    googleLogin,
    verifyEmail,
    forgotPassword,
    resetPassword
};