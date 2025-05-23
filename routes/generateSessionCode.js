const express = require("express");
const router = express.Router();
const Session = require("../models/Session"); // Ensure the path is correct

// POST /generate
router.post("/generate", async (req, res) => {
  const { code, teacherId } = req.body;
  if (!code || !teacherId) {
    return res.status(400).json({ error: "Missing code or teacherId" });
  }

  try {
    // Optionally remove any previous session for this teacher so there's only one active session
    await Session.findOneAndDelete({ teacher: teacherId });

    // Create a new session entry with the given code and teacher reference
    const newSession = await Session.create({ code, teacher: teacherId });
    return res.status(200).json({ success: true, session: newSession });
  } catch (error) {
    console.error("Error generating session code:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;