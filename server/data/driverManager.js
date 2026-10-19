const Redis = require("ioredis");
const initialDrivers = require("./drivers");

const redis = new Redis({
  host: "127.0.0.1",
  port: 6379,
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
        await redis.set(DRIVERS_KEY, JSON.stringify(initialDrivers));
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

  // One worker currently processes jobs at a time.
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

  await redis.set(DRIVERS_KEY, JSON.stringify(drivers));

  return { ...driver };
}

async function releaseDriver(driverId, delivered = false) {
  await ensureInitialized();

  const drivers = await getDrivers();
  const driver = drivers.find((item) => item.id === driverId);

  if (!driver) return;

  driver.status = "available";

  if (delivered) {
    driver.deliveriesCompleted += 1;
  }

  await redis.set(DRIVERS_KEY, JSON.stringify(drivers));
}

module.exports = {
  assignDriver,
  releaseDriver,
  getDrivers,
};
