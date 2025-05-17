require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");

const authRoutes = require("./routes/auth");

const app = express();
app.use(express.json());
app.use(require("cors")());

connectDB(); // Connects to MongoDB

app.use("/auth", authRoutes);

const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
