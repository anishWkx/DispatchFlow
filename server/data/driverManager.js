const Redis = require("ioredis");
const pool = require("../config/db");
const { calculateRouteDistance } = require("./locationUtils");
const { predictETAs } = require("../ml/predictETA");

const redisUrl =
  process.env.REDIS_URL || "redis://127.0.0.1:6379";

const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

const DRIVERS_KEY =
  process.env.DRIVERS_KEY || "dispatchflow:drivers";

// Shared estimated traffic input for comparing all candidates.
const ASSIGNMENT_TRAFFIC_MULTIPLIER = 1.25;

async function syncRedis(drivers) {
  try {
    if (redis.status === "wait") {
      await redis.connect();
    }

    if (redis.status === "ready") {
      await redis.set(DRIVERS_KEY, JSON.stringify(drivers));
    }
  } catch (error) {
    console.error("Redis driver sync warning:", error.message);
  }
}

async function getDrivers() {
  const [rows] = await pool.execute(
    `SELECT id, name, location, status,
            deliveries_completed AS deliveriesCompleted,
            avg_speed_kmph AS avgSpeedKmph,
            pickup_delay_seconds AS pickupDelaySeconds
     FROM drivers
     ORDER BY id`
  );

  const drivers = rows.map((driver) => ({
    ...driver,
    id: Number(driver.id),
    deliveriesCompleted: Number(driver.deliveriesCompleted || 0),
    avgSpeedKmph:
      driver.avgSpeedKmph === null
        ? null
        : Number(driver.avgSpeedKmph),
    pickupDelaySeconds:
      driver.pickupDelaySeconds === null
        ? null
        : Number(driver.pickupDelaySeconds),
  }));

  await syncRedis(drivers);

  return drivers;
}

