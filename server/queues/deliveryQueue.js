const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const redisUrl =
  process.env.REDIS_URL || "redis://127.0.0.1:6379";

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

const deliveryQueue = new Queue("delivery-jobs", {
  connection,
});

module.exports = { connection, deliveryQueue };
