const express = require("express");
const bcrypt = require("bcryptjs");
const Teacher = require("../models/Teacher");
const router = express.Router();
module.exports = router;


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

const jwt = require("jsonwebtoken");

// Login a teacher
router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const teacher = await Teacher.findOne({ username });
        if (!teacher) return res.status(404).json({ error: "User not found" });

        const isMatch = await bcrypt.compare(password, teacher.password);
        if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

        const jwt = require("jsonwebtoken");
        const token = jwt.sign(
            { id: teacher._id, sessionId: teacher.sessionId },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        res.json({ token, sessionId: teacher.sessionId, username: teacher.username });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});
