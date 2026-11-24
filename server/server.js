
const http = require("http");

const app = require("./app");
const { initializeSocket } = require("./realtime/socket");

const PORT = process.env.PORT || 5001;

// Create HTTP server and attach Socket.IO
const httpServer = http.createServer(app);

initializeSocket(httpServer);

// Start delivery worker after Socket.IO initialization
require("./workers/deliveryWorker");

// Start server
httpServer.listen(PORT, () => {
  console.log(
    `DispatchFlow server running at http://localhost:${PORT}`
  );
});
