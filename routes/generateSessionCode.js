const express = require("express");
const router = express.Router();
const Session = require("../models/Session");

// POST /session/generate
router.post("/generate", async (req, res) => {
  const { teacherId } = req.body;
  if (!teacherId) {
    return res.status(400).json({ error: "Missing teacherId" });
  }
  
  // Generate a new random session code on the server side
  const sessionCode = Math.random().toString(36).substr(2, 6).toUpperCase();

  try {
    // Optionally, delete any previous active session for the teacher
    await Session.findOneAndDelete({ teacher: teacherId });
    
    // Create a new session document with the generated code and teacherId.
    const session = new Session({ code: sessionCode, teacher: teacherId });
    await session.save();
    
    // Respond with the new session document. 
    // The frontend can then read session.code to display it.
    return res.status(200).json({ success: true, session });
  } catch (error) {
    console.error("Error generating session:", error);
    return res.status(500).json({ error: "Server error" });
  }
});



// POST /session/validate
router.post("/validate", async (req, res) => {
  const { sessionCode } = req.body;
  if (!sessionCode) {
    return res.status(400).json({ success: false, error: "Missing sessionCode" });
  }
  try {
    // Find a session that matches the provided code
    const session = await Session.findOne({ code: sessionCode });
    if (!session) {
      return res.status(401).json({ success: false, error: "Invalid session code" });
    }
    // If needed, you can perform additional checks here
    res.status(200).json({ success: true, session });
  } catch (error) {
    console.error("Validation error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;