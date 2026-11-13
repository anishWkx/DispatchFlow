const express = require("express");
const router = express.Router();
const { deliveryQueue } = require("../queues/deliveryQueue");
const pool = require("../config/db");
const { emitDeliveryUpdate } = require("../realtime/socket");

const priorityMap = {
  high: 1,
  normal: 5,
  low: 10,
};

// Create a delivery job
router.post("/", async (req, res) => {
  let deliveryId;

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

    const [insertResult] = await pool.execute(
      `INSERT INTO deliveries (pickup, dropoff, priority, status)
       VALUES (?, ?, ?, 'pending')`,
      [pickup, dropoff, priority]
    );

    deliveryId = insertResult.insertId;

    let job;

    try {
      job = await deliveryQueue.add(
        "deliver-order",
        { deliveryId, pickup, dropoff, priority },
        {
          jobId: `delivery-${deliveryId}`,
          priority: priorityMap[priority],
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: false,
        }
      );
    } catch (queueError) {
      await pool.execute(
        "UPDATE deliveries SET status = 'failed' WHERE id = ?",
        [deliveryId]
      );

      throw queueError;
    }

    emitDeliveryUpdate({
      deliveryId,
      status: "pending",
      pickup,
      dropoff,
      priority,
    });

    return res.status(201).json({
      success: true,
      message: "Delivery saved in MySQL and added to queue",
      deliveryId,
      jobId: job.id,
      data: job.data,
    });
  } catch (error) {
    console.error("Create delivery error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not create delivery job",
    });
  }
});

