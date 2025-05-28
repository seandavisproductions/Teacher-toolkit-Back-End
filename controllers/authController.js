// controllers/authController.js
const Teacher = require("../models/Teacher");
const jwt = require("jsonwebtoken");
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { sendVerificationEmail, sendPasswordResetEmail } = require("../utils/emailService");

// Initialize Google OAuth2Client with your backend's Google Client ID
console.log('Backend Init: Initializing OAuth2Client.');
console.log('Backend Init: GOOGLE_CLIENT_ID for OAuth2Client:', process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// --- NEW HELPER FUNCTIONS FOR SESSION CODE ---
const generateRandomCode = () => {
    // Generates a random 6-character alphanumeric string
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

const findOrCreateTeacherSessionCode = async (teacher) => {
    if (teacher.currentSessionCode) {
        console.log(`Teacher ${teacher._id} already has a session code: ${teacher.currentSessionCode}`);
        return teacher.currentSessionCode;
    }

    let code;
    let isUnique = false;
    console.log(`Generating new unique session code for teacher ${teacher._id}...`);
    while (!isUnique) {
        code = generateRandomCode();
        // Check if this generated code is already active for ANY other teacher
        const existingTeacherWithCode = await Teacher.findOne({ currentSessionCode: code });
        if (!existingTeacherWithCode) {
            isUnique = true;
        } else {
            console.log(`Generated code ${code} is not unique, trying again.`);
        }
    }

    teacher.currentSessionCode = code;
    // Use { validateBeforeSave: false } because we're just adding a session code,
    // not touching password or other schema-validated fields that might be empty.
    await teacher.save({ validateBeforeSave: false }); 
    console.log(`Assigned new session code ${code} to teacher ${teacher._id}`);
    return code;
};
// --- END NEW HELPER FUNCTIONS ---


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

        // --- Use the session code helper ---
        const sessionCode = await findOrCreateTeacherSessionCode(teacher);

        res.status(200).json({
            success: true,
            message: "Logged in successfully!",
            token,
            userId: teacher._id,
            email: teacher.email,
            sessionCode: sessionCode // Return the actual dynamic code
        });

    } catch (error) {
        console.error('Login error:', error.message);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
};

// Google Login/Registration
const googleLogin = async (req, res) => {
    console.log('*** googleLogin function started ***');
    
    const { idToken } = req.body; 

    console.log('Request body received for Google Login:', req.body); 
    console.log('Received idToken (first 50 chars):', idToken ? idToken.substring(0, 50) + '...' : 'ID TOKEN IS MISSING/UNDEFINED - THIS SHOULD NOW NOT HAPPEN!'); 

    if (!idToken) { 
        console.warn('googleLogin: No ID token received. Returning 400.'); 
        return res.status(400).json({ success: false, message: 'Google ID token is required.' });
    }

    try {
        console.log('Attempting to verify ID token with Google...');
        console.log('Using GOOGLE_CLIENT_ID for audience:', process.env.GOOGLE_CLIENT_ID ? 'Set' : 'NOT SET'); 

        const ticket = await client.verifyIdToken({
            idToken: idToken,
            audience: process.env.GOOGLE_CLIENT_ID, 
        });
        console.log('ID token verified successfully with Google.');

        const payload = ticket.getPayload();
        console.log('Payload extracted from Google ticket:', payload); 
        const { sub: googleId, email, name } = payload;

        console.log(`Extracted from payload: googleId=${googleId}, email=${email}, name=${name}`);
        console.log('Searching for teacher in database...');

        let teacher = await Teacher.findOne({
            $or: [
                { googleId: googleId },
                { email: email }
            ]
        });
        console.log('Teacher database search complete. Teacher found:', teacher ? 'Yes, ID: ' + teacher._id : 'No, creating new.');

        if (teacher) {
            console.log('Existing teacher found. Checking for updates...');
            if (!teacher.googleId) {
                teacher.googleId = googleId;
                await teacher.save({ validateBeforeSave: false }); 
                console.log('Linked Google ID to existing teacher.');
            }
            if (!teacher.isVerified) {
                teacher.isVerified = true;
                teacher.verificationToken = undefined;
                await teacher.save({ validateBeforeSave: false });
                console.log('Existing teacher email marked as verified.');
            }

        } else {
            console.log('New user via Google. Creating new teacher record...');
            teacher = new Teacher({
                email: email,
                googleId: googleId,
                name: name || email, 
                isVerified: true, 
            });
            await teacher.save(); 
            console.log('New teacher created successfully with ID:', teacher._id);
        }

        // --- Use the session code helper ---
        const sessionCode = await findOrCreateTeacherSessionCode(teacher);

        console.log('Generating JWT token...');
        console.log('Using JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'NOT SET'); 

        if (!process.env.JWT_SECRET) {
            console.error('CRITICAL ERROR: JWT_SECRET environment variable is not configured!');
            throw new Error('JWT_SECRET environment variable is not configured on the server.');
        }

        const token = jwt.sign(
            { id: teacher._id },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );
        console.log('JWT token generated successfully.');

        console.log('Sending success response to frontend.');
        res.status(200).json({
            success: true,
            message: "Google login successful!",
            token,
            userId: teacher._id,
            email: teacher.email,
            sessionCode: sessionCode // Return the actual dynamic code
        });

    } catch (error) {
        console.error('*** GOOGLE LOGIN BACKEND ERROR CAUGHT IN TRY/CATCH ***');
        console.error('Error name:', error.name || 'N/A');
        console.error('Error message:', error.message || 'N/A');
        if (error.stack) {
            console.error('Error stack trace:', error.stack);
        }

        if (error.code === 'ERR_INVALID_ARG_VALUE') {
            console.error('Specific error: Invalid Google ID token or audience mismatch.');
            return res.status(401).json({ success: false, message: 'Invalid Google ID token. Please try again.' });
        }

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