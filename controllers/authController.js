const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Teacher = require("../models/Teacher");

// Register a teacher
exports.register = async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const newTeacher = new Teacher({ username, password: hashedPassword });
    await newTeacher.save();

    res.status(201).json({ message: "Teacher registered successfully!" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Login a teacher
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const teacher = await Teacher.findOne({ username });
    if (!teacher) return res.status(404).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, teacher.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: teacher._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ token, username: teacher.username });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
