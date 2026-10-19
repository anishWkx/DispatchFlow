const express = require("express");
const cors = require("cors");
require("./workers/deliveryWorker");
const deliveryRoutes = require("./routes/deliveryRoutes");
const driverRoutes = require("./routes/driverRoutes");

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to DispatchFlow API!",
    status: "running",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "DispatchFlow Backend",
    status: "healthy",
  });
});

app.use("/api/deliveries", deliveryRoutes);
app.use("/api/drivers", driverRoutes);

app.listen(PORT, () => {
  console.log(`DispatchFlow server running at http://localhost:${PORT}`);
});