// Get recent deliveries from MySQL
router.get("/", async (req, res) => {
  try {
    const [countRows] = await pool.execute(
      "SELECT COUNT(*) AS total FROM deliveries"
    );
    const totalCount = Number(countRows[0].total);

    const [rows] = await pool.execute(
      `SELECT * FROM deliveries
       ORDER BY created_at DESC
       LIMIT 50`
    );

    const deliveries = await Promise.all(
      rows.map(async (delivery) => {
        const job = await deliveryQueue.getJob(
          `delivery-${delivery.id}`
        );

        return {
          ...delivery,
          jobId: job?.id || null,
          queueStatus: job ? await job.getState() : null,
          progress: job?.progress || null,
          result: job?.returnvalue || null,
          failedReason: job?.failedReason || null,
        };
      })
    );

    return res.json({
      success: true,
      count: deliveries.length,
      totalCount,
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

// Existing delivery queue analytics
router.get("/analytics/summary", async (req, res) => {
  try {
    const [
      waiting,
      active,
      completedRows,
      failed,
      delayed,
    ] = await Promise.all([
      deliveryQueue.getWaitingCount(),
      deliveryQueue.getActiveCount(),
      pool.execute(
        "SELECT COUNT(*) AS total FROM deliveries WHERE status = 'delivered'"
      ),
      deliveryQueue.getFailedCount(),
      deliveryQueue.getDelayedCount(),
    ]);

    const completed = Number(completedRows[0][0].total) || 0;

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
        ? Number(
            ((successfulCount / totalFinished) * 100).toFixed(1)
          )
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
        completed,
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

// ML ETA prediction performance against simulated durations
router.get("/analytics/eta", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         d.id AS deliveryId,
         d.pickup,
         d.dropoff,
         dr.name AS driverName,
         a.predicted_eta_seconds AS predictedEtaSeconds,

         ROUND(
           (a.driver_to_pickup_km / dr.avg_speed_kmph) * 3600
           + dr.pickup_delay_seconds
           + (a.pickup_to_dropoff_km / dr.avg_speed_kmph)
             * 3600 * a.traffic_multiplier
         ) AS baselineEtaSeconds,

         (
           a.simulated_pickup_seconds + a.simulated_travel_seconds
         ) AS simulatedEtaSeconds,

         a.delivered_at AS deliveredAt

       FROM delivery_assignments a
       INNER JOIN deliveries d ON d.id = a.delivery_id
       INNER JOIN drivers dr ON dr.id = a.driver_id

       WHERE d.status = 'delivered'
         AND a.delivered_at IS NOT NULL
         AND a.predicted_eta_seconds IS NOT NULL
         AND a.simulated_pickup_seconds IS NOT NULL
         AND a.simulated_travel_seconds IS NOT NULL
         AND dr.avg_speed_kmph > 0

       ORDER BY a.delivered_at DESC`
    );

    const comparisons = rows.map((row) => {
      const predicted = Number(row.predictedEtaSeconds);
      const baseline = Number(row.baselineEtaSeconds);
      const simulated = Number(row.simulatedEtaSeconds);

      return {
        ...row,
        deliveryId: Number(row.deliveryId),
        predictedEtaSeconds: predicted,
        baselineEtaSeconds: baseline,
        simulatedEtaSeconds: simulated,
        mlAbsoluteErrorSeconds: Math.abs(simulated - predicted),
        mlSignedErrorSeconds: simulated - predicted,
        baselineAbsoluteErrorSeconds: Math.abs(simulated - baseline),
        baselineSignedErrorSeconds: simulated - baseline,
      };
    });

    const count = comparisons.length;

    function calculateMetrics(predictionKey, absoluteErrorKey, signedErrorKey) {
      if (count === 0) {
        return {
          maeSeconds: null,
          rmseSeconds: null,
          averageSignedErrorSeconds: null,
        };
      }

      const absoluteErrors = comparisons.map(
        (row) => row[absoluteErrorKey]
      );

      const signedErrors = comparisons.map(
        (row) => row[signedErrorKey]
      );

      const mae =
        absoluteErrors.reduce((sum, value) => sum + value, 0) / count;

      const mse =
        absoluteErrors.reduce((sum, value) => sum + value * value, 0) / count;

      const signedMean =
        signedErrors.reduce((sum, value) => sum + value, 0) / count;

      return {
        maeSeconds: Number(mae.toFixed(2)),
        rmseSeconds: Number(Math.sqrt(mse).toFixed(2)),
        averageSignedErrorSeconds: Number(signedMean.toFixed(2)),
      };
    }

    const mlMetrics = calculateMetrics(
      "predictedEtaSeconds",
      "mlAbsoluteErrorSeconds",
      "mlSignedErrorSeconds"
    );

    const baselineMetrics = calculateMetrics(
      "baselineEtaSeconds",
      "baselineAbsoluteErrorSeconds",
      "baselineSignedErrorSeconds"
    );

    const improvementPercentage =
      count > 0 && baselineMetrics.maeSeconds > 0
        ? Number(
            (
              ((baselineMetrics.maeSeconds - mlMetrics.maeSeconds) /
                baselineMetrics.maeSeconds) *
              100
            ).toFixed(2)
          )
        : null;

    return res.json({
      success: true,
      metricType: "simulated_eta_model_vs_baseline",

      analytics: {
        evaluatedDeliveries: count,
        mlModel: mlMetrics,
        formulaBaseline: baselineMetrics,
        maeImprovementPercentage: improvementPercentage,
      },

      interpretation: {
        mae: "Mean absolute difference between predicted and simulated ETA.",
        rmse: "Root mean squared prediction error. Lower is better.",
        signedError: "Positive means underestimation; negative means overestimation.",
        improvementPercentage:
          "Positive means the ML model has lower MAE than the formula baseline. Negative means the baseline performs better.",
        limitation:
          "Evaluation uses synthetic simulation data and is not evidence of real-world ETA accuracy.",
      },

      comparisons: comparisons.slice(0, 20),
    });
  } catch (error) {
    console.error("ETA analytics error:", error.stack || error);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve ETA performance analytics",
    });
  }
});

// Get one delivery by MySQL ID
router.get("/:id", async (req, res) => {
  try {
    const deliveryId = Number(req.params.id);

    if (!Number.isInteger(deliveryId) || deliveryId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid delivery ID",
      });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM deliveries WHERE id = ?",
      [deliveryId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found",
      });
    }

    const delivery = rows[0];

    const [assignmentRows] = await pool.execute(
      `SELECT
         assigned_at AS assignedAt,
         picked_up_at AS pickedUpAt,
         in_transit_at AS inTransitAt,
         delivered_at AS deliveredAt
       FROM delivery_assignments
       WHERE delivery_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [deliveryId]
    );

    const timeline = assignmentRows[0] || {};

    const job = await deliveryQueue.getJob(
      `delivery-${deliveryId}`
    );

    return res.json({
      success: true,
      delivery: {
        ...delivery,
        timeline,
        jobId: job?.id || null,
        queueStatus: job ? await job.getState() : null,
        progress: job?.progress || null,
        result: job?.returnvalue || null,
        failedReason: job?.failedReason || null,
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
