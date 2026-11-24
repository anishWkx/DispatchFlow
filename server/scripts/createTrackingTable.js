
const pool = require("../config/db");

async function createTrackingTable() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS delivery_tracking (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        delivery_id INT NOT NULL,
        driver_id INT NOT NULL,
        assignment_id INT NOT NULL,
        latitude DECIMAL(10, 7) NOT NULL,
        longitude DECIMAL(10, 7) NOT NULL,
        speed_kmph DECIMAL(6, 2) NOT NULL DEFAULT 0,
        remaining_distance_km DECIMAL(8, 2) DEFAULT NULL,
        progress_percentage DECIMAL(5, 2) DEFAULT 0,
        recorded_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

        INDEX idx_tracking_delivery_time (
          delivery_id,
          recorded_at
        ),

        INDEX idx_tracking_assignment (
          assignment_id
        )
      )
    `);

    console.log("GPS tracking table created successfully.");
  } catch (error) {
    console.error("GPS tracking table setup failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

createTrackingTable();
