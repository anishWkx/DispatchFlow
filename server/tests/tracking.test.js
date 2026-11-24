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

describe("DispatchFlow Delivery Tracking API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should reject an invalid delivery ID", async () => {
    const response = await request(app)
      .get("/api/deliveries/abc");

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe("Invalid delivery ID");
  });

  test("should reject a non-positive delivery ID", async () => {
    const response = await request(app)
      .get("/api/deliveries/0");

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe("Invalid delivery ID");
  });

  test("should return 404 when delivery does not exist", async () => {
    pool.execute.mockResolvedValueOnce([[], []]);

    const response = await request(app)
      .get("/api/deliveries/101");

    expect(response.statusCode).toBe(404);
    expect(response.body.message).toBe("Delivery not found");
  });

  test("should retrieve delivery with timeline and queue details", async () => {
    const mockDelivery = {
      id: 101,
      pickup: "VIT-AP Campus",
      dropoff: "Mangalagiri",
      status: "in_transit",
    };

    const mockTimeline = {
      assignedAt: "2026-11-24T10:00:00",
      pickedUpAt: "2026-11-24T10:05:00",
      inTransitAt: "2026-11-24T10:10:00",
      deliveredAt: null,
    };

    pool.execute
      .mockResolvedValueOnce([[mockDelivery], []])
      .mockResolvedValueOnce([[mockTimeline], []]);

    const mockJob = {
      id: "delivery-101",
      progress: 65,
      returnvalue: null,
      failedReason: null,
      getState: jest.fn().mockResolvedValue("active"),
    };

    deliveryQueue.getJob.mockResolvedValue(mockJob);

    const response = await request(app)
      .get("/api/deliveries/101");

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.delivery.id).toBe(101);
    expect(response.body.delivery.timeline).toEqual(mockTimeline);
    expect(response.body.delivery.jobId).toBe("delivery-101");
    expect(response.body.delivery.queueStatus).toBe("active");
    expect(response.body.delivery.progress).toBe(65);
  });

  test("should return delivery details when no queue job exists", async () => {
    pool.execute
      .mockResolvedValueOnce([
        [{
          id: 102,
          pickup: "Namburu",
          dropoff: "Guntur",
          status: "pending",
        }],
        [],
      ])
      .mockResolvedValueOnce([[], []]);

    deliveryQueue.getJob.mockResolvedValue(null);

    const response = await request(app)
      .get("/api/deliveries/102");

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.delivery.jobId).toBeNull();
    expect(response.body.delivery.queueStatus).toBeNull();
    expect(response.body.delivery.progress).toBeNull();
    expect(response.body.delivery.timeline).toEqual({});
  });

  test("should return 500 when database retrieval fails", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      pool.execute.mockRejectedValueOnce(
        new Error("Database connection failed")
      );

      const response = await request(app)
        .get("/api/deliveries/101");

      expect(response.statusCode).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Could not retrieve delivery"
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
