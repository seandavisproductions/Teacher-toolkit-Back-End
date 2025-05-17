const express = require("express");
const bcrypt = require("bcryptjs");
const Teacher = require("../models/Teacher");

const router = express.Router();

// Register a teacher
router.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const newTeacher = new Teacher({ username, password: hashedPassword });
    await newTeacher.save();

    res.status(201).json({ message: "Teacher registered successfully!" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
