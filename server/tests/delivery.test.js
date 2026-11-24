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
const deliveryRoutes = require("../routes/deliveryRoutes");

const app = express();
app.use(express.json());
app.use("/api/deliveries", deliveryRoutes);

describe("DispatchFlow Delivery API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should reject delivery when pickup and dropoff are missing", async () => {
    const response = await request(app)
      .post("/api/deliveries")
      .send({});

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe(
      "Pickup and dropoff are required"
    );
  });

  test("should reject delivery with invalid priority", async () => {
    const response = await request(app)
      .post("/api/deliveries")
      .send({
        pickup: "VIT-AP Campus",
        dropoff: "Mangalagiri",
        priority: "urgent",
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe(
      "Priority must be high, normal, or low"
    );
  });

  test("should create a delivery successfully", async () => {
    pool.execute.mockResolvedValueOnce([
      { insertId: 101 },
      [],
    ]);

    const jobData = {
      deliveryId: 101,
      pickup: "VIT-AP Campus",
      dropoff: "Mangalagiri",
      priority: "high",
    };

    deliveryQueue.add.mockResolvedValueOnce({
      id: "delivery-101",
      data: jobData,
    });

    const response = await request(app)
      .post("/api/deliveries")
      .send({
        pickup: "VIT-AP Campus",
        dropoff: "Mangalagiri",
        priority: "high",
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.deliveryId).toBe(101);
    expect(deliveryQueue.add).toHaveBeenCalled();
  });
});