async function assignDriver(deliveryId) {
  const connection = await pool.getConnection();

  let assignedDriver = null;

  try {
    await connection.beginTransaction();

    // Lock and validate the delivery.
    const [deliveries] = await connection.execute(
      `SELECT id, pickup, dropoff, status
       FROM deliveries
       WHERE id = ?
       FOR UPDATE`,
      [deliveryId]
    );

    if (deliveries.length !== 1) {
      throw new Error(`Delivery ${deliveryId} was not found.`);
    }

    const delivery = deliveries[0];

    if (delivery.status !== "pending") {
      const error = new Error(
        `Delivery ${deliveryId} is already ${delivery.status}.`
      );
      error.code = "DELIVERY_NOT_PENDING";
      throw error;
    }

    // Lock every available driver so concurrent assignments
    // cannot select the same available driver.
    const [drivers] = await connection.execute(
      `SELECT id, name, location, status,
              deliveries_completed AS deliveriesCompleted,
              avg_speed_kmph AS avgSpeedKmph,
              pickup_delay_seconds AS pickupDelaySeconds
       FROM drivers
       WHERE status = 'available'
       ORDER BY id ASC
       FOR UPDATE`
    );

    if (drivers.length === 0) {
      await connection.rollback();
      return null;
    }

    // Prepare identical traffic assumptions for fair comparison.
    const candidates = drivers.map((driver) => {
      const avgSpeedKmph =
        Number(driver.avgSpeedKmph) || 32;

      const pickupDelaySeconds =
        Number(driver.pickupDelaySeconds) || 120;

      const driverToPickupKm =
        calculateRouteDistance(
          driver.location,
          delivery.pickup
        ).estimatedRoadDistanceKm;

      const pickupToDropoffKm =
        calculateRouteDistance(
          delivery.pickup,
          delivery.dropoff
        ).estimatedRoadDistanceKm;

      return {
        driverId: Number(driver.id),
        driverName: driver.name,
        avgSpeedKmph,
        pickupDelaySeconds,
        driverToPickupKm,
        pickupToDropoffKm,
        trafficMultiplier: ASSIGNMENT_TRAFFIC_MULTIPLIER,
      };
    });

    // Predict ETA for every available driver.
    const predictions = await predictETAs(candidates);

    if (
      !Array.isArray(predictions) ||
      predictions.length !== candidates.length
    ) {
      throw new Error("ETA model returned invalid predictions.");
    }

    // Lowest predicted ETA wins.
    const rankedDrivers = predictions
      .slice()
      .sort(
        (a, b) =>
          a.predictedEtaSeconds - b.predictedEtaSeconds
      );

    const bestPrediction = rankedDrivers[0];

    if (
      !Number.isFinite(Number(bestPrediction.predictedEtaSeconds)) ||
      Number(bestPrediction.predictedEtaSeconds) <= 0
    ) {
      throw new Error("ETA model returned an invalid predicted ETA.");
    }

    const selectedCandidate = candidates.find(
      (candidate) =>
        candidate.driverId === bestPrediction.driverId
    );

    const selectedDriver = drivers.find(
      (driver) =>
        Number(driver.id) === bestPrediction.driverId
    );

    if (!selectedCandidate || !selectedDriver) {
      throw new Error(
        "The ETA model selected an unknown driver."
      );
    }

    const driverRecommendations = rankedDrivers.map(
      (prediction, index) => {
        const candidate = candidates.find(
          (item) => item.driverId === Number(prediction.driverId)
        );

        if (!candidate) {
          throw new Error("A ranked prediction has no matching driver.");
        }

        return {
          rank: index + 1,
          driverId: Number(prediction.driverId),
          driverName: prediction.driverName,
          predictedEtaSeconds: Number(prediction.predictedEtaSeconds),
          predictedEtaMinutes: Number(prediction.predictedEtaMinutes),
          differenceFromBestSeconds:
            Number(prediction.predictedEtaSeconds) -
            Number(bestPrediction.predictedEtaSeconds),
          avgSpeedKmph: candidate.avgSpeedKmph,
          pickupDelaySeconds: candidate.pickupDelaySeconds,
          driverToPickupKm: candidate.driverToPickupKm,
          pickupToDropoffKm: candidate.pickupToDropoffKm,
          trafficMultiplier: candidate.trafficMultiplier,
        };
      }
    );

    console.log("🧠 Smart driver ranking:");

    rankedDrivers.forEach((prediction, index) => {
      console.log(
        `${index + 1}. ${prediction.driverName}: ` +
        `${prediction.predictedEtaMinutes} minutes`
      );
    });

    console.log(
      `🏆 Selected ${selectedDriver.name} with predicted ETA ` +
      `${bestPrediction.predictedEtaMinutes} minutes`
    );

    // Reserve the selected driver within this transaction.
    const [updateResult] = await connection.execute(
      `UPDATE drivers
       SET status = 'busy'
       WHERE id = ?
         AND status = 'available'`,
      [selectedDriver.id]
    );

    if (updateResult.affectedRows !== 1) {
      throw new Error("Driver reservation failed. Please retry.");
    }

    // Link the delivery to the selected driver.
    const [deliveryResult] = await connection.execute(
      `UPDATE deliveries
       SET driver_id = ?, status = 'assigned'
       WHERE id = ?
         AND status = 'pending'`,
      [selectedDriver.id, deliveryId]
    );

    if (deliveryResult.affectedRows !== 1) {
      throw new Error(
        `Could not assign delivery ${deliveryId}.`
      );
    }

    // Save the model prediction with the assignment.
    await connection.execute(
      `INSERT INTO delivery_assignments
       (delivery_id, driver_id, predicted_eta_seconds)
       VALUES (?, ?, ?)`,
      [
        deliveryId,
        selectedDriver.id,
        bestPrediction.predictedEtaSeconds,
      ]
    );

    await connection.commit();

    assignedDriver = {
      ...selectedDriver,
      id: Number(selectedDriver.id),
      deliveriesCompleted: Number(
        selectedDriver.deliveriesCompleted || 0
      ),
      avgSpeedKmph: selectedCandidate.avgSpeedKmph,
      pickupDelaySeconds: selectedCandidate.pickupDelaySeconds,
      status: "busy",

      // Assignment prediction and its input values.
      predictedEtaSeconds: bestPrediction.predictedEtaSeconds,
      predictedEtaMinutes: bestPrediction.predictedEtaMinutes,
      driverRecommendations,
      trafficMultiplier: ASSIGNMENT_TRAFFIC_MULTIPLIER,
      driverToPickupKm: selectedCandidate.driverToPickupKm,
      pickupToDropoffKm: selectedCandidate.pickupToDropoffKm,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (assignedDriver) {
    const drivers = await getDrivers();
    await syncRedis(drivers);
  }

  return assignedDriver;
}

async function releaseDriver(driverId, deliveryId, delivered = false) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [deliveries] = await connection.execute(
      `SELECT dropoff
       FROM deliveries
       WHERE id = ?
       FOR UPDATE`,
      [deliveryId]
    );

    if (deliveries.length !== 1) {
      throw new Error(`Delivery ${deliveryId} was not found.`);
    }

    const [assignmentResult] = await connection.execute(
      `UPDATE delivery_assignments
       SET released_at = CURRENT_TIMESTAMP
       WHERE driver_id = ?
         AND delivery_id = ?
         AND released_at IS NULL`,
      [driverId, deliveryId]
    );

    if (assignmentResult.affectedRows !== 1) {
      await connection.rollback();
      return;
    }

    const dropoff = deliveries[0].dropoff;

    const [driverResult] = await connection.execute(
      `UPDATE drivers
       SET status = 'available',
           deliveries_completed = deliveries_completed + ?,
           location = CASE WHEN ? = 1 THEN ? ELSE location END
       WHERE id = ?
         AND status = 'busy'`,
      [delivered ? 1 : 0, delivered ? 1 : 0, dropoff, driverId]
    );

    if (driverResult.affectedRows !== 1) {
      throw new Error(
        `Could not release driver ${driverId} for delivery ${deliveryId}`
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const drivers = await getDrivers();
  await syncRedis(drivers);
}

module.exports = {
  assignDriver,
  releaseDriver,
  getDrivers,
};
