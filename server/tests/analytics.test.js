
const express = require("express");
const request = require("supertest");

jest.mock("../config/db", () => ({
  execute: jest.fn(),
}));

jest.mock("../queues/deliveryQueue", () => ({
  deliveryQueue: {
    getWaitingCount: jest.fn(),
    getActiveCount: jest.fn(),
    getFailedCount: jest.fn(),
    getDelayedCount: jest.fn(),
    getJobs: jest.fn(),
    add: jest.fn(),
    getJob: jest.fn(),
  },
}));

jest.mock("../realtime/socket", () => ({
  emitDeliveryUpdate: jest.fn(),
}));

const pool = require("../config/db");
const { deliveryQueue } = require("../queues/deliveryQueue");
const deliveryRoutes = require("../routes/deliveryRoutes");

const app = express();
app.use(express.json());
app.use("/api/deliveries", deliveryRoutes);

describe("DispatchFlow Delivery Analytics API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should retrieve delivery analytics summary", async () => {
    deliveryQueue.getWaitingCount.mockResolvedValue(3);
    deliveryQueue.getActiveCount.mockResolvedValue(2);
    deliveryQueue.getFailedCount.mockResolvedValue(1);
    deliveryQueue.getDelayedCount.mockResolvedValue(4);

    pool.execute.mockResolvedValueOnce([[{ total: 5 }], []]);

    deliveryQueue.getJobs.mockResolvedValue([
      {
        finishedOn: 3000,
        processedOn: 1000,
        returnvalue: { success: true },
        failedReason: null,
      },
      {
        finishedOn: 6000,
        processedOn: 3000,
        returnvalue: { success: true },
        failedReason: null,
      },
      {
        finishedOn: 5000,
        processedOn: 2000,
        returnvalue: null,
        failedReason: "Delivery failed",
      },
    ]);

    const response = await request(app)
      .get("/api/deliveries/analytics/summary");

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.analytics).toEqual({
      waiting: 3,
      active: 2,
      completed: 5,
      failed: 1,
      delayed: 4,
      successRate: 66.7,
      averageProcessingTimeMs: 2500,
    });
  });

  test("should return zero analytics when no jobs exist", async () => {
    deliveryQueue.getWaitingCount.mockResolvedValue(0);
    deliveryQueue.getActiveCount.mockResolvedValue(0);
    deliveryQueue.getFailedCount.mockResolvedValue(0);
    deliveryQueue.getDelayedCount.mockResolvedValue(0);

    pool.execute.mockResolvedValueOnce([[{ total: 0 }], []]);
    deliveryQueue.getJobs.mockResolvedValue([]);

    const response = await request(app)
      .get("/api/deliveries/analytics/summary");

    expect(response.statusCode).toBe(200);
    expect(response.body.analytics.successRate).toBe(0);
    expect(response.body.analytics.averageProcessingTimeMs).toBe(0);
    expect(response.body.analytics.completed).toBe(0);
  });

  test("should return 500 when summary analytics retrieval fails", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      deliveryQueue.getWaitingCount.mockRejectedValue(
        new Error("Redis unavailable")
      );

      const response = await request(app)
        .get("/api/deliveries/analytics/summary");

      expect(response.statusCode).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Could not retrieve delivery analytics"
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  test("should handle delivery analytics errors without a stack", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      deliveryQueue.getWaitingCount.mockRejectedValue({
        message: "Redis error without stack",
      });

      const response = await request(app)
        .get("/api/deliveries/analytics/summary");

      expect(response.statusCode).toBe(500);
      expect(response.body.message).toBe(
        "Could not retrieve delivery analytics"
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Delivery analytics error:",
        expect.objectContaining({
          message: "Redis error without stack",
        })
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  test("should calculate ML ETA performance metrics", async () => {
    pool.execute.mockResolvedValueOnce([
      [
        {
          deliveryId: 1,
          pickup: "VIT-AP Campus",
          dropoff: "Mangalagiri",
          driverName: "Ravi",
          predictedEtaSeconds: 100,
          baselineEtaSeconds: 150,
          simulatedEtaSeconds: 120,
          deliveredAt: "2026-11-24",
        },
        {
          deliveryId: 2,
          pickup: "Namburu",
          dropoff: "Guntur",
          driverName: "Kiran",
          predictedEtaSeconds: 200,
          baselineEtaSeconds: 250,
          simulatedEtaSeconds: 180,
          deliveredAt: "2026-11-24",
        },
      ],
      [],
    ]);

    const response = await request(app)
      .get("/api/deliveries/analytics/eta");

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.metricType).toBe(
      "simulated_eta_model_vs_baseline"
    );

    expect(response.body.analytics).toEqual({
      evaluatedDeliveries: 2,
      mlModel: {
        maeSeconds: 20,
        rmseSeconds: 20,
        averageSignedErrorSeconds: 0,
      },
      formulaBaseline: {
        maeSeconds: 50,
        rmseSeconds: 53.85,
        averageSignedErrorSeconds: -50,
      },
      maeImprovementPercentage: 60,
    });

    expect(response.body.comparisons).toHaveLength(2);
    expect(response.body.comparisons[0].mlAbsoluteErrorSeconds).toBe(20);
    expect(response.body.comparisons[0].baselineAbsoluteErrorSeconds).toBe(30);
  });

  test("should return null ETA metrics when no deliveries are evaluated", async () => {
    pool.execute.mockResolvedValueOnce([[], []]);

    const response = await request(app)
      .get("/api/deliveries/analytics/eta");

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.analytics.evaluatedDeliveries).toBe(0);
    expect(response.body.analytics.mlModel.maeSeconds).toBeNull();
    expect(response.body.analytics.formulaBaseline.rmseSeconds).toBeNull();
    expect(response.body.analytics.maeImprovementPercentage).toBeNull();

    expect(response.body.comparisons).toEqual([]);
  });

  test("should return 500 when ETA analytics retrieval fails", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      pool.execute.mockRejectedValueOnce(
        new Error("Database unavailable")
      );

      const response = await request(app)
        .get("/api/deliveries/analytics/eta");

      expect(response.statusCode).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Could not retrieve ETA performance analytics"
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  test("should handle ETA analytics errors without a stack", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      pool.execute.mockRejectedValueOnce({
        message: "Database error without stack",
      });

      const response = await request(app)
        .get("/api/deliveries/analytics/eta");

      expect(response.statusCode).toBe(500);
      expect(response.body.message).toBe(
        "Could not retrieve ETA performance analytics"
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "ETA analytics error:",
        expect.objectContaining({
          message: "Database error without stack",
        })
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
