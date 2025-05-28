// models/Teacher.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto"); // For reset tokens

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
    // Password is not required if googleId is present (for Google-only sign-ups)
    required: function() { return !this.googleId; },
    minlength: [6, "Password must be at least 6 characters long"],
    select: false, // Don't return password by default in queries
  },
  googleId: { // <-- NEW FIELD
    type: String,
    unique: true,
    sparse: true, // Allows multiple documents to have a null value for googleId
    select: false, // Don't return googleId by default in queries
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  verificationToken: String, // Stored as hashed token
  resetPasswordToken: String, // Stored as hashed token
  resetPasswordExpires: Date,
  // Add other fields as needed, e.g., name, avatar, etc.
  name: { // Assuming Google provides a name
    type: String,
    trim: true
  },
}, { timestamps: true });

// Hash password before saving
TeacherSchema.pre("save", async function (next) {
  // Only hash the password if it's new or has been modified and is actually set
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
  // Generate token (random bytes)
  const resetToken = crypto.randomBytes(20).toString("hex");

  // Hash token and set to resetPasswordToken field (or verificationToken field)
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // Set expire
  this.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour

  return resetToken; // Return the unhashed token to the user/for email
};


const Teacher = mongoose.model("Teacher", TeacherSchema);

module.exports = Teacher;