const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: 'https://seandavisproductions.github.io', // Your frontend URL
        methods: ['GET', 'POST'],
        credentials: true
    }
});

app.use(cors());

const PORT = process.env.PORT || 3001;

// Store active timers per sessionCode
const activeTimers = {};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinSession', (sessionCode) => {
        socket.join(sessionCode);
        console.log(`User ${socket.id} joined session room: ${sessionCode}`);

        // If a timer is already running for this session, send its current state
        if (activeTimers[sessionCode]) {
            socket.emit('timerUpdate', activeTimers[sessionCode]);
        }
    });

    // Event for the teacher to start/update the timer
    socket.on('startTimer', ({ sessionCode, isRunning, timeLeft }) => {
        console.log(`Teacher in session ${sessionCode} started/updated timer:`, { isRunning, timeLeft });

        activeTimers[sessionCode] = { isRunning, timeLeft, startTime: Date.now() };

        // Emit the timer state to all clients in that session room
        io.to(sessionCode).emit('timerUpdate', activeTimers[sessionCode]);
    });

    // Event for the teacher to pause the timer
    socket.on('pauseTimer', ({ sessionCode, timeLeft }) => {
        console.log(`Teacher in session ${sessionCode} paused timer. Time left: ${timeLeft}`);

        if (activeTimers[sessionCode]) {
            activeTimers[sessionCode].isRunning = false;
            activeTimers[sessionCode].timeLeft = timeLeft;
            // No need for 'pausedAt' if we're just syncing timeLeft directly
        }

        // Emit the paused timer state to all clients in that session room
        io.to(sessionCode).emit('timerUpdate', activeTimers[sessionCode]);
    });

    // Event for the teacher to reset the timer
    socket.on('resetTimer', (sessionCode) => {
        console.log(`Teacher in session ${sessionCode} reset timer.`);

        delete activeTimers[sessionCode]; // Remove the timer for this session

        // Emit a reset state to all clients in that session room
        io.to(sessionCode).emit('timerReset', { isRunning: false, timeLeft: 0 });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});