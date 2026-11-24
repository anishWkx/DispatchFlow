const express = require("express");
const request = require("supertest");

jest.mock("../config/db", () => ({
  execute: jest.fn(),
}));

jest.mock("../queues/deliveryQueue", () => ({
  deliveryQueue: {
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

describe("DispatchFlow Delivery List API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should retrieve deliveries with queue details", async () => {
    const deliveries = [
      {
        id: 101,
        pickup: "VIT-AP Campus",
        dropoff: "Mangalagiri",
        status: "in_transit",
      },
      {
        id: 102,
        pickup: "Namburu",
        dropoff: "Guntur",
        status: "pending",
      },
    ];

    pool.execute
      .mockResolvedValueOnce([[{ total: 10 }], []])
      .mockResolvedValueOnce([deliveries, []]);

    const job = {
      id: "delivery-101",
      progress: 65,
      returnvalue: null,
      failedReason: null,
      getState: jest.fn().mockResolvedValue("active"),
    };

    deliveryQueue.getJob
      .mockResolvedValueOnce(job)
      .mockResolvedValueOnce(null);

    const response = await request(app)
      .get("/api/deliveries");

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.count).toBe(2);
    expect(response.body.totalCount).toBe(10);
    expect(response.body.deliveries).toHaveLength(2);

    expect(response.body.deliveries[0]).toMatchObject({
      id: 101,
      jobId: "delivery-101",
      queueStatus: "active",
      progress: 65,
    });

    expect(response.body.deliveries[1]).toMatchObject({
      id: 102,
      jobId: null,
      queueStatus: null,
      progress: null,
    });

    expect(deliveryQueue.getJob).toHaveBeenCalledWith("delivery-101");
    expect(deliveryQueue.getJob).toHaveBeenCalledWith("delivery-102");
  });

  test("should return an empty list when no deliveries exist", async () => {
    pool.execute
      .mockResolvedValueOnce([[{ total: 0 }], []])
      .mockResolvedValueOnce([[], []]);

    const response = await request(app)
      .get("/api/deliveries");

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.count).toBe(0);
    expect(response.body.totalCount).toBe(0);
    expect(response.body.deliveries).toEqual([]);
    expect(deliveryQueue.getJob).not.toHaveBeenCalled();
  });

  test("should return the total database count separately from returned deliveries", async () => {
    const deliveries = [
      { id: 201, pickup: "Namburu", dropoff: "Guntur" },
    ];

    pool.execute
      .mockResolvedValueOnce([[{ total: 75 }], []])
      .mockResolvedValueOnce([deliveries, []]);

    deliveryQueue.getJob.mockResolvedValue(null);

    const response = await request(app)
      .get("/api/deliveries");

    expect(response.statusCode).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.totalCount).toBe(75);
  });

  test("should return 500 when database retrieval fails", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      pool.execute.mockRejectedValueOnce(
        new Error("Database unavailable")
      );

      const response = await request(app)
        .get("/api/deliveries");

      expect(response.statusCode).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Could not retrieve deliveries"
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  test("should return 500 when Redis queue lookup fails", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      pool.execute
        .mockResolvedValueOnce([[{ total: 1 }], []])
        .mockResolvedValueOnce([
          [{ id: 301, pickup: "VIT-AP", dropoff: "Guntur" }],
          [],
        ]);

      deliveryQueue.getJob.mockRejectedValueOnce(
        new Error("Redis unavailable")
      );

      const response = await request(app)
        .get("/api/deliveries");

      expect(response.statusCode).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Could not retrieve deliveries"
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
