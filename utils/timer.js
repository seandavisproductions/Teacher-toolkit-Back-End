require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" }
});

// Object to hold active countdown timers by room
const countdownTimers = {};

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // (Optional) Let clients join a room based on teacher/session info
  socket.on("joinTeacherRoom", ({ teacherId, sessionCode }) => {
    const room = `${teacherId}-${sessionCode}`;
    socket.join(room);
    console.log(`Socket ${socket.id} joined room: ${room}`);
  });

  // Teacher starts the countdown timer. The teacherId and sessionCode are used to build the room.
  socket.on("startCountdown", ({ teacherId, sessionCode, timeLeft }) => {
    const room = `${teacherId}-${sessionCode}`;
    // Ensure the socket is in the proper room
    socket.join(room);
    
    // Clear any existing timer for this room
    if (countdownTimers[room]) {
      clearInterval(countdownTimers[room]);
      delete countdownTimers[room];
    }

    // Broadcast the starting time immediately
    io.to(room).emit("countdownUpdate", { timeLeft });
    
    // Set up the interval to count down every second
    countdownTimers[room] = setInterval(() => {
      if (timeLeft > 0) {
        timeLeft--;
        io.to(room).emit("countdownUpdate", { timeLeft });
      } else {
        // Timer finished; clear the interval and notify clients.
        clearInterval(countdownTimers[room]);
        delete countdownTimers[room];
        io.to(room).emit("countdownUpdate", { timeLeft: 0 });
      }
    }, 1000);
  });

  // Teacher stops the countdown timer
  socket.on("stopCountdown", ({ teacherId, sessionCode }) => {
    const room = `${teacherId}-${sessionCode}`;
    if (countdownTimers[room]) {
      clearInterval(countdownTimers[room]);
      delete countdownTimers[room];
      io.to(room).emit("countdownUpdate", { timeLeft: 0 });
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});