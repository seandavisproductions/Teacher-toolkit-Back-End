const jwt = require("jsonwebtoken");

exports.protect = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  const cors = require('cors');
app.use(cors({ origin: 'http://localhost:3000' }));
  if (!token) {
    return res.status(401).json({ error: "Not authorized, no token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};

