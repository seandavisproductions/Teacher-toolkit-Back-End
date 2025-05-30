// src/utils/timer.js

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
        console.log(`[TimerHandler] DEBUG: handleTimerEvents called for socket ${socket.id}. sessionCode type: ${typeof sessionCode}, value:`, sessionCode);

        // Initialize session timer if it doesn't exist
        if (!sessionTimers[sessionCode]) {
            console.log(`[TimerHandler] DEBUG: Initializing new session timer for ${sessionCode}.`);
            sessionTimers[sessionCode] = {
                timeLeft: 0,
                isRunning: false,
                intervalId: null,
                lastSyncTime: Date.now() // Track last time timer state was truly updated/synced
            };
        } else {
            console.log(`[TimerHandler] DEBUG: Session timer already exists for ${sessionCode}. Current state:`, JSON.stringify(sessionTimers[sessionCode]));
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


        // Event for the teacher to start/update the timer
        socket.on('startTimer', (data) => {
            const { sessionCode: incomingSessionCode, isRunning: clientIsRunning, timeLeft: clientTimeLeft } = data;

            if (incomingSessionCode === sessionCode) {
                console.log(`[TimerHandler] Received 'startTimer' for session ${sessionCode}: isRunning=${clientIsRunning}, timeLeft=${clientTimeLeft}`);
                console.log(`[TimerHandler] DEBUG: Current timer state BEFORE processing:`, JSON.stringify(sessionTimers[sessionCode]));

                const timer = sessionTimers[sessionCode];

                // ALWAYS clear any existing interval if a new command comes in,
                // to prevent multiple intervals running or stale ones.
                if (timer.intervalId) {
                    clearInterval(timer.intervalId);
                    timer.intervalId = null;
                    console.log(`[TimerHandler] Debug: Cleared existing interval for ${sessionCode}. Interval ID was: ${timer.intervalId}`);
                } else {
                    console.log(`[TimerHandler] Debug: No existing interval to clear for ${sessionCode}.`);
                }

                if (clientIsRunning) { // Client wants to START or set a new PRESET
                    console.log(`[TimerHandler] DEBUG: Client wants to START/PRESET. Setting new timeLeft: ${clientTimeLeft}`);
                    timer.timeLeft = clientTimeLeft; // ALWAYS update timeLeft to the value sent by client
                    timer.isRunning = true;
                    timer.lastSyncTime = Date.now(); // Record when the server truly set the state

                    // Only start the new interval if the time is positive
                    console.log(`[TimerHandler] DEBUG: Checking condition to start setInterval: timer.timeLeft=${timer.timeLeft}, timer.isRunning=${timer.isRunning}`);
                    if (timer.timeLeft > 0) {
                        console.log(`[TimerHandler] DEBUG: Condition met. Calling setInterval to start timer.`);
                        timer.intervalId = setInterval(() => {
                            if (timer.timeLeft > 0) {
                                timer.timeLeft--; // Decrement time on the server
                                io.to(sessionCode).emit('timerUpdate', {
                                    timeLeft: timer.timeLeft,
                                    isRunning: timer.isRunning
                                });
                                // console.log(`[TimerHandler] DEBUG: Timer ticked for ${sessionCode}. New timeLeft: ${timer.timeLeft}`); // Uncomment for very verbose logging
                            } else {
                                // Timer reached zero
                                console.log(`[TimerHandler] DEBUG: Timer countdown finished for ${sessionCode}.`);
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
                        console.log(`[TimerHandler] Server-side timer started for session ${sessionCode}. Interval ID: ${timer.intervalId}`);
                    } else {
                        // Client wants to start but sent 0 or negative time, so just update state and broadcast
                        console.log(`[TimerHandler] DEBUG: Condition NOT met (timeLeft is 0 or less). Not starting interval.`);
                        timer.isRunning = false; // Ensure it's not running
                        io.to(sessionCode).emit('timerUpdate', {
                            timeLeft: timer.timeLeft, // Will be 0 or whatever was sent
                            isRunning: timer.isRunning
                        });
                        console.log(`[TimerHandler] Server-side timer NOT started for session ${sessionCode}: timeLeft was 0 or less.`);
                    }

                } else { // clientIsRunning is false: Client wants to STOP the timer
                    console.log(`[TimerHandler] DEBUG: Client wants to STOP. Timer state before stop:`, JSON.stringify(timer));
                    // The interval was already cleared at the top of the handler.
                    // Recalculate timeLeft for accurate stop, if it was running before this stop command
                    if (timer.isRunning && timer.lastSyncTime) {
                        const elapsedTimeSinceLastServerAction = Math.floor((Date.now() - timer.lastSyncTime) / 1000);
                        timer.timeLeft = Math.max(0, timer.timeLeft - elapsedTimeSinceLastServerAction);
                        console.log(`[TimerHandler] DEBUG: Recalculated timeLeft for stop: ${timer.timeLeft}`);
                    }

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
                    console.log(`[TimerHandler] Debug: Cleared interval for reset for ${sessionCode}.`);
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
    };

    // Export the handler function
    return { handleTimerEvents, sessionTimers };
};