const socketIo = require("socket.io");
require("dotenv").config();

// Store active timers per sessionCode in memory
// NOTE: This data will be lost if the server restarts.
const activeTimers = {}; // Keep this here for now, or move to timer.js

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinSession', (sessionCode) => {
        socket.join(sessionCode);
        console.log(`User ${socket.id} joined session room: ${sessionCode}`);

        // Handle initial timer state sync
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
        } else {
            socket.emit('timerUpdate', { isRunning: false, timeLeft: 0 });
        }

        // <-- NEW: Call the objective handler for this socket/session
        handleObjectiveEvents(socket, sessionCode);

        // Call the timer handler for this socket/session
        // (You would uncomment this when you create timer.js)
        // handleTimerEvents(socket, sessionCode);
    });

    // --- Timer Event Listeners (Temporarily still here, will move to timer.js) ---
    // Event for the teacher to start/update the timer
    socket.on('startTimer', ({ sessionCode, isRunning, timeLeft }) => {
        console.log(`Teacher in session ${sessionCode} started/updated timer:`, { isRunning, timeLeft });
        activeTimers[sessionCode] = { isRunning, timeLeft, startTime: Date.now() };
        io.to(sessionCode).emit('timerUpdate', { isRunning, timeLeft });
    });

    // Event for the teacher to pause the timer
    socket.on('pauseTimer', ({ sessionCode, timeLeft }) => {
        console.log(`Teacher in session ${sessionCode} paused timer. Time left: ${timeLeft}`);
        if (activeTimers[sessionCode]) {
            activeTimers[sessionCode].isRunning = false;
            activeTimers[sessionCode].timeLeft = timeLeft;
        }
        io.to(sessionCode).emit('timerUpdate', { isRunning: false, timeLeft });
    });

    // Event for the teacher to reset the timer
    socket.on('resetTimer', (sessionCode) => {
        console.log(`Teacher in session ${sessionCode} reset timer.`);
        delete activeTimers[sessionCode];
        io.to(sessionCode).emit('timerReset', { isRunning: false, timeLeft: 0 });
    });
    // --- End of Timer Event Listeners to be moved ---

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});


module.exports = activeTimers;