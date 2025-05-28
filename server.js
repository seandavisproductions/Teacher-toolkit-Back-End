// server.js

// Load environment variables from .env file
require("dotenv").config();

// Core Node.js and Express imports
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const app = express();
const server = http.createServer(app); // Create HTTP server from Express app

// Database and Session Management
const connectDB = require("./config/db"); // Assuming your db connection is here
const session = require("express-session");
const MongoStore = require("connect-mongo"); // For storing sessions in MongoDB
const passport = require("passport"); // For authentication

// CORS Middleware
const cors = require("cors");

// Define allowed origins for both Express and Socket.IO
// This array should include all potential origins your frontend might connect from.
const allowedOrigins = [
  'http://localhost:3000', // For your local development environment
  'http://127.0.0.1:3000', // Another common localhost address
  'https://seandavisproductions.github.io', // The root domain for GitHub Pages
  'https://seandavisproductions.github.io/teacher-tools', // Your specific project page URL
  // Add your Render backend URL if your frontend also needs to make requests to it directly
  // Note: Backend won't typically make requests to itself, but if there are specific server-to-server calls that use CORS, it might be needed.
  'https://teacher-toolkit-back-end.onrender.com'
];

// --- Socket.IO Handler Imports ---
// IMPORTANT: Ensure these paths match your actual file structure
const timerSocketHandler = require('./utils/timer');
const subtitleSocketHandler = require('./utils/subtitles');
const objectiveSocketHandler = require('./utils/objective');

// --- Express Middleware Setup ---

// CORS Configuration for Express HTTP routes
// This handles CORS for your REST API endpoints (e.g., /auth, /session)
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        // or if the origin is in our allowed list.
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'), false);
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true // Allow cookies/authorization headers to be sent
}));

// Body parser middleware for JSON payloads
app.use(express.json());

// Connect to MongoDB
connectDB();

// Configure express-session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "a_very_secret_key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
      ttl: 14 * 24 * 60 * 60,
      autoRemove: 'interval',
      autoRemoveInterval: 10
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    }
  })
);

// Initialize Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// --- Socket.IO Server Setup ---
// CORS Configuration for Socket.IO WebSockets
// This handles CORS specifically for your WebSocket connections
const io = socketIo(server, {
    cors: {
        origin: function (origin, callback) {
            // Same logic for Socket.IO origins
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'), false);
            }
        },
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Initialize Socket.IO handler modules by passing the `io` instance
const { handleTimerEvents } = timerSocketHandler(io);
const { handleSubtitleEvents } = subtitleSocketHandler(io);
const { handleObjectiveEvents } = objectiveSocketHandler(io);

// Define Socket.IO connection event
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('joinSession', (sessionCode) => {
        if (!sessionCode) {
            console.warn(`Socket ${socket.id} attempted to join session with no code.`);
            socket.emit('sessionError', 'No session code provided.');
            return;
        }

        socket.join(sessionCode);
        console.log(`Socket ${socket.id} joined session: ${sessionCode}`);

        handleTimerEvents(socket, sessionCode);
        handleSubtitleEvents(socket, sessionCode);
        handleObjectiveEvents(socket, sessionCode);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });

    socket.on('error', (err) => {
        console.error(`Socket error for ${socket.id}:`, err);
    });
});

// --- API Routes ---
const authRoutes = require("./routes/authRoutes");
const sessionRoutes = require("./routes/generateSessionCode");
app.use("/auth", authRoutes);
app.use("/session", sessionRoutes);

// Basic root route
app.get('/', (req, res) => {
  res.send('<h1>Teacher Toolkit Backend is Running!</h1>');
});

// --- Server Listener ---
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Frontend URL: ${process.env.FRONTEND_URL}`); // This line will still log the ENV variable, but it won't be used for CORS
});