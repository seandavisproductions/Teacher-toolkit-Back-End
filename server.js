require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const cors = require("cors");
const { Server } = require("socket.io");
const http = require("http");

const server = http.createServer(app);
const io = new Server(server);

io.on("connection", (socket) => {
  console.log("Student connected:", socket.id);

  socket.on("joinSession", (sessionCode) => {
    socket.join(sessionCode);
    console.log(`Student joined session: ${sessionCode}`);
  });

  socket.on("updateSession", (data) => {
    io.to(data.sessionCode).emit("sessionUpdate", data);
  });
});

server.listen(5000, () => console.log("🚀 Server running with WebSockets!"));

const app = express();
app.use(express.json());
app.use(cors({
  origin: "http://localhost:3000", // Allow requests from your frontend
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

connectDB(); // Connects to MongoDB

app.use("/auth", authRoutes);

const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

