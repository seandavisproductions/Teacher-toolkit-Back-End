const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const TeacherSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  sessionCode: { type: String, default: "" } // Unique per teacher
});

// Encrypt password before saving
TeacherSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

module.exports = mongoose.model("Teacher", TeacherSchema);