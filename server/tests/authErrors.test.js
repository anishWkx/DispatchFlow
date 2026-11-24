const express = require("express");
const request = require("supertest");

jest.mock("../config/db", () => ({
  execute: jest.fn(),
}));

jest.mock("bcrypt", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock("jsonwebtoken", () => ({
  sign: jest.fn(),
}));

const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const authRoutes = require("../routes/authRoutes");

const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);

describe("DispatchFlow Authentication Error Handling", () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  test("should handle duplicate email database error during registration", async () => {
    pool.execute
      .mockResolvedValueOnce([[], []])
      .mockRejectedValueOnce(
        Object.assign(new Error("Duplicate entry"), {
          code: "ER_DUP_ENTRY",
        })
      );

    bcrypt.hash.mockResolvedValue("hashed-password");

    const response = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Anish",
        email: "anish@example.com",
        password: "password123",
      });

    expect(response.statusCode).toBe(409);
    expect(response.body.message).toBe(
      "An account with this email already exists"
    );
  });

  test("should return 500 when registration database operation fails", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      pool.execute.mockRejectedValueOnce(
        new Error("Database unavailable")
      );

      const response = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Anish",
          email: "anish@example.com",
          password: "password123",
        });

      expect(response.statusCode).toBe(500);
      expect(response.body.message).toBe("Could not register user");
    } finally {
      spy.mockRestore();
    }
  });

  test("should return 500 when password hashing fails", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      pool.execute.mockResolvedValueOnce([[], []]);
      bcrypt.hash.mockRejectedValueOnce(new Error("Hash failed"));

      const response = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Anish",
          email: "anish@example.com",
          password: "password123",
        });

      expect(response.statusCode).toBe(500);
      expect(response.body.message).toBe("Could not register user");
    } finally {
      spy.mockRestore();
    }
  });

  test("should reject non-string login credentials", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: 12345,
        password: "password123",
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe("Invalid login details");
    expect(pool.execute).not.toHaveBeenCalled();
  });

  test("should return 500 when JWT_SECRET is missing", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      pool.execute.mockResolvedValueOnce([
        [{
          id: 1,
          name: "Anish",
          email: "anish@example.com",
          password_hash: "hashed-password",
          role: "operator",
        }],
        [],
      ]);

      bcrypt.compare.mockResolvedValue(true);
      delete process.env.JWT_SECRET;

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "anish@example.com",
          password: "password123",
        });

      expect(response.statusCode).toBe(500);
      expect(response.body.message).toBe("Could not log in");
      expect(jwt.sign).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test("should return 500 when JWT signing fails", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      pool.execute.mockResolvedValueOnce([
        [{
          id: 1,
          name: "Anish",
          email: "anish@example.com",
          password_hash: "hashed-password",
          role: "operator",
        }],
        [],
      ]);

      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockImplementation(() => {
        throw new Error("JWT signing failed");
      });

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "anish@example.com",
          password: "password123",
        });

      expect(response.statusCode).toBe(500);
      expect(response.body.message).toBe("Could not log in");
    } finally {
      spy.mockRestore();
    }
  });

  test("should return 500 when login database lookup fails", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      pool.execute.mockRejectedValueOnce(
        new Error("Database unavailable")
      );

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "anish@example.com",
          password: "password123",
        });

      expect(response.statusCode).toBe(500);
      expect(response.body.message).toBe("Could not log in");
    } finally {
      spy.mockRestore();
    }
  });
});
