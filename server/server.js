
const express = require("express");
const cors = require("cors");
const http = require("http");

const authRoutes = require("./routes/authRoutes");
const deliveryRoutes = require("./routes/deliveryRoutes");
const driverRoutes = require("./routes/driverRoutes");

const {
  authenticateToken,
} = require("./middleware/authMiddleware");

const { initializeSocket } = require("./realtime/socket");

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Welcome route
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to DispatchFlow API!",
    status: "running",
  });
});

// Public health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "DispatchFlow Backend",
    status: "healthy",
  });
});

// Public authentication routes
app.use("/api/auth", authRoutes);

// Protected routes
app.use(
  "/api/deliveries",
  authenticateToken,
  deliveryRoutes
);

app.use(
  "/api/drivers",
  authenticateToken,
  driverRoutes
);

// Create HTTP server and attach Socket.IO
const httpServer = http.createServer(app);

initializeSocket(httpServer);

// Start the delivery worker after Socket.IO initialization
require("./workers/deliveryWorker");

// Start server
httpServer.listen(PORT, () => {
  console.log(
    `DispatchFlow server running at http://localhost:${PORT}`
  );
});
