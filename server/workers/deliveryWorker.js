const { Worker } = require("bullmq");
const { connection } = require("../queues/deliveryQueue");
const {
  assignDriver,
  releaseDriver,
} = require("../data/driverManager");
const pool = require("../config/db");
const { emitDeliveryUpdate } = require("../realtime/socket");

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

const worker = new Worker(
  process.env.QUEUE_NAME || "delivery-jobs",
  async (job) => {
    console.log(`\n🚚 Processing delivery job #${job.id}`);

    const { deliveryId, pickup, dropoff } = job.data;

    let driver = null;
    let assignmentId = null;
    let delivered = false;

    try {
      console.log(`Pickup: ${pickup}`);
      console.log(`Dropoff: ${dropoff}`);

      // Select the driver with the lowest ML-predicted ETA.
      driver = await assignDriver(deliveryId);

      if (!driver) {
        throw new Error("No drivers available");
      }

      console.log(`🛵 Assigned driver: ${driver.name}`);

      console.log("🧠 ML assignment prediction:", {
        driverName: driver.name,
        predictedEtaSeconds: driver.predictedEtaSeconds,
        predictedEtaMinutes: driver.predictedEtaMinutes,
      });

      // Use the route distances calculated during assignment.
      const driverToPickupKm = driver.driverToPickupKm;
      const pickupToDropoffKm = driver.pickupToDropoffKm;

      const baseSpeed = Number(driver.avgSpeedKmph) || 32;
      const basePickupDelay =
        Number(driver.pickupDelaySeconds) || 120;

      // Simulate small variations around the driver's profile.
      const simulatedSpeedKmph = Number(
        Math.max(
          20,
          Math.min(45, baseSpeed + randomBetween(-2.5, 2.5))
        ).toFixed(2)
      );

      const simulatedPickupDelaySeconds = Math.round(
        Math.max(30, basePickupDelay + randomBetween(-20, 20))
      );

      // Keep the traffic assumption consistent with ML assignment.
      const trafficMultiplier =
        Number(driver.trafficMultiplier) || 1.25;

      const simulatedPickupSeconds = Math.round(
        (driverToPickupKm / simulatedSpeedKmph) * 3600 +
        simulatedPickupDelaySeconds
      );

      const simulatedTravelSeconds = Math.round(
        (pickupToDropoffKm / simulatedSpeedKmph) *
        3600 *
        trafficMultiplier
      );

      // Find this attempt's active assignment record.
      const [assignments] = await pool.execute(
        `SELECT id
         FROM delivery_assignments
         WHERE delivery_id = ?
           AND driver_id = ?
           AND released_at IS NULL
         ORDER BY id DESC
         LIMIT 1`,
        [deliveryId, driver.id]
      );

      if (assignments.length !== 1) {
        throw new Error(
          `Active assignment not found for delivery ${deliveryId}`
        );
      }

      assignmentId = Number(assignments[0].id);

      // Store telemetry against this specific assignment.
      await pool.execute(
        `UPDATE delivery_assignments
         SET driver_to_pickup_km = ?,
             pickup_to_dropoff_km = ?,
             simulated_speed_kmph = ?,
             traffic_multiplier = ?,
             simulated_pickup_seconds = ?,
             simulated_travel_seconds = ?
         WHERE id = ?`,
        [
          driverToPickupKm,
          pickupToDropoffKm,
          simulatedSpeedKmph,
          trafficMultiplier,
          simulatedPickupSeconds,
          simulatedTravelSeconds,
          assignmentId,
        ]
      );

      console.log("📊 Assignment telemetry recorded:", {
        assignmentId,
        driverToPickupKm,
        pickupToDropoffKm,
        predictedEtaSeconds: driver.predictedEtaSeconds,
        predictedEtaMinutes: driver.predictedEtaMinutes,
        driverBaselineSpeedKmph: baseSpeed,
        simulatedSpeedKmph,
        driverBaselinePickupDelaySeconds: basePickupDelay,
        simulatedPickupDelaySeconds,
        trafficMultiplier,
        simulatedPickupSeconds,
        simulatedTravelSeconds,
      });

      emitDeliveryUpdate({
        deliveryId,
        status: "assigned",
        driverId: driver.id,
        driverName: driver.name,
        predictedEtaSeconds: driver.predictedEtaSeconds,
        predictedEtaMinutes: driver.predictedEtaMinutes,
        driverRecommendations: driver.driverRecommendations,
      });

      await job.updateProgress({
        percentage: 20,
        stage: "Driver assigned",
        message: `${driver.name} is preparing to collect the order`,
        driverRecommendations: driver.driverRecommendations,
      });

      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.log("📦 [5s] Order picked up");

      await pool.execute(
        `UPDATE delivery_assignments
         SET picked_up_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [assignmentId]
      );

      await pool.execute(
        "UPDATE deliveries SET status = 'picked_up' WHERE id = ?",
        [deliveryId]
      );

      emitDeliveryUpdate({
        deliveryId,
        status: "picked_up",
      });

      await job.updateProgress({
        percentage: 45,
        stage: "Picked up",
        message: "The driver has collected the order",
      });

      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.log("🚚 [10s] Delivery in transit");

      await pool.execute(
        `UPDATE delivery_assignments
         SET in_transit_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [assignmentId]
      );

      await pool.execute(
        "UPDATE deliveries SET status = 'in_transit' WHERE id = ?",
        [deliveryId]
      );

      emitDeliveryUpdate({
        deliveryId,
        status: "in_transit",
      });

      await job.updateProgress({
        percentage: 75,
        stage: "In transit",
        message: "The order is on its way to the destination",
      });

      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.log("✅ [15s] Delivery completed!");

      await pool.execute(
        `UPDATE delivery_assignments
         SET delivered_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [assignmentId]
      );

      await pool.execute(
        `UPDATE deliveries
         SET status = 'delivered',
             completed_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [deliveryId]
      );

      delivered = true;

      emitDeliveryUpdate({
        deliveryId,
        status: "delivered",
        driverId: driver.id,
        driverName: driver.name,
      });

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
        prediction: {
          predictedEtaSeconds: driver.predictedEtaSeconds,
          predictedEtaMinutes: driver.predictedEtaMinutes,
        },
        driverRecommendations: driver.driverRecommendations,
        telemetry: {
          assignmentId,
          driverToPickupKm,
          pickupToDropoffKm,
          driverBaselineSpeedKmph: baseSpeed,
          simulatedSpeedKmph,
          driverBaselinePickupDelaySeconds: basePickupDelay,
          simulatedPickupDelaySeconds,
          trafficMultiplier,
          simulatedPickupSeconds,
          simulatedTravelSeconds,
        },
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

      if (error.code !== "DELIVERY_NOT_PENDING") {
        await pool.execute(
          `UPDATE deliveries
           SET status = ?,
               driver_id = NULL
           WHERE id = ?`,
          [willRetry ? "pending" : "failed", deliveryId]
        );

        emitDeliveryUpdate({
          deliveryId,
          status: willRetry ? "pending" : "failed",
          failureReason: error.message,
        });
      }

      if (willRetry) {
        console.log(
          `🔄 Delivery #${deliveryId} will be retried by BullMQ.`
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

worker.on("completed", (job) => {
  console.log(`🎉 Job ${job.id} completed successfully`);
});

worker.on("failed", (job, error) => {
  console.error(`❌ Job ${job?.id} failed:`, error.message);
});

console.log("DispatchFlow delivery worker is listening for jobs...");

module.exports = worker;
