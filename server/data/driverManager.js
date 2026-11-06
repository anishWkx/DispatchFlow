
const Redis = require("ioredis");
const initialDrivers = require("./drivers");
const pool = require("../config/db");

const redisUrl =
  process.env.REDIS_URL || "redis://127.0.0.1:6379";

const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

const DRIVERS_KEY = "dispatchflow:drivers";

let initialization;

async function ensureInitialized() {
  if (!initialization) {
    initialization = (async () => {
      if (redis.status === "wait") {
        await redis.connect();
      }

      const existing = await redis.get(DRIVERS_KEY);

      if (!existing) {
        await redis.set(
          DRIVERS_KEY,
          JSON.stringify(initialDrivers)
        );
      }
    })().catch((error) => {
      initialization = null;
      throw error;
    });
  }

  await initialization;
}

async function getDrivers() {
  await ensureInitialized();

  return JSON.parse(await redis.get(DRIVERS_KEY));
}

async function assignDriver() {
  await ensureInitialized();

  const drivers = await getDrivers();

  const available = drivers
    .filter((driver) => driver.status === "available")
    .sort(
      (a, b) =>
        a.deliveriesCompleted - b.deliveriesCompleted ||
        a.id - b.id
    );

  if (available.length === 0) {
    return null;
  }

  const driver = available[0];
  driver.status = "busy";

  await redis.set(
    DRIVERS_KEY,
    JSON.stringify(drivers)
  );

  await pool.execute(
    "UPDATE drivers SET status = 'busy' WHERE id = ?",
    [driver.id]
  );

  return { ...driver };
}

async function releaseDriver(driverId, delivered = false) {
  await ensureInitialized();

  const drivers = await getDrivers();

  const driver = drivers.find(
    (item) => item.id === driverId
  );

  if (!driver) return;

  driver.status = "available";

  if (delivered) {
    driver.deliveriesCompleted += 1;
  }

  await redis.set(
    DRIVERS_KEY,
    JSON.stringify(drivers)
  );

  await pool.execute(
    `UPDATE drivers
     SET status = 'available',
         deliveries_completed = deliveries_completed + ?
     WHERE id = ?`,
    [delivered ? 1 : 0, driverId]
  );
}

module.exports = {
  assignDriver,
  releaseDriver,
  getDrivers,
};
