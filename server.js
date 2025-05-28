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
  'https://teacher-toolkit-back-end.onrender.com'
];

// --- Socket.IO Handler Imports ---
// IMPORTANT: Ensure these paths match your actual file structure
const timerSocketHandler = require('./utils/timer');         // Timer.js is in 'utils'
const subtitleSocketHandler = require('./utils/subtitles');  // <-- UPDATED: Subtitle.js is now in 'utils'
const objectiveSocketHandler = require('./utils/objective');  // Assuming objective.js is in 'utils'

// --- Express Middleware Setup ---

// CORS Configuration for Express HTTP routes
// This handles CORS for your REST API endpoints (e.g., /auth, /session)
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000', // Use FRONTEND_URL from .env
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Add any methods your API uses
    credentials: true // Allow cookies/authorization headers to be sent
}));

// Body parser middleware for JSON payloads
app.use(express.json());

// Connect to MongoDB
connectDB();

// Configure express-session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "a_very_secret_key", // Use a strong secret from .env
    resave: false, // Don't save session if unmodified
    saveUninitialized: false, // Don't create session until something stored
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI, // MongoDB connection string from .env
      collectionName: "sessions", // Name of the collection for sessions
      ttl: 14 * 24 * 60 * 60, // Session TTL in seconds (14 days)
      autoRemove: 'interval', // Remove expired sessions
      autoRemoveInterval: 10 // Interval in minutes to check for expired sessions
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
        httpOnly: true, // Prevents client-side JS from reading the cookie
        secure: process.env.NODE_ENV === 'production', // Use secure cookies in production (HTTPS)
        sameSite: 'lax' // Protects against CSRF attacks
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
        origin: process.env.FRONTEND_URL || 'http://localhost:3000', // Use FRONTEND_URL from .env
        methods: ['GET', 'POST'], // Methods allowed for pre-flight requests
        credentials: true // Allow authentication via cookies/headers
    }
});

// Initialize Socket.IO handler modules by passing the `io` instance
// This gives each handler access to the Socket.IO server instance for broadcasting
const { handleTimerEvents } = timerSocketHandler(io);
const { handleSubtitleEvents } = subtitleSocketHandler(io);
const { handleObjectiveEvents } = objectiveSocketHandler(io);

// Define Socket.IO connection event
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Listen for 'joinSession' event when a client wants to join a specific session
    socket.on('joinSession', (sessionCode) => {
        if (!sessionCode) {
            console.warn(`Socket ${socket.id} attempted to join session with no code.`);
            socket.emit('sessionError', 'No session code provided.');
            return;
        }

        socket.join(sessionCode); // Add the socket to the specified room
        console.log(`Socket ${socket.id} joined session: ${sessionCode}`);

        // Call the individual handler functions for this specific socket and session
        // These functions will set up event listeners for the relevant socket events
        handleTimerEvents(socket, sessionCode);
        handleSubtitleEvents(socket, sessionCode);
        handleObjectiveEvents(socket, sessionCode);
    });

    // Listen for socket disconnection
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Any general cleanup or logging for disconnected sockets can go here.
        // Specific cleanup for timers/subtitles should be handled within their respective handlers' disconnect logic if needed.
    });

    // Handle Socket.IO errors
    socket.on('error', (err) => {
        console.error(`Socket error for ${socket.id}:`, err);
    });
});

// --- API Routes ---
// Now that the app and Socket.IO are fully initialized, mount your Express route modules.
// Assuming these files exist in your 'routes' folder
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
    console.log(`Frontend URL: ${process.env.FRONTEND_URL}`);
});