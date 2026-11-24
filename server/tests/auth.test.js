
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

describe("DispatchFlow Authentication API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
  });

  test("should reject registration when fields are missing", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ name: "Test User" });

    expect(response.statusCode).toBe(400);
  });

  test("should reject an invalid email", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Test User",
        email: "invalid-email",
        password: "password123",
      });

    expect(response.statusCode).toBe(400);
  });

  test("should reject a password shorter than 8 characters", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Test User",
        email: "test@example.com",
        password: "123",
      });

    expect(response.statusCode).toBe(400);
  });

  test("should reject duplicate email registration", async () => {
    pool.execute.mockResolvedValueOnce([
      [{ id: 1, email: "test@example.com" }],
      [],
    ]);

    const response = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Test User",
        email: "test@example.com",
        password: "password123",
      });

    expect(response.statusCode).toBe(409);
  });

  test("should register a new user successfully", async () => {
    pool.execute
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([{ insertId: 1 }, []]);

    bcrypt.hash.mockResolvedValue("hashed-password");

    const response = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Test User",
        email: "test@example.com",
        password: "password123",
      });

    expect(response.statusCode).toBe(201);
    expect(bcrypt.hash).toHaveBeenCalled();
  });

  test("should reject login when fields are missing", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com" });

    expect(response.statusCode).toBe(400);
  });

  test("should reject login for an unknown email", async () => {
    pool.execute.mockResolvedValueOnce([[], []]);

    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: "unknown@example.com",
        password: "password123",
      });

    expect(response.statusCode).toBe(401);
  });

  test("should reject an incorrect password", async () => {
    pool.execute.mockResolvedValueOnce([
      [{
        id: 1,
        email: "test@example.com",
        password_hash: "hashed-password",
      }],
      [],
    ]);

    bcrypt.compare.mockResolvedValue(false);

    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: "test@example.com",
        password: "wrongpassword",
      });

    expect(response.statusCode).toBe(401);
  });

  test("should log in successfully and return JWT token and user details", async () => {
    const user = {
      id: 1,
      name: "Test User",
      email: "test@example.com",
      password_hash: "hashed-password",
      role: "operator",
    };

    pool.execute.mockResolvedValueOnce([[user], []]);
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue("mock-jwt-token");

    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: " TEST@EXAMPLE.COM ",
        password: "password123",
      });

    expect(response.statusCode).toBe(200);

    expect(response.body).toEqual({
      success: true,
      message: "Login successful",
      token: "mock-jwt-token",
      user: {
        id: 1,
        name: "Test User",
        email: "test@example.com",
        role: "operator",
      },
    });

    expect(bcrypt.compare).toHaveBeenCalledWith(
      "password123",
      "hashed-password"
    );

    expect(jwt.sign).toHaveBeenCalledWith(
      {
        userId: 1,
        email: "test@example.com",
        role: "operator",
      },
      "test-secret",
      {
        expiresIn: "1h",
        issuer: "dispatchflow-api",
      }
    );
  });
});
