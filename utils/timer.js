// Object to hold timer information for unique sessions.
const sessionTimers = {};

/**
 * Starts a countdown for a given session.
 * @param {string} sessionCode - The code/identifier for the session.
 * @param {number} duration - The countdown duration in seconds.
 * @param {object} io - The Socket.IO instance to emit timer updates.
 * @returns {number} The initial timeLeft.
 */
function startCountdown(sessionCode, duration, io) {
  // Clear existing timer for this session if any.
  if (sessionTimers[sessionCode] && sessionTimers[sessionCode].interval) {
    clearInterval(sessionTimers[sessionCode].interval);
  }

  // Initialize the timer data.
  sessionTimers[sessionCode] = {
    timeLeft: duration,
    interval: setInterval(() => {
      // Decrement the countdown.
      sessionTimers[sessionCode].timeLeft -= 1;

      // Emit an update to all clients in the session's room.
      io.to(sessionCode).emit("countdownUpdate", {
        timeLeft: sessionTimers[sessionCode].timeLeft,
        status: sessionTimers[sessionCode].timeLeft <= 0 ? "finished" : "running",
      });

      // When the timer reaches zero, stop the countdown.
      if (sessionTimers[sessionCode].timeLeft <= 0) {
        clearInterval(sessionTimers[sessionCode].interval);
      }
    }, 1000),
  };

  return sessionTimers[sessionCode].timeLeft;
}

/**
 * Stops the countdown for a given session.
 * @param {string} sessionCode - The code/identifier for the session.
 * @returns {boolean} True if a timer was found and stopped; otherwise, false.
 */
function stopCountdown(sessionCode) {
  if (sessionTimers[sessionCode] && sessionTimers[sessionCode].interval) {
    clearInterval(sessionTimers[sessionCode].interval);
    delete sessionTimers[sessionCode];
    return true;
  }
  return false;
}

module.exports = { startCountdown, stopCountdown };