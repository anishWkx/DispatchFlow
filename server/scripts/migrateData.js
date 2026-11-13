const mysql = require("mysql2/promise");
const pool = require("../config/db");

const localDB = {
  host: "127.0.0.1",
  port: 3306,
  user: "dispatchflow_app",
  password: process.env.LOCAL_DB_PASSWORD,
  database: "dispatchflow",
};

const tables = [
  "users",
  "drivers",
  "deliveries",
  "delivery_assignments",
];

async function migrate() {
  let source;
  let target;

  try {
    source = await mysql.createConnection(localDB);
    target = await pool.getConnection();

    await target.beginTransaction();

    for (const table of tables) {
      const [rows] = await source.query(
        `SELECT * FROM \`${table}\``
      );

      if (rows.length === 0) {
        console.log(`${table}: no records to copy`);
        continue;
      }

      const columns = Object.keys(rows[0]);

      const columnNames = columns
        .map((column) => `\`${column}\``)
        .join(", ");

      const placeholders = columns.map(() => "?").join(", ");

      const sql = `INSERT INTO \`${table}\` (${columnNames})
                   VALUES (${placeholders})`;

      for (const row of rows) {
        await target.execute(
          sql,
          columns.map((column) => row[column])
        );
      }

      console.log(`${table}: ${rows.length} records copied`);
    }

    await target.commit();
    console.log("Migration completed successfully!");
  } catch (error) {
    if (target) await target.rollback();
    console.error("Migration failed:", error.message);
  } finally {
    if (source) await source.end();
    if (target) target.release();
    await pool.end();
  }
}

if (!localDB.password) {
  console.error("Local MySQL password is missing.");
  process.exit(1);
}

migrate();
