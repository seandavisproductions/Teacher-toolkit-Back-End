// routes/authRoutes.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// --- Existing Auth Routes ---
router.post("/login", authController.login);
router.post("/register", authController.register);

// --- NEW Google Auth Route ---
router.post("/google-login", authController.googleLogin); // <-- NEW ROUTE

// --- Other Auth Routes ---
router.get("/verify-email", authController.verifyEmail);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

module.exports = router;