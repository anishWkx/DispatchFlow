const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const redisUrl =
  process.env.REDIS_URL || "redis://127.0.0.1:6379";

const queueName =
  process.env.QUEUE_NAME || "delivery-jobs";

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

const deliveryQueue = new Queue(queueName, {
  connection,
});

module.exports = { connection, deliveryQueue };
