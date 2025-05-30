// utils/timer.js

// In-memory store for active timers per sessionCode
// Stores { sessionCode: { timeLeft: number, isRunning: boolean, intervalId: any, lastSyncTime: number } }
const sessionTimers = {};

// This module will export a function that takes the `io` instance as an argument.
module.exports = (io) => {
    /**
     * Handles Socket.IO timer-related events.
     * @param {Socket} socket The client socket.
     * @param {string} sessionCode The session code the client is part of.
     */
    const handleTimerEvents = (socket, sessionCode) => {
 // --- ADD THIS LINE FOR DEBUGGING ---
        console.log(`[TimerHandler] DEBUG: handleTimerEvents called for socket ${socket.id}. sessionCode type: ${typeof sessionCode}, value:`, sessionCode);
        // --- END DEBUG LINE ---
        // Initialize session timer if it doesn't exist
        if (!sessionTimers[sessionCode]) {
            sessionTimers[sessionCode] = {
                timeLeft: 0,
                isRunning: false,
                intervalId: null,
                lastSyncTime: Date.now() // Track last time timer state was truly updated/synced
            };
        }

        // When a client joins, send them the current timer state for their session
        let currentActualTimeLeft = sessionTimers[sessionCode].timeLeft;
        if (sessionTimers[sessionCode].isRunning) {
            const elapsedTimeSinceLastServerAction = Math.floor((Date.now() - sessionTimers[sessionCode].lastSyncTime) / 1000);
            currentActualTimeLeft = Math.max(0, sessionTimers[sessionCode].timeLeft - elapsedTimeSinceLastServerAction);
        }

        socket.emit('timerUpdate', {
            isRunning: sessionTimers[sessionCode].isRunning && currentActualTimeLeft > 0,
            timeLeft: currentActualTimeLeft
        });
        console.log(`[TimerHandler] Sent existing timer state for session ${sessionCode} to socket ${socket.id}: ${currentActualTimeLeft}s, running: ${sessionTimers[sessionCode].isRunning}`);


      // Locate this section in your src/utils/timer.js file and REPLACE it with the following:

        // Event for the teacher to start/update the timer
        socket.on('startTimer', (data) => {
            const { sessionCode: incomingSessionCode, isRunning: clientIsRunning, timeLeft: clientTimeLeft } = data;

            if (incomingSessionCode === sessionCode) {
                console.log(`[TimerHandler] Received 'startTimer' for session ${sessionCode}: isRunning=${clientIsRunning}, timeLeft=${clientTimeLeft}`);

                const timer = sessionTimers[sessionCode];

                // --- NEW LOGIC FOR HANDLING START/STOP/PRESET ---

                // ALWAYS clear any existing interval if a new command comes in,
                // to prevent multiple intervals running or stale ones.
                if (timer.intervalId) {
                    clearInterval(timer.intervalId);
                    timer.intervalId = null;
                    console.log(`[TimerHandler] Debug: Cleared existing interval for ${sessionCode}.`);
                }

                if (clientIsRunning) { // This condition covers both starting a stopped timer AND setting a new PRESET
                    timer.timeLeft = clientTimeLeft; // ALWAYS update timeLeft to the value sent by client
                    timer.isRunning = true;
                    timer.lastSyncTime = Date.now(); // Record when the server truly set the state

                    // Only start the new interval if the time is positive
                    if (timer.timeLeft > 0) {
                        timer.intervalId = setInterval(() => {
                            if (timer.timeLeft > 0) {
                                timer.timeLeft--; // Decrement time on the server
                                io.to(sessionCode).emit('timerUpdate', {
                                    timeLeft: timer.timeLeft,
                                    isRunning: timer.isRunning
                                });
                            } else {
                                // Timer reached zero
                                clearInterval(timer.intervalId);
                                timer.intervalId = null;
                                timer.isRunning = false;
                                timer.timeLeft = 0; // Ensure it's exactly 0
                                io.to(sessionCode).emit('timerUpdate', {
                                    timeLeft: 0,
                                    isRunning: false
                                });
                                console.log(`[TimerHandler] Timer for session ${sessionCode} reached 0.`);
                            }
                        }, 1000); // Update every second

                        // Immediately send an update so clients don't wait for the first second
                        io.to(sessionCode).emit('timerUpdate', {
                            timeLeft: timer.timeLeft,
                            isRunning: timer.isRunning
                        });
                        console.log(`[TimerHandler] Server-side timer started for session ${sessionCode}.`);
                    } else {
                        // Client wants to start but sent 0 or negative time, so just update state and broadcast
                        timer.isRunning = false; // Ensure it's not running
                        io.to(sessionCode).emit('timerUpdate', {
                            timeLeft: timer.timeLeft, // Will be 0 or whatever was sent
                            isRunning: timer.isRunning
                        });
                        console.log(`[TimerHandler] Server-side timer NOT started for session ${sessionCode}: timeLeft was 0 or less.`);
                    }

                } else { // clientIsRunning is false: Client wants to STOP the timer
                    // The interval was already cleared at the top of the handler.
                    timer.isRunning = false;
                    timer.lastSyncTime = Date.now(); // Update sync time for the paused state

                    io.to(sessionCode).emit('timerUpdate', {
                        timeLeft: timer.timeLeft, // Use server's last known time
                        isRunning: timer.isRunning
                    });
                    console.log(`[TimerHandler] Server-side timer stopped for session ${sessionCode} at ${timer.timeLeft}s.`);
                }
            } else {
                console.warn(`[TimerHandler] Attempt to start timer for mismatching session: ${incomingSessionCode} by socket in ${sessionCode}`);
            }
        });


        // Event for the teacher to reset the timer
        socket.on('resetTimer', (incomingSessionCode) => {
            if (incomingSessionCode === sessionCode) {
                console.log(`[TimerHandler] Teacher in session ${sessionCode} reset timer.`);
                const timer = sessionTimers[sessionCode];
                if (timer && timer.intervalId) {
                    clearInterval(timer.intervalId);
                    timer.intervalId = null;
                }
                timer.timeLeft = 0;
                timer.isRunning = false;
                timer.lastSyncTime = Date.now(); // Update sync time for reset

                io.to(sessionCode).emit('timerReset', { isRunning: false, timeLeft: 0 }); // Use 'timerReset' for full reset
                console.log(`[TimerHandler] Server-side timer reset for session ${sessionCode}.`);
            } else {
                console.warn(`[TimerHandler] Attempt to reset timer for mismatching session: ${incomingSessionCode} by socket in ${sessionCode}`);
            }
        });

        // The 'pauseTimer' event from your frontend code is NOT used.
        // The frontend's 'toggleStartStop' already sends {isRunning: false, timeLeft}
        // which the 'startTimer' handler now uses to stop the timer.
        // You can remove the 'pauseTimer' event listener from this file if not explicitly needed.

        // Clean up interval if socket disconnects and was the last controller of the timer (optional, for robustness)
        // For a shared timer, usually it just keeps running.
    };

    // Export the handler function
    return { handleTimerEvents, sessionTimers };
};