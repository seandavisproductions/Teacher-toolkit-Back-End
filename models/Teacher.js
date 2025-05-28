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
    // Password is required only if googleId is NOT present (for traditional email/password login)
    required: function() { return !this.googleId; }, 
    minlength: [6, "Password must be at least 6 characters long"],
    select: false, // Don't return the password by default when querying
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true, // Allows null values, but unique for non-null values
    select: false, // Don't return the googleId by default when querying
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  verificationToken: String, // Used for email verification links
  resetPasswordToken: String, // Used for password reset links
  resetPasswordExpires: Date, // Expiry date for reset token
  name: {
    type: String,
    trim: true
  },
  // --- NEW FIELD ADDED FOR SESSION CODE ---
  currentSessionCode: {
    type: String,
    unique: true, // Ensures each active session code is unique across all teachers
    sparse: true, // Allows multiple teachers to have a null/undefined sessionCode (no active code yet)
    maxLength: 6, // E.g., a 6-character alphanumeric code
    minlength: 6 // Ensures it's exactly 6 characters when present
  },
}, { timestamps: true }); // Automatically adds createdAt and updatedAt fields

// Middleware to hash the password before saving a teacher document
TeacherSchema.pre("save", async function (next) {
  // Only hash the password if it's new or has been modified and it exists
  // The `!this.password` check is important for Google login where password might not be set
  if (!this.isModified("password") || !this.password) {
    return next();
  }
  const salt = await bcrypt.genSalt(10); // Generate a salt
  this.password = await bcrypt.hash(this.password, salt); // Hash the password
  next();
});

// Method to compare entered password with the hashed password in the database
TeacherSchema.methods.comparePassword = async function (enteredPassword) {
  // 'this.password' needs 'select: false' to be temporarily overridden for comparison
  // to work if the password was not selected in the query. Mongoose handles this internally.
  return await bcrypt.compare(enteredPassword, this.password);
};

// Method to generate and hash a password reset token (reused for email verification token)
TeacherSchema.methods.getResetPasswordToken = function () {
  // Generate a random token
  const resetToken = crypto.randomBytes(20).toString("hex");

  // Hash the token and store it in the schema (resetPasswordToken field)
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // Set token expiry time (e.g., 1 hour from now)
  this.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour in milliseconds

  // Return the unhashed token to be sent to the user (e.g., in an email)
  return resetToken;
};

// Create the Teacher model from the schema
const Teacher = mongoose.model("Teacher", TeacherSchema);

module.exports = Teacher;