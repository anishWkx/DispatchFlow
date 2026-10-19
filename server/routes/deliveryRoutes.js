
const express = require("express");
const router = express.Router();
const { deliveryQueue } = require("../queues/deliveryQueue");

const priorityMap = {
  high: 1,
  normal: 5,
  low: 10,
};

// Create a delivery job
router.post("/", async (req, res) => {
  try {
    const { pickup, dropoff } = req.body;
    const priority = String(req.body.priority || "normal").toLowerCase();

    if (!pickup || !dropoff) {
      return res.status(400).json({
        success: false,
        message: "Pickup and dropoff are required",
      });
    }

    if (!Object.prototype.hasOwnProperty.call(priorityMap, priority)) {
      return res.status(400).json({
        success: false,
        message: "Priority must be high, normal, or low",
      });
    }

    const job = await deliveryQueue.add(
      "deliver-order",
      { pickup, dropoff, priority },
      {
        priority: priorityMap[priority],
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: false,
      }
    );

    return res.status(201).json({
      success: true,
      message: "Delivery job added to queue",
      jobId: job.id,
      data: {
        ...job.data,
        queuePriority: priorityMap[priority],
      },
    });
  } catch (error) {
    console.error("Create delivery error:", error);
    return res.status(500).json({
      success: false,
      message: "Could not create delivery job",
    });
  }
});

// Get recent delivery jobs and their statuses
router.get("/", async (req, res) => {
  try {
    const jobs = await deliveryQueue.getJobs(
      ["waiting", "active", "completed", "failed", "delayed"],
      0,
      49,
      true
    );

    const deliveries = await Promise.all(
      jobs.map(async (job) => ({
        id: job.id,
        pickup: job.data.pickup,
        dropoff: job.data.dropoff,
        priority: job.data.priority,
        status: await job.getState(),
        progress: job.progress || null,
        result: job.returnvalue || null,
        failedReason: job.failedReason || null,
        createdAt: new Date(job.timestamp).toISOString(),
      }))
    );

    return res.json({
      success: true,
      count: deliveries.length,
      deliveries,
    });
  } catch (error) {
    console.error("Get deliveries error:", error);
    return res.status(500).json({
      success: false,
      message: "Could not retrieve deliveries",
    });
  }
});

// Delivery analytics summary
router.get("/analytics/summary", async (req, res) => {
  try {
    const [
      waiting,
      active,
      completedCount,
      failed,
      delayed,
    ] = await Promise.all([
      deliveryQueue.getWaitingCount(),
      deliveryQueue.getActiveCount(),
      deliveryQueue.getCompletedCount(),
      deliveryQueue.getFailedCount(),
      deliveryQueue.getDelayedCount(),
    ]);

    // Read retained jobs so processing times can be calculated.
    const jobs = await deliveryQueue.getJobs(
      ["completed", "failed"],
      0,
      999,
      true
    );

    const successfulJobs = jobs.filter(
      (job) =>
        job.finishedOn &&
        job.returnvalue &&
        job.failedReason == null
    );

    const failedJobs = jobs.filter(
      (job) => job.failedReason != null
    );

    const successfulCount = successfulJobs.length;
    const totalFinished = successfulCount + failedJobs.length;

    const successRate =
      totalFinished > 0
        ? Number(((successfulCount / totalFinished) * 100).toFixed(1))
        : 0;

    const processingTimes = successfulJobs
      .filter(
        (job) =>
          typeof job.processedOn === "number" &&
          typeof job.finishedOn === "number"
      )
      .map((job) => job.finishedOn - job.processedOn);

    const averageProcessingTimeMs =
      processingTimes.length > 0
        ? Math.round(
            processingTimes.reduce((sum, time) => sum + time, 0) /
              processingTimes.length
          )
        : 0;

    return res.json({
      success: true,
      analytics: {
        waiting,
        active,
        completed: completedCount,
        failed,
        delayed,
        successRate,
        averageProcessingTimeMs,
      },
    });
  } catch (error) {
    console.error("Delivery analytics error:", error.stack || error);
    return res.status(500).json({
      success: false,
      message: "Could not retrieve delivery analytics",
    });
  }
});

// Get one delivery by job ID
router.get("/:id", async (req, res) => {
  try {
    const job = await deliveryQueue.getJob(req.params.id);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Delivery job not found",
      });
    }

    return res.json({
      success: true,
      delivery: {
        id: job.id,
        pickup: job.data.pickup,
        dropoff: job.data.dropoff,
        priority: job.data.priority,
        status: await job.getState(),
        progress: job.progress || null,
        result: job.returnvalue || null,
        failedReason: job.failedReason || null,
        createdAt: new Date(job.timestamp).toISOString(),
      },
    });
  } catch (error) {
    console.error("Get delivery error:", error);
    return res.status(500).json({
      success: false,
      message: "Could not retrieve delivery",
    });
  }
});

module.exports = router;
