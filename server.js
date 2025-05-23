require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

const authRoutes = require("./routes/authRoutes");
app.use("/auth", authRoutes);

app.listen(process.env.PORT || 5000, () => console.log("Server running"));



// Create Express app BEFORE creating the HTTP server
const app = express();
app.use(express.json());
app.use(cors({
  origin: "http://localhost:3000",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Connect to MongoDB
connectDB();

// Routes
app.use("/auth", authRoutes);
const sessionRoutes = require("./routes/generateSessionCode");
app.use("/session", sessionRoutes);

// Create HTTP server and Socket.IO server attached to it
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// Session timers for countdown functionality
const sessionTimers = {};

// Function to start a countdown based on a session code
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

  // When teacher or student joins a room using session code
  socket.on("joinRoom", (sessionCode) => {
    socket.join(sessionCode);
    console.log(`Socket ${socket.id} joined room: ${sessionCode}`);
  });

  // Broadcast session updates to everyone in the same room
  socket.on("sessionUpdate", ({ sessionCode, newData }) => {
    io.to(sessionCode).emit("sessionUpdate", { sessionCode, ...newData });
    console.log(`Room ${sessionCode} updated with:`, newData);
  });

  // Start a countdown for a session
  socket.on("startCountdown", ({ sessionCode, duration }) => {
    startCountdown(sessionCode, duration);
  });
});

// Start the HTTP server listening with Socket.IO handling the sockets
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT} with WebSockets!`));


// Configure express-session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "SOME_SECRET", // set a strong secret in your .env file
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
      // In a production app, use profile info (like profile.id) to check if the user exists in your DB.
      // For example, if not exists, you could create the user.
      // Then return done(null, user);
      // For this example, we'll use the profile object directly.
      return done(null, profile);
    }
  )
);

// Serialize the user for the session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize the user from the session
passport.deserializeUser((id, done) => {
  // In a production app, fetch the user from your DB based on the id.
  // Here, we'll assume the user object is stored in the session.
  done(null, { id });
});

// Route to initiate Google authentication
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Callback route that Google will redirect to after authorization
app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    // Successful authentication.
    // You can save the teacher's information into your session or JWT here.
    res.redirect("https://seandavisproductions.github.io/teacher-tools/"); // redirect to your dashboard or teacher view
  }
);

// A simple route to test if user is authenticated
app.get("/profile", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.status(401).json({ error: "Not authenticated" });
  }
});

