const express = require("express");
const router = express.Router();
const Session = require("../models/Session");
// Assuming you still need to link Teacher for currentSessionCode logic
const Teacher = require('../models/Teacher'); 

// POST /session/generate - UPDATED TO USE TEACHER'S currentSessionCode FIELD
// This route should now be handled by your authController.js or a dedicated teacher session controller,
// as the session code is tied to the Teacher model now.
// However, if you're keeping a separate Session model, you'd need to ensure
// it syncs with the Teacher's currentSessionCode.
// For now, let's assume this route is for the OLD way or a separate mechanism.
router.post("/generate", async (req, res) => {
  const { teacherId } = req.body; // In the new setup, teacherId comes from JWT
  if (!teacherId) {
    // If this is called by a logged-in teacher, req.user.id would be used
    return res.status(401).json({ error: "Authentication required to generate session code." });
  }
  
  // In the new setup, this generation logic moved to authController.js's findOrCreateTeacherSessionCode
  // This route might become obsolete or need to be modified significantly.
  // For now, if you are still using a separate Session model, you might need to adapt it.

  // The previous implementation of generateSessionCode (which you provided)
  // was generating a new code and saving it to a separate Session model.
  // The new approach (from previous explanations) is to store currentSessionCode
  // directly on the Teacher model.
  // If you want to keep the separate Session model AND link it to Teacher,
  // this route would need to fetch the teacher's currentSessionCode,
  // or update the Session model to reflect the Teacher's currentSessionCode.
  // For simplicity, let's assume you're keeping this separate for now,
  // but be aware of potential inconsistencies with Teacher.currentSessionCode.

  const sessionCode = Math.random().toString(36).substr(2, 6).toUpperCase();

  try {
    await Session.findOneAndDelete({ teacher: teacherId });
    
    const session = new Session({ code: sessionCode, teacher: teacherId });
    await session.save();
    
    // IMPORTANT: If you want to use the Teacher.currentSessionCode,
    // you must also update the teacher model here!
    const teacher = await Teacher.findById(teacherId);
    if (teacher) {
        teacher.currentSessionCode = sessionCode;
        await teacher.save({ validateBeforeSave: false });
    }


    return res.status(200).json({ success: true, session });
  } catch (error) {
    console.error("Error generating session:", error);
    return res.status(500).json({ error: "Server error" });
  }
});


// POST /session/validate - THE CRITICAL FIX IS HERE
router.post("/validate", async (req, res) => {
  const { sessionCode } = req.body;
  if (!sessionCode) {
    return res.status(400).json({ success: false, error: "Missing sessionCode" });
  }
  try {
    // Find a session that matches the provided code in the Session model
    const session = await Session.findOne({ code: sessionCode });

    // ALSO CHECK THE TEACHER MODEL, as that's where the *active* session code is now primarily stored
    const teacher = await Teacher.findOne({ currentSessionCode: sessionCode });


    if (!session && !teacher) { // Check both models for the code
      // Changed from 401 to 400 (Bad Request) or 404 (Not Found)
      // 400 is generally better for "invalid input"
      return res.status(400).json({ success: false, error: "Invalid session code" }); 
      // Or: return res.status(404).json({ success: false, error: "Session not found" });
    }

    // If you found a session in the 'Session' model and it's active, use it.
    // If you found a teacher with that code, that's also valid.
    // You might need to decide which model is the "source of truth" for active codes.
    // Based on our previous discussion, Teacher.currentSessionCode is the primary source.
    let foundSessionDetails = null;
    if (teacher) {
        // Construct a response that mimics a session object if it was only found on the teacher.
        // This keeps the frontend happy if it expects 'session' in the response.
        foundSessionDetails = { 
            code: teacher.currentSessionCode, 
            teacher: teacher._id,
            // Add other relevant teacher details if needed
        };
    } else if (session) {
        // If it was found in the old Session model (and not on a teacher, if that's a case)
        foundSessionDetails = session;
    }


    res.status(200).json({ success: true, session: foundSessionDetails }); // Respond with the validated session/teacher details

  } catch (error) {
    console.error("Validation error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;