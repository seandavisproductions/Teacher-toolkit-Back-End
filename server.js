require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");

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
const authRoutes = require("./routes/auth");
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