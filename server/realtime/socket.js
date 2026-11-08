
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

let io;

function initializeSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: [
        "https://dispatch-flow-six.vercel.app",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
      ],
      methods: ["GET", "POST"],
    },
  });

  // Authenticate every socket connection using the existing JWT.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Authentication token required"));
    }

    if (!process.env.JWT_SECRET) {
      return next(new Error("Authentication service is not configured"));
    }

    jwt.verify(
      token,
      process.env.JWT_SECRET,
      { issuer: "dispatchflow-api" },
      (error, decoded) => {
        if (error) {
          return next(new Error("Invalid or expired authentication token"));
        }

        socket.user = {
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role,
        };

        next();
      }
    );
  });

  io.on("connection", (socket) => {
    console.log(`Socket connected: user ${socket.user.userId}`);

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: user ${socket.user.userId}`);
    });
  });

  return io;
}

function emitDeliveryUpdate(data) {
  if (io) {
    io.emit("delivery:update", data);
  }
}

module.exports = {
  initializeSocket,
  emitDeliveryUpdate,
};
