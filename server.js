require("dotenv").config();
const express = require("express");
const socketIo = require("socket.io");
const app = express(); // <--- Add this line
const connectDB = require("./config/db");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { attachTimer } = require("./utils/timer"); // Import timer functions
const { protect } = require("./middleware/authMiddleware");
const http = require("http");
const server = http.createServer(app);


// Setup middleware
app.use(express.json());
app.use(
  cors( { 
    origin: ['https://seandavisproductions.github.io', 'http://localhost:3000/teacher-tools', 'https://admin.socket.io', 'https://teacher-toolkit-back-end.onrender.com', 'https://seandavisproductions.github.io/teacher-tools', 'http://localhost:3000'],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"], 
  }));


// Set up Socket.IO with CORS allowed for frontend
const io = socketIo(server, {
  cors: {
    origin: "https://seandavisproductions.github.io",  // Allow requests from your frontend
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
});


// Connect to MongoDB
connectDB();




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

// Configure Passport with Google Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID, // your Google client ID
      clientSecret: process.env.GOOGLE_CLIENT_SECRET, // your Google client secret
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      // Look up or create a user in the database here.
      return done(null, profile);
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser((id, done) => {
  // Retrieve the user from your database in production.
  done(null, { id });
});

// Now that the app is fully initialized, mount your route modules.
const authRoutes = require("./routes/authRoutes");
const sessionRoutes = require("./routes/generateSessionCode");
app.use("/auth", authRoutes);
app.use("/session", sessionRoutes);

// Define OAuth routes (ensure these handlers are proper functions)
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


// (Socket.IO handlers and additional functionality go here)

const PORT = process.env.PORT || 10000;
server.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT} with WebSockets!`)
);