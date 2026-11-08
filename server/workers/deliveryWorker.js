const { Worker } = require("bullmq");
const { connection } = require("../queues/deliveryQueue");
const { assignDriver, releaseDriver } = require("../data/driverManager");
const pool = require("../config/db");

const worker = new Worker(
  process.env.QUEUE_NAME || "delivery-jobs",
  async (job) => {
    console.log(`\n🚚 Processing delivery job #${job.id}`);

    const { deliveryId, pickup, dropoff } = job.data;

    let driver = null;
    let delivered = false;

    try {
      console.log(`Pickup: ${pickup}`);
      console.log(`Dropoff: ${dropoff}`);

      driver = await assignDriver(deliveryId);

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

      await pool.execute(
        "UPDATE deliveries SET status = 'picked_up' WHERE id = ?",
        [deliveryId]
      );

      await job.updateProgress({
        percentage: 45,
        stage: "Picked up",
        message: "The driver has collected the order",
      });

      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.log("🚚 [10s] Delivery in transit");

      await pool.execute(
        "UPDATE deliveries SET status = 'in_transit' WHERE id = ?",
        [deliveryId]
      );

      await job.updateProgress({
        percentage: 75,
        stage: "In transit",
        message: "The order is on its way to the destination",
      });

      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.log("✅ [15s] Delivery completed!");

      await pool.execute(
        `UPDATE deliveries
         SET status = 'delivered',
             completed_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [deliveryId]
      );

      delivered = true;

      await job.updateProgress({
        percentage: 100,
        stage: "Delivered",
        message: "The delivery has been completed successfully",
      });

      return {
        status: "delivered",
        deliveryId,
        driverId: driver.id,
        driverName: driver.name,
        pickup,
        dropoff,
        completedAt: new Date().toISOString(),
      };
    } catch (error) {
      const currentAttempt = job.attemptsMade + 1;
      const maxAttempts = job.opts.attempts || 1;
      const willRetry = currentAttempt < maxAttempts;

      console.error(
        `Delivery #${deliveryId} failed on attempt ${currentAttempt}/${maxAttempts}:`,
        error.message
      );

      // Do not reset a delivery rejected as already assigned/processed.
      if (error.code !== "DELIVERY_NOT_PENDING") {
        await pool.execute(
          `UPDATE deliveries
           SET status = ?,
               driver_id = NULL
           WHERE id = ?`,
          [willRetry ? "pending" : "failed", deliveryId]
        );
      }

      if (willRetry) {
        console.log(
          `🔄 Delivery #${deliveryId} will be retried by BullMQ.`
        );
      } else {
        console.error(
          `❌ Delivery #${deliveryId} permanently failed after ${maxAttempts} attempts.`
        );
      }

      throw error;
    } finally {
      if (driver) {
        await releaseDriver(driver.id, deliveryId, delivered);
      }
    }
  },
  {
    connection,
    concurrency: 3,
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
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
