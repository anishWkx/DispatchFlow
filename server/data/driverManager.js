const Redis = require("ioredis");
const pool = require("../config/db");

const redisUrl =
  process.env.REDIS_URL || "redis://127.0.0.1:6379";

const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

const DRIVERS_KEY = process.env.DRIVERS_KEY || "dispatchflow:drivers";

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
    `SELECT id, name, location, status, deliveries_completed AS deliveriesCompleted
     FROM drivers
     ORDER BY id`
  );

  const drivers = rows.map((driver) => ({
    ...driver,
    id: Number(driver.id),
    deliveriesCompleted: Number(driver.deliveriesCompleted || 0),
  }));

  await syncRedis(drivers);

  return drivers;
}

async function assignDriver(deliveryId) {
  const connection = await pool.getConnection();

  let assignedDriver = null;

  try {
    await connection.beginTransaction();

    // Lock and validate the delivery before assigning a driver.
    const [deliveries] = await connection.execute(
      `SELECT id, status
       FROM deliveries
       WHERE id = ?
       FOR UPDATE`,
      [deliveryId]
    );

    if (deliveries.length !== 1) {
      throw new Error(`Delivery ${deliveryId} was not found.`);
    }

    if (deliveries[0].status !== "pending") {
      const error = new Error(
        `Delivery ${deliveryId} is already ${deliveries[0].status}.`
      );
      error.code = "DELIVERY_NOT_PENDING";
      throw error;
    }

    // Lock the least-used available driver.
    const [drivers] = await connection.execute(
      `SELECT id, name, location, status,
              deliveries_completed AS deliveriesCompleted
       FROM drivers
       WHERE status = 'available'
       ORDER BY deliveries_completed ASC, id ASC
       LIMIT 1
       FOR UPDATE`
    );

    if (drivers.length === 0) {
      await connection.rollback();
      return null;
    }

    const driver = drivers[0];

    // Reserve the driver inside the same transaction.
    const [updateResult] = await connection.execute(
      `UPDATE drivers
       SET status = 'busy'
       WHERE id = ?
         AND status = 'available'`,
      [driver.id]
    );

    if (updateResult.affectedRows !== 1) {
      throw new Error("Driver reservation failed. Please retry.");
    }

    // Link the delivery to the reserved driver.
    const [deliveryResult] = await connection.execute(
      `UPDATE deliveries
       SET driver_id = ?, status = 'assigned'
       WHERE id = ?`,
      [driver.id, deliveryId]
    );

    if (deliveryResult.affectedRows !== 1) {
      throw new Error(`Delivery ${deliveryId} was not found.`);
    }

    // Record the assignment in the same transaction.
    await connection.execute(
      `INSERT INTO delivery_assignments
       (delivery_id, driver_id)
       VALUES (?, ?)`,
      [deliveryId, driver.id]
    );

    await connection.commit();

    assignedDriver = {
      ...driver,
      id: Number(driver.id),
      deliveriesCompleted: Number(driver.deliveriesCompleted || 0),
      status: "busy",
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

    // Close only this delivery's active assignment.
    const [assignmentResult] = await connection.execute(
      `UPDATE delivery_assignments
       SET released_at = CURRENT_TIMESTAMP
       WHERE driver_id = ?
         AND delivery_id = ?
         AND released_at IS NULL`,
      [driverId, deliveryId]
    );

    // Prevent duplicate releases and completion-count increments.
    if (assignmentResult.affectedRows !== 1) {
      await connection.rollback();
      return;
    }

    const [driverResult] = await connection.execute(
      `UPDATE drivers
       SET status = 'available',
           deliveries_completed = deliveries_completed + ?
       WHERE id = ?
         AND status = 'busy'`,
      [delivered ? 1 : 0, driverId]
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
