
const express = require("express");
const request = require("supertest");

jest.mock("../data/driverManager", () => ({
  getDrivers: jest.fn(),
}));

const { getDrivers } = require("../data/driverManager");
const driverRoutes = require("../routes/driverRoutes");

const app = express();
app.use(express.json());
app.use("/api/drivers", driverRoutes);

describe("DispatchFlow Driver API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should retrieve all drivers successfully", async () => {
    const mockDrivers = [
      { id: 1, name: "Ravi", status: "available" },
      { id: 2, name: "Kiran", status: "busy" },
    ];

    getDrivers.mockResolvedValue(mockDrivers);

    const response = await request(app).get("/api/drivers");

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.count).toBe(2);
    expect(response.body.drivers).toEqual(mockDrivers);
  });

  test("should return an empty list when no drivers exist", async () => {
    getDrivers.mockResolvedValue([]);

    const response = await request(app).get("/api/drivers");

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.count).toBe(0);
    expect(response.body.drivers).toEqual([]);
  });

  test("should return 500 when driver retrieval fails", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      getDrivers.mockRejectedValue(
        new Error("Redis connection failed")
      );

      const response = await request(app).get("/api/drivers");

      expect(response.statusCode).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Could not retrieve driver data. Check that Redis is running."
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
