require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

// Create the Express app BEFORE mounting any routes or calling app.listen
const app = express();
app.use(express.json());
app.use(cors({
  origin: "http://localhost:3000",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Connect to MongoDB
connectDB();

// Mount Routes AFTER app initialization
const authRoutes = require("./routes/authRoutes");
const sessionRoutes = require("./routes/generateSessionCode");
app.use("/auth", authRoutes);
app.use("/session", sessionRoutes);

// Configure express-session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "SOME_SECRET",
    resave: false,
    saveUninitialized: false,
  })
);

// Initialize Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Configure Passport to use Google strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID, // your Google client ID
      clientSecret: process.env.GOOGLE_CLIENT_SECRET, // your Google client secret
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/auth/google/callback"
    },
    async (accessToken, refreshToken, profile, done) => {
      return done(null, profile);
    }
  )
);

// Serialize and Deserialize the user for session management
passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser((id, done) => {
  // In production, retrieve the user from your database
  done(null, { id });
});

// Setup HTTP server and Socket.IO
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// Session timers for countdown functionality
const sessionTimers = {};

const startCountdown = (sessionCode, duration) => {
  sessionTimers[sessionCode] = duration;
  const interval = setInterval(() => {
    if (sessionTimers[sessionCode] <= 0) {
      clearInterval(interval);
      io.to(sessionCode).emit("countdownUpdate", { timeLeft: 0, status: "finished" });
    } else {
      sessionTimers[sessionCode]--;
      io.to(sessionCode).emit("countdownUpdate", { timeLeft: sessionTimers[sessionCode], status: "running" });
    }
  }, 1000);
};

// Consolidated Socket.IO handlers
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("joinRoom", (sessionCode) => {
    socket.join(sessionCode);
    console.log(`Socket ${socket.id} joined room: ${sessionCode}`);
  });

  socket.on("sessionUpdate", ({ sessionCode, newData }) => {
    io.to(sessionCode).emit("sessionUpdate", { sessionCode, ...newData });
    console.log(`Room ${sessionCode} updated with:`, newData);
  });

  socket.on("startCountdown", ({ sessionCode, duration }) => {
    startCountdown(sessionCode, duration);
  });
});

// Define OAuth routes
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    res.redirect("https://seandavisproductions.github.io/teacher-tools/");
  }
);

app.get("/profile", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.status(401).json({ error: "Not authenticated" });
  }
});

// Start the HTTP server (which already includes Socket.IO)
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT} with WebSockets!`));