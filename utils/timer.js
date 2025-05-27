const socketIo = require("socket.io");
require("dotenv").config();

/**
 * Attaches Socket.IO for timer functionality to the provided HTTP server.
 * @param {http.Server} server - The HTTP server instance from your main server file.
 * @returns The Socket.IO instance.
 */
function attachTimer(server) {
  const io = socketIo(server, { cors: { origin: "*" } });

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
      console.log("Broadcasting countdown:", { sessionCode, timeLeft });
      io.to(sessionCode).emit("countdownUpdate", { timeLeft });
      console.log(`Broadcasting update for session ${sessionCode}: ${timeLeft} seconds remaining`);
    });

    // Clean up on disconnect.
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  return io;
}

module.exports = attachTimer;