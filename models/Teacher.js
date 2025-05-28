// models/Teacher.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs"); // For password hashing
const crypto = require("crypto");   // For generating password reset tokens

const TeacherSchema = new mongoose.Schema({
  // Changed from 'username' to 'email' to match frontend and enable password reset
  email: {
    type: String,
    required: true,
    unique: true, // Email must be unique for each teacher
    lowercase: true, // Store emails in lowercase for consistency
    trim: true, // Remove whitespace
  },
  password: {
    type: String,
    required: true,
    minlength: 6, // Recommended minimum length for security
  },
  // --- Fields for Email Verification (from previous discussions) ---
  isVerified: {
    type: Boolean,
    default: false, // New users are unverified by default
  },
  verificationToken: String, // Token sent for email verification
  // --- END Email Verification Fields ---

  // --- Fields for Forgot Password / Reset Password ---
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  // --- END Forgot Password Fields ---

  // You can add other fields here if needed, e.g., name, etc.
}, { timestamps: true }); // Adding timestamps is good practice for created/updated dates


// --- PRE-SAVE HOOK: HASH PASSWORD BEFORE SAVING ---
// This middleware runs before a document is saved.
// It will hash the password ONLY if it has been modified (e.g., on registration or password reset).
TeacherSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next(); // If password hasn't changed, move on
  }
  try {
    const salt = await bcrypt.genSalt(10); // Generate a salt
    this.password = await bcrypt.hash(this.password, salt); // Hash the password
    next();
  } catch (error) {
    next(error); // Pass any errors to Mongoose
  }
});

// --- INSTANCE METHOD: COMPARE PASSWORD ---
// This method will be available on every Teacher document to compare a plain-text password
// with the hashed password stored in the database.
TeacherSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// --- INSTANCE METHOD: GENERATE PASSWORD RESET TOKEN ---
// This method generates a unique token for password reset, hashes it for storage,
// sets an expiration, and returns the unhashed token to be sent to the user.
TeacherSchema.methods.getResetPasswordToken = function () {
  // Generate a random token
  const resetToken = crypto.randomBytes(20).toString("hex");

  // Hash the token and save it to the resetPasswordToken field
  // This is to prevent timing attacks and ensure even if DB is compromised, raw token is not visible
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // Set the expiration time (e.g., 1 hour from now)
  this.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour in milliseconds

  return resetToken; // Return the unhashed token to be sent in the email
};


module.exports = mongoose.model("Teacher", TeacherSchema);