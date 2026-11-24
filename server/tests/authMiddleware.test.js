
const express = require("express");
const request = require("supertest");

jest.mock("jsonwebtoken", () => ({
  verify: jest.fn(),
}));

const jwt = require("jsonwebtoken");

const {
  authenticateToken,
  authorizeRoles,
} = require("../middleware/authMiddleware");

const app = express();

app.get(
  "/protected",
  authenticateToken,
  (req, res) => {
    res.json({ success: true, user: req.user });
  }
);

app.get(
  "/operator",
  authenticateToken,
  authorizeRoles("operator"),
  (req, res) => {
    res.json({ success: true, message: "Operator access granted" });
  }
);

describe("DispatchFlow Authentication Middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
  });

  test("should reject requests without an authorization header", async () => {
    const response = await request(app).get("/protected");

    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe(
      "Access denied. Authentication token required."
    );
  });

  test("should reject an empty Bearer token", () => {
    const req = {
      headers: {
        authorization: "Bearer ",
      },
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    const next = jest.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Authentication token is missing",
    });

    expect(next).not.toHaveBeenCalled();
  });

  test("should reject requests when JWT_SECRET is missing", async () => {
    delete process.env.JWT_SECRET;

    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      const response = await request(app)
        .get("/protected")
        .set("Authorization", "Bearer test-token");

      expect(response.statusCode).toBe(500);
      expect(response.body.message).toBe(
        "Authentication service is not configured"
      );
    } finally {
      consoleErrorSpy.mockRestore();
      process.env.JWT_SECRET = "test-secret";
    }
  });

  test("should reject an invalid JWT", async () => {
    jwt.verify.mockImplementation((token, secret, options, callback) => {
      callback(new Error("Invalid token"));
    });

    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer invalid-token");

    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe("Invalid authentication token");
  });

  test("should reject an expired JWT", async () => {
    const error = new Error("Token expired");
    error.name = "TokenExpiredError";

    jwt.verify.mockImplementation((token, secret, options, callback) => {
      callback(error);
    });

    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer expired-token");

    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe(
      "Authentication token has expired"
    );
  });

  test("should allow requests with a valid JWT", async () => {
    const decodedUser = {
      userId: 1,
      email: "test@example.com",
      role: "operator",
    };

    jwt.verify.mockImplementation((token, secret, options, callback) => {
      callback(null, decodedUser);
    });

    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer valid-token");

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.user).toEqual(decodedUser);

    expect(jwt.verify).toHaveBeenCalledWith(
      "valid-token",
      "test-secret",
      { issuer: "dispatchflow-api" },
      expect.any(Function)
    );
  });

  test("should allow an authorized operator role", async () => {
    jwt.verify.mockImplementation((token, secret, options, callback) => {
      callback(null, {
        userId: 1,
        email: "operator@example.com",
        role: "operator",
      });
    });

    const response = await request(app)
      .get("/operator")
      .set("Authorization", "Bearer valid-token");

    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe("Operator access granted");
  });

  test("should reject an unauthorized role", async () => {
    jwt.verify.mockImplementation((token, secret, options, callback) => {
      callback(null, {
        userId: 2,
        email: "driver@example.com",
        role: "driver",
      });
    });

    const response = await request(app)
      .get("/operator")
      .set("Authorization", "Bearer valid-token");

    expect(response.statusCode).toBe(403);
    expect(response.body.message).toBe(
      "You do not have permission to access this resource"
    );
  });
});

describe("DispatchFlow Role Authorization Middleware", () => {
  const roleApp = express();

  roleApp.get(
    "/admin",
    authorizeRoles("admin"),
    (req, res) => {
      res.json({ success: true });
    }
  );

  test("should reject authorization when req.user is missing", async () => {
    const response = await request(roleApp).get("/admin");

    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe("Authentication required");
  });
});
