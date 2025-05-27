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
const timerSocketHandler = require('./utils/timer'); // Assuming you'll create this next
const objectiveSocketHandler = require('./utils/objective'); // <-- NEW: Import objective handler

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



// Now that the app is fully initialized, mount your route modules.
const authRoutes = require("./routes/authRoutes");
const sessionRoutes = require("./routes/generateSessionCode");
app.use("/auth", authRoutes);
app.use("/session", sessionRoutes);


server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});