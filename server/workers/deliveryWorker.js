const { Worker } = require("bullmq");
const { connection } = require("../queues/deliveryQueue");
const { assignDriver, releaseDriver } = require("../data/driverManager");

const worker = new Worker(
  "delivery-jobs",
  async (job) => {
    console.log(`\n🚚 Processing delivery job #${job.id}`);

    let driver = null;
    let delivered = false;

    try {
      console.log(`Pickup: ${job.data.pickup}`);
      console.log(`Dropoff: ${job.data.dropoff}`);

      driver = await assignDriver();

      if (!driver) {
        throw new Error("No drivers available");
      }

      console.log(`🛵 Assigned driver: ${driver.name}`);

      await job.updateProgress({
        percentage: 20,
        stage: "Driver assigned",
        message: `${driver.name} is preparing to collect the order`,
      });

      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.log("📦 [5s] Order picked up");

      await job.updateProgress({
        percentage: 45,
        stage: "Picked up",
        message: "The driver has collected the order",
      });

      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.log("🚚 [10s] Delivery in transit");

      await job.updateProgress({
        percentage: 75,
        stage: "In transit",
        message: "The order is on its way to the destination",
      });

      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.log("✅ [15s] Delivery completed!");

      await job.updateProgress({
        percentage: 100,
        stage: "Delivered",
        message: "The delivery has been completed successfully",
      });

      delivered = true;

      return {
        status: "delivered",
        driverId: driver.id,
        driverName: driver.name,
        pickup: job.data.pickup,
        dropoff: job.data.dropoff,
        completedAt: new Date().toISOString(),
      };
    } finally {
      if (driver) {
        await releaseDriver(driver.id, delivered);
      }
    }
  },
  {
    connection,
    concurrency: 1,
  }
);

worker.on("completed", (job, result) => {
  console.log(`Job #${job.id} completed.`, result);
});

worker.on("failed", (job, error) => {
  console.error(`Job #${job?.id} failed: ${error.message}`);
});

worker.on("error", (error) => {
  console.error("Worker error:", error.message);
});

console.log("DispatchFlow delivery worker is listening for jobs...");

async function shutdown() {
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
