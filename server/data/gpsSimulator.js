const pool = require("../config/db");
const { getRoadRoute } = require("./roadRouting");
const { emitTrackingUpdate } = require("../realtime/socket");

const TICK_INTERVAL_MS = 1000;
const TRANSIT_DURATION_MS = 15000;

function interpolateCoordinate(start, end, progress) {
  return [
    start[0] + (end[0] - start[0]) * progress,
    start[1] + (end[1] - start[1]) * progress,
  ];
}

function getPositionAlongRoute(coordinates, progress) {
  if (!coordinates.length) {
    throw new Error("OSRM route contains no coordinates.");
  }

  if (coordinates.length === 1) {
    return coordinates[0];
  }

  const boundedProgress = Math.max(0, Math.min(1, progress));
  const segmentPosition = boundedProgress * (coordinates.length - 1);

  const segmentIndex = Math.min(
    Math.floor(segmentPosition),
    coordinates.length - 2
  );

  const segmentProgress = segmentPosition - segmentIndex;

  return interpolateCoordinate(
    coordinates[segmentIndex],
    coordinates[segmentIndex + 1],
    segmentProgress
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateDeliveryTracking({
  deliveryId,
  driverId,
  assignmentId,
  pickup,
  dropoff,
  simulatedSpeedKmph,
}) {
  const roadRoute = await getRoadRoute(pickup, dropoff);
  const coordinates = roadRoute.coordinates;

  if (coordinates.length < 2) {
    throw new Error("A valid road route requires at least two coordinates.");
  }

  console.log("🛰️ GPS simulation started:", {
    deliveryId,
    driverId,
    distanceKm: roadRoute.distanceKm,
    routePoints: coordinates.length,
    source: roadRoute.source,
  });

  const startedAt = Date.now();

  let lastRecordedProgress = -1;
  let trackingPointCount = 0;

  while (true) {
    const elapsedMs = Date.now() - startedAt;

    const progress = Math.min(
      elapsedMs / TRANSIT_DURATION_MS,
      1
    );

    const roundedProgress = Number(
      (progress * 100).toFixed(2)
    );

    if (roundedProgress !== lastRecordedProgress) {
      const [latitude, longitude] = getPositionAlongRoute(
        coordinates,
        progress
      );

      const remainingDistanceKm = Number(
        (roadRoute.distanceKm * (1 - progress)).toFixed(2)
      );

      const currentSpeedKmph =
        progress >= 1
          ? 0
          : Number(simulatedSpeedKmph.toFixed(2));

      const [result] = await pool.execute(
        `INSERT INTO delivery_tracking
         (
           delivery_id,
           driver_id,
           assignment_id,
           latitude,
           longitude,
           speed_kmph,
           remaining_distance_km,
           progress_percentage
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          deliveryId,
          driverId,
          assignmentId,
          latitude,
          longitude,
          currentSpeedKmph,
          remainingDistanceKm,
          roundedProgress,
        ]
      );

      trackingPointCount++;

      const update = {
        trackingId: Number(result.insertId),
        deliveryId,
        driverId,
        assignmentId,
        latitude: Number(latitude.toFixed(7)),
        longitude: Number(longitude.toFixed(7)),
        speedKmph: currentSpeedKmph,
        remainingDistanceKm,
        progressPercentage: roundedProgress,
        recordedAt: new Date().toISOString(),
      };

      emitTrackingUpdate(update);

      lastRecordedProgress = roundedProgress;
    }

    if (progress >= 1) {
      break;
    }

    await delay(TICK_INTERVAL_MS);
  }

  console.log(`📍 GPS simulation completed for delivery #${deliveryId}`);

  return {
    distanceKm: roadRoute.distanceKm,
    durationSeconds: roadRoute.durationSeconds,
    source: roadRoute.source,
    trackingPoints: trackingPointCount,
  };
}

module.exports = { simulateDeliveryTracking };

