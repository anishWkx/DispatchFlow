const mysql = require("mysql2/promise");
const path = require("path");
const dotenv = require("dotenv");

const isDevelopment = process.env.NODE_ENV === "development";

const environmentFile = isDevelopment
  ? ".env.development"
  : ".env";

const environmentPath = path.resolve(
  __dirname,
  "../../",
  environmentFile
);

const { error } = dotenv.config({
  path: environmentPath,
  override: isDevelopment,
});

if (error && (isDevelopment || error.code !== "ENOENT")) {
  throw new Error(
    `Failed to load ${environmentFile}: ${error.message}`
  );
}

if (
  isDevelopment &&
  (
    process.env.DB_HOST !== "127.0.0.1" ||
    Number(process.env.DB_PORT) !== 3306 ||
    process.env.DB_NAME !== "dispatchflow_dev"
  )
) {
  throw new Error(
    "SAFETY CHECK FAILED: Development must use local dispatchflow_dev on port 3306."
  );
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 4000),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl:
    process.env.DB_SSL === "false"
      ? undefined
      : { rejectUnauthorized: true },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;
