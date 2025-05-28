// routes/authRoutes.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController"); // Import the entire controller object

// --- Existing Auth Routes ---
router.post("/login", authController.login);
router.post("/register", authController.register);

// --- NEW Auth Routes ---

// @route   GET /auth/verify-email
// @desc    Verify user's email with a token from the link
// @access  Public
router.get("/verify-email", authController.verifyEmail);

// @route   POST /auth/forgot-password
// @desc    Request a password reset link (sends email)
// @access  Public
router.post("/forgot-password", authController.forgotPassword);

// @route   POST /auth/reset-password
// @desc    Reset user's password with a token and new password
// @access  Public
router.post("/reset-password", authController.resetPassword);

module.exports = router;