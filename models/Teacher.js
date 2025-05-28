// models/Teacher.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const TeacherSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/.+@.+\..+/, "Please enter a valid email address"],
  },
  password: {
    type: String,
    required: function() { return !this.googleId; },
    minlength: [6, "Password must be at least 6 characters long"],
    select: false,
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
    select: false,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  verificationToken: String,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  name: {
    type: String,
    trim: true
  },
  // --- NEW FIELD FOR SESSION CODE ---
  currentSessionCode: {
    type: String,
    unique: true, // Ensure each active session code is unique across all teachers
    sparse: true, // Allows multiple teachers to have a null/undefined sessionCode
    maxLength: 6, // E.g., a 6-character code
    minlength: 6 // Ensure it's exactly 6 characters
  },
}, { timestamps: true });

// Hash password before saving
TeacherSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
TeacherSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate and hash password reset token (reused for email verification token)
TeacherSchema.methods.getResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(20).toString("hex");
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  return resetToken;
};

const Teacher = mongoose.model("Teacher", TeacherSchema);

module.exports = Teacher;