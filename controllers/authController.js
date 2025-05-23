const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const Teacher = require('../models/Teacher'); // Ensure you have a Teacher model defined

// POST /auth/register
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Missing username or password' });
  }

  try {
    // Check if the teacher already exists
    const existingTeacher = await Teacher.findOne({ username });
    if (existingTeacher) {
      return res.status(400).json({ success: false, error: 'Teacher already exists' });
    }

    // Hash the password (using 10 salt rounds)
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create a new teacher record. Mongoose will create the _id, which serves as teacherId.
    const newTeacher = new Teacher({ username, password: hashedPassword });
    await newTeacher.save();

    // Return a successful response containing the teacherId
    return res.status(200).json({ success: true, teacherId: newTeacher._id });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({ success: false, error: 'Registration error' });
  }
});

module.exports = router;