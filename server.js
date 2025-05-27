require("dotenv").config();
const express = require("express");
const socketIo = require("socket.io");
const app = express();
const connectDB = require("./config/db"); // Keep this for your other routes (auth, session)
const cors = require("cors");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const passport = require("passport");
const http = require("http");
const server = http.createServer(app);

app.get('/', (req, res) => {
  res.send('<h1>Hello world</h1>');
});

const io = socketIo(server, {
    cors: {
        origin: 'https://seandavisproductions.github.io', // Your frontend URL
        methods: ['GET', 'POST'],
        credentials: true
    }
});

app.use(cors());
app.use(express.json()); // Essential for parsing JSON request bodies for your Express routes

const PORT = process.env.PORT || 3001;

// Connect to MongoDB (still needed for session storage and other routes)
connectDB();

// Configure express-session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "SOME_SECRET",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
    }),
  })
);

// Initialize Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// --- Socket.IO Logic (In-Memory Timer State) ---

// Store active timers per sessionCode in memory
// NOTE: This data will be lost if the server restarts.
const activeTimers = {};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinSession', (sessionCode) => {
        socket.join(sessionCode);
        console.log(`User ${socket.id} joined session room: ${sessionCode}`);

        // If a timer is already running for this session in memory, send its current state
        if (activeTimers[sessionCode]) {
            // Recalculate timeLeft based on when it was last updated on the server
            let currentActualTimeLeft = activeTimers[sessionCode].timeLeft;
            if (activeTimers[sessionCode].isRunning) {
                const elapsedTime = Math.floor((Date.now() - activeTimers[sessionCode].startTime) / 1000);
                currentActualTimeLeft = Math.max(0, activeTimers[sessionCode].timeLeft - elapsedTime);
            }

            // Send the current state (with recalculated timeLeft) to the newly joined client
            socket.emit('timerUpdate', {
                isRunning: activeTimers[sessionCode].isRunning && currentActualTimeLeft > 0,
                timeLeft: currentActualTimeLeft
            });
            console.log(`Sent existing timer state for ${sessionCode} from memory:`, { isRunning: activeTimers[sessionCode].isRunning, timeLeft: currentActualTimeLeft });
        } else {
            // If no timer exists in memory, send a default/reset state
            socket.emit('timerUpdate', { isRunning: false, timeLeft: 0 });
            console.log(`No existing timer found for ${sessionCode} in memory. Sent default state.`);
        }
    });

    // Event for the teacher to start/update the timer
    socket.on('startTimer', ({ sessionCode, isRunning, timeLeft }) => {
        console.log(`Teacher in session ${sessionCode} started/updated timer:`, { isRunning, timeLeft });

        // Update the in-memory timer state
        activeTimers[sessionCode] = {
            isRunning,
            timeLeft,
            startTime: Date.now() // Record when this state was set/updated
        };
        console.log('Timer state updated in memory:', activeTimers[sessionCode]);

        // Emit the updated timer state to all clients in that session room
        io.to(sessionCode).emit('timerUpdate', { isRunning, timeLeft });
    });

    // Event for the teacher to pause the timer
    socket.on('pauseTimer', ({ sessionCode, timeLeft }) => {
        console.log(`Teacher in session ${sessionCode} paused timer. Time left: ${timeLeft}`);

        if (activeTimers[sessionCode]) {
            activeTimers[sessionCode].isRunning = false;
            activeTimers[sessionCode].timeLeft = timeLeft;
            // No need to update startTime here as it's paused.
            // When restarted, startTime will be updated again.
        }
        console.log('Timer paused in memory:', activeTimers[sessionCode]);

        io.to(sessionCode).emit('timerUpdate', { isRunning: false, timeLeft });
    });

    // Event for the teacher to reset the timer
    socket.on('resetTimer', (sessionCode) => {
        console.log(`Teacher in session ${sessionCode} reset timer.`);

        delete activeTimers[sessionCode]; // Remove the timer from memory
        console.log(`Timer for ${sessionCode} deleted from memory.`);

        // Emit a reset state to all clients in that session room
        io.to(sessionCode).emit('timerReset', { isRunning: false, timeLeft: 0 });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});


// Now that the app is fully initialized, mount your route modules.
const authRoutes = require("./routes/authRoutes");
const sessionRoutes = require("./routes/generateSessionCode");
app.use("/auth", authRoutes);
app.use("/session", sessionRoutes);


server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});