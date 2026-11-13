const fs = require("fs");
const path = require("path");

const pool = require("../config/db");
const locationConfig = require("../../shared/locations.json");
const { calculateRouteDistance } = require("../data/locationUtils");

// Reproducible dataset settings
const SEED = 20261113;
const SCENARIO_COUNT = 1000;

function createRandomGenerator(seed) {
  let state = seed;

  return function random() {
    state += 0x6D2B79F5;

    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function csvEscape(value) {
  const text = String(value ?? "");

  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

async function generateDataset() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Run this generator with NODE_ENV=development");
  }

  const random = createRandomGenerator(SEED);

  const [drivers] = await pool.query(`
    SELECT
      id,
      name,
      location,
      avg_speed_kmph,
      pickup_delay_seconds
    FROM drivers
    ORDER BY id
  `);

  if (drivers.length < 2) {
    throw new Error("At least two local drivers are required.");
  }

  for (const driver of drivers) {
    if (!locationConfig.locations.some(
      (location) => location.name === driver.location
    )) {
      throw new Error(
        `Unsupported location for driver ${driver.name}: ${driver.location}`
      );
    }

    if (
      Number(driver.avg_speed_kmph) <= 0 ||
      driver.pickup_delay_seconds == null
    ) {
      throw new Error(`Missing profile data for driver ${driver.name}`);
    }
  }

  const locations = locationConfig.locations;
  const rows = [];

  for (let scenario = 1; scenario <= SCENARIO_COUNT; scenario++) {
    const pickupIndex = Math.floor(random() * locations.length);

    let dropoffIndex = Math.floor(random() * locations.length);

    while (dropoffIndex === pickupIndex) {
      dropoffIndex = Math.floor(random() * locations.length);
    }

    const pickup = locations[pickupIndex].name;
    const dropoff = locations[dropoffIndex].name;

    // All candidate drivers face the same traffic conditions.
    const trafficMultiplier = Number(
      (1 + random() * 0.6).toFixed(2)
    );

    const deliveryDistance = calculateRouteDistance(
      pickup,
      dropoff
    ).estimatedRoadDistanceKm;

    for (const driver of drivers) {
      const driverDistance = calculateRouteDistance(
        driver.location,
        pickup
      ).estimatedRoadDistanceKm;

      const avgSpeed = Number(driver.avg_speed_kmph);
      const pickupDelay = Number(driver.pickup_delay_seconds);

      // ETA = pickup travel + pickup handling + delivery travel.
      const pickupTravelSeconds =
        (driverDistance / avgSpeed) * 3600;

      const deliveryTravelSeconds =
        (deliveryDistance / avgSpeed) *
        3600 *
        trafficMultiplier;

      const totalEtaSeconds = Math.round(
        pickupTravelSeconds +
        pickupDelay +
        deliveryTravelSeconds
      );

      rows.push({
        scenario_id: scenario,
        driver_id: driver.id,
        driver_name: driver.name,
        driver_location: driver.location,
        pickup,
        dropoff,
        avg_speed_kmph: avgSpeed,
        pickup_delay_seconds: pickupDelay,
        driver_to_pickup_km: driverDistance,
        pickup_to_dropoff_km: deliveryDistance,
        traffic_multiplier: trafficMultiplier,
        target_eta_seconds: totalEtaSeconds,
      });
    }
  }

  const headers = Object.keys(rows[0]);

  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => csvEscape(row[header])).join(",")
    ),
  ].join("\n");

  const outputDirectory = path.join(__dirname, "../ml/data");

  fs.mkdirSync(outputDirectory, { recursive: true });

  const csvPath = path.join(
    outputDirectory,
    "synthetic-driver-eta.csv"
  );

  const metadataPath = path.join(
    outputDirectory,
    "dataset-metadata.json"
  );

  fs.writeFileSync(csvPath, csv + "\n");

  fs.writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        datasetType: "synthetic",
        seed: SEED,
        scenarios: SCENARIO_COUNT,
        candidateDrivers: drivers.length,
        totalSamples: rows.length,
        target: "target_eta_seconds",
        targetUnit: "seconds",
        distanceSource: "configured location coordinates and road distance factor",
        trafficSource: "deterministically generated synthetic multiplier",
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    ) + "\n"
  );

  console.log("\nSynthetic dataset generated successfully.");
  console.log("------------------------------------------");
  console.log(`Scenarios: ${SCENARIO_COUNT}`);
  console.log(`Candidate drivers: ${drivers.length}`);
  console.log(`Total samples: ${rows.length}`);
  console.log(`Random seed: ${SEED}`);
  console.log(`CSV: ${csvPath}`);
  console.log(`Metadata: ${metadataPath}`);
  console.log("------------------------------------------");

  console.log("\nSample rows:");
  console.table(rows.slice(0, 6));
}

generateDataset()
  .catch((error) => {
    console.error("Dataset generation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
