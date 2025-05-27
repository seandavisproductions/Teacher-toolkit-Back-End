// server.js (or app.js)

require("dotenv").config();
const express = require("express");
const socketIo = require("socket.io");
const app = express();
const connectDB = require("./config/db");
const cors = require("cors");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const passport = require("passport");
const http = require("http");
const server = http.createServer(app);

// Import your Socket.IO handler modules
const timerSocketHandler = require('./socketHandlers/timer'); // Assuming you'll create this next
const objectiveSocketHandler = require('./socketHandlers/objective'); // <-- NEW: Import objective handler

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

// --- Socket.IO Logic ---

// Get the handlers (they are functions that expect the 'io' instance)
const { handleTimerEvents } = timerSocketHandler(io); // Will be uncommented when you make timer.js
const { handleObjectiveEvents } = objectiveSocketHandler(io); // <-- NEW: Get objective handler

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


// Now that the app is fully initialized, mount your route modules.
const authRoutes = require("./routes/authRoutes");
const sessionRoutes = require("./routes/generateSessionCode");
app.use("/auth", authRoutes);
app.use("/session", sessionRoutes);


server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});