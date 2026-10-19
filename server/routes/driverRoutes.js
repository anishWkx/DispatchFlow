const express = require("express");
const { getDrivers } = require("../data/driverManager");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const drivers = await getDrivers();

    res.json({
      success: true,
      count: drivers.length,
      drivers,
    });
  } catch (error) {
    console.error("Could not load drivers:", error.message);
    res.status(500).json({
      success: false,
      message: "Could not retrieve driver data. Check that Redis is running.",
    });
  }
});

module.exports = router;
