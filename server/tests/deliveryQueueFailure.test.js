const express = require("express");
const request = require("supertest");

jest.mock("../config/db", () => ({
  execute: jest.fn(),
}));

jest.mock("../queues/deliveryQueue", () => ({
  deliveryQueue: {
    add: jest.fn(),
  },
}));

jest.mock("../realtime/socket", () => ({
  emitDeliveryUpdate: jest.fn(),
}));

const pool = require("../config/db");
const { deliveryQueue } = require("../queues/deliveryQueue");
const { emitDeliveryUpdate } = require("../realtime/socket");
const deliveryRoutes = require("../routes/deliveryRoutes");

const app = express();
app.use(express.json());
app.use("/api/deliveries", deliveryRoutes);

describe("DispatchFlow Delivery Queue Failure Handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should mark delivery as failed when Redis queue insertion fails", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      pool.execute
        .mockResolvedValueOnce([{ insertId: 501 }, []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

      deliveryQueue.add.mockRejectedValueOnce(
        new Error("Redis connection failed")
      );

      const response = await request(app)
        .post("/api/deliveries")
        .send({
          pickup: "VIT-AP Campus",
          dropoff: "Mangalagiri",
          priority: "high",
        });

      expect(response.statusCode).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Could not create delivery job"
      );

      expect(pool.execute).toHaveBeenNthCalledWith(
        2,
        "UPDATE deliveries SET status = 'failed' WHERE id = ?",
        [501]
      );

      expect(deliveryQueue.add).toHaveBeenCalledTimes(1);
      expect(emitDeliveryUpdate).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  test("should return 500 when marking failed delivery in MySQL also fails", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      pool.execute
        .mockResolvedValueOnce([{ insertId: 502 }, []])
        .mockRejectedValueOnce(
          new Error("MySQL update failed")
        );

      deliveryQueue.add.mockRejectedValueOnce(
        new Error("Redis connection failed")
      );

      const response = await request(app)
        .post("/api/deliveries")
        .send({
          pickup: "Namburu",
          dropoff: "Guntur",
          priority: "normal",
        });

      expect(response.statusCode).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Could not create delivery job"
      );

      expect(pool.execute).toHaveBeenCalledTimes(2);
      expect(emitDeliveryUpdate).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  test("should return 500 when initial delivery insertion fails", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      pool.execute.mockRejectedValueOnce(
        new Error("MySQL insert failed")
      );

      const response = await request(app)
        .post("/api/deliveries")
        .send({
          pickup: "VIT-AP Campus",
          dropoff: "Guntur",
          priority: "low",
        });

      expect(response.statusCode).toBe(500);
      expect(response.body.message).toBe(
        "Could not create delivery job"
      );

      expect(deliveryQueue.add).not.toHaveBeenCalled();
      expect(emitDeliveryUpdate).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
