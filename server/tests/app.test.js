const request = require("supertest");

jest.mock("../routes/authRoutes", () => {
  const express = require("express");
  const router = express.Router();

  router.post("/login", (req, res) => {
    res.json({ success: true, message: "Login route reached" });
  });

  return router;
});

jest.mock("../routes/deliveryRoutes", () => {
  const express = require("express");
  const router = express.Router();

  router.get("/", (req, res) => {
    res.json({ success: true, message: "Deliveries route reached" });
  });

  return router;
});

jest.mock("../routes/driverRoutes", () => {
  const express = require("express");
  const router = express.Router();

  router.get("/", (req, res) => {
    res.json({ success: true, message: "Drivers route reached" });
  });

  return router;
});

jest.mock("../middleware/authMiddleware", () => ({
  authenticateToken: (req, res, next) => {
    if (req.headers.authorization === "Bearer valid-test-token") {
      req.user = { id: 1, role: "operator" };
      return next();
    }

    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  },
}));

const app = require("../app");

describe("DispatchFlow Express Application Integration", () => {
  test("should return the welcome message", async () => {
    const response = await request(app).get("/");

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      message: "Welcome to DispatchFlow API!",
      status: "running",
    });
  });

  test("should return a healthy public health check", async () => {
    const response = await request(app).get("/api/health");

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      success: true,
      service: "DispatchFlow Backend",
      status: "healthy",
    });
  });

  test("should allow access to public authentication routes", async () => {
    const response = await request(app)
      .post("/api/auth/login");

    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe("Login route reached");
  });

  test("should reject delivery requests without authentication", async () => {
    const response = await request(app)
      .get("/api/deliveries");

    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe("Unauthorized");
  });

  test("should allow authenticated delivery requests", async () => {
    const response = await request(app)
      .get("/api/deliveries")
      .set("Authorization", "Bearer valid-test-token");

    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe("Deliveries route reached");
  });

  test("should reject driver requests without authentication", async () => {
    const response = await request(app)
      .get("/api/drivers");

    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe("Unauthorized");
  });

  test("should allow authenticated driver requests", async () => {
    const response = await request(app)
      .get("/api/drivers")
      .set("Authorization", "Bearer valid-test-token");

    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe("Drivers route reached");
  });

  test("should return 404 for an unknown API route", async () => {
    const response = await request(app)
      .get("/api/unknown");

    expect(response.statusCode).toBe(404);
  });
});
