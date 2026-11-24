
const request = require("supertest");

jest.mock("../routes/authRoutes", () => require("express").Router());
jest.mock("../routes/deliveryRoutes", () => require("express").Router());
jest.mock("../routes/driverRoutes", () => require("express").Router());

const app = require("../app");

describe("DispatchFlow API Health Checks", () => {
  test("GET / should return the welcome message", async () => {
    const response = await request(app).get("/");

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      message: "Welcome to DispatchFlow API!",
      status: "running",
    });
  });

  test("GET /api/health should return healthy status", async () => {
    const response = await request(app).get("/api/health");

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      success: true,
      service: "DispatchFlow Backend",
      status: "healthy",
    });
  });
});
