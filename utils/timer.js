// socketHandlers/timer.js

// No need for socketIo = require("socket.io") or require("dotenv") here.
// These are handled in server.js.

// In-memory store for active timers per sessionCode
const activeTimers = {};

// This module will export a function that takes the `io` instance as an argument.
module.exports = (io) => {
    /**
     * Handles Socket.IO timer-related events.
     * @param {Socket} socket The client socket.
     * @param {string} sessionCode The session code the client is part of.
     */
    const handleTimerEvents = (socket, sessionCode) => {

        // When a client joins, send them the current timer state for their session
        if (activeTimers[sessionCode]) {
            let currentActualTimeLeft = activeTimers[sessionCode].timeLeft;
            if (activeTimers[sessionCode].isRunning) {
                const elapsedTime = Math.floor((Date.now() - activeTimers[sessionCode].startTime) / 1000);
                currentActualTimeLeft = Math.max(0, activeTimers[sessionCode].timeLeft - elapsedTime);
            }
            socket.emit('timerUpdate', {
                isRunning: activeTimers[sessionCode].isRunning && currentActualTimeLeft > 0,
                timeLeft: currentActualTimeLeft
            });
            console.log(`Sent existing timer state for ${sessionCode}: ${currentActualTimeLeft} to ${socket.id}`);
        } else {
            socket.emit('timerUpdate', { isRunning: false, timeLeft: 0 });
            console.log(`No existing timer found for ${sessionCode}. Sent default state to ${socket.id}.`);
        }


        // Event for the teacher to start/update the timer
        socket.on('startTimer', ({ sessionCode: incomingSessionCode, isRunning, timeLeft }) => {
            if (incomingSessionCode === sessionCode) {
                console.log(`Teacher in session ${sessionCode} started/updated timer:`, { isRunning, timeLeft });
                activeTimers[sessionCode] = { isRunning, timeLeft, startTime: Date.now() };
                io.to(sessionCode).emit('timerUpdate', { isRunning, timeLeft });
            } else {
                console.warn(`Attempt to start timer for mismatching session: ${incomingSessionCode} by socket in ${sessionCode}`);
            }
        });

        // Event for the teacher to pause the timer
        socket.on('pauseTimer', ({ sessionCode: incomingSessionCode, timeLeft }) => {
            if (incomingSessionCode === sessionCode) {
                console.log(`Teacher in session ${sessionCode} paused timer. Time left: ${timeLeft}`);
                if (activeTimers[sessionCode]) {
                    activeTimers[sessionCode].isRunning = false;
                    activeTimers[sessionCode].timeLeft = timeLeft;
                }
                io.to(sessionCode).emit('timerUpdate', { isRunning: false, timeLeft });
            } else {
                console.warn(`Attempt to pause timer for mismatching session: ${incomingSessionCode} by socket in ${sessionCode}`);
            }
        });

        // Event for the teacher to reset the timer
        socket.on('resetTimer', (incomingSessionCode) => {
            if (incomingSessionCode === sessionCode) {
                console.log(`Teacher in session ${sessionCode} reset timer.`);
                delete activeTimers[sessionCode];
                io.to(sessionCode).emit('timerReset', { isRunning: false, timeLeft: 0 });
            } else {
                console.warn(`Attempt to reset timer for mismatching session: ${incomingSessionCode} by socket in ${sessionCode}`);
            }
        });

        // No need for a disconnect listener here unless there's timer-specific cleanup on disconnect
        // (e.g., if a teacher's disconnect should clear a specific timer, which is often session-based anyway).
    };

    // Export the handler function and potentially the activeTimers object if you need it elsewhere (unlikely)
    return { handleTimerEvents, activeTimers };
};