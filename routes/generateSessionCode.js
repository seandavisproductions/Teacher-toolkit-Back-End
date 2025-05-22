const express = require("express");
const Session = require("../models/Session");
const Teacher = require("../models/Teacher");
const router = express.Router();

// Create or update a session code for a teacher
router.post("/generate", async (req, res) => {
  try {
    console.log("/session/generate POST body:", req.body); // Debug log
    const { code, teacherId } = req.body;
    if (!code || !teacherId) return res.status(400).json({ error: "Missing code or teacherId" });

    // Remove any previous session for this teacher (one active session per teacher)
    await Session.deleteMany({ teacher: teacherId });

    // Create new session
    const session = new Session({ code, teacher: teacherId });
    await session.save();
    res.status(201).json({ message: "Session code created", session });
  } catch (error) {
    console.error("Error saving session code:", error); // Debug log
    res.status(400).json({ error: error.message });
  }
});

// Validate a session code (for students to join)
router.get("/validate/:code", async (req, res) => {
  try {
    const session = await Session.findOne({ code: req.params.code });
    if (!session) return res.status(404).json({ error: "Session code not found" });
    res.json({ valid: true, teacher: session.teacher });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
