require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" }
});

// When a client connects.
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // When a client joins a session room.
  socket.on("joinSession", ({ sessionCode }) => {
    socket.join(sessionCode);
    console.log(`Socket ${socket.id} joined session: ${sessionCode}`);
  });

  // Listen for countdown updates from teacher client.
  socket.on("countdownUpdate", ({ sessionCode, timeLeft }) => {
    // Broadcast the updated timeLeft to all clients in the session room.
    io.to(sessionCode).emit("countdownUpdate", { timeLeft });
    console.log(`Broadcasting update for session ${sessionCode}: ${timeLeft} seconds remaining`);
  });

  // Clean up on disconnect.
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

module.exports = { getTimer, updateTimer };