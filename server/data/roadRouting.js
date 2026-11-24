
const { findLocation } = require("./locationUtils");

const OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/driving";
const REQUEST_TIMEOUT_MS = 10000;

async function getRoadRoute(fromValue, toValue) {
  const from = findLocation(fromValue);
  const to = findLocation(toValue);

  if (!from || !to) {
    throw new Error(
      `Unsupported route: ${fromValue} → ${toValue}`
    );
  }

  // OSRM expects longitude,latitude.
  const [fromLat, fromLon] = from.coords;
  const [toLat, toLon] = to.coords;

  const url =
    `${OSRM_BASE_URL}/` +
    `${fromLon},${fromLat};${toLon},${toLat}` +
    "?overview=full&geometries=geojson&steps=false";

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "DispatchFlow/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`OSRM HTTP error: ${response.status}`);
    }

    const data = await response.json();

    if (
      data.code !== "Ok" ||
      !Array.isArray(data.routes) ||
      !data.routes[0]?.geometry?.coordinates?.length
    ) {
      throw new Error("OSRM returned no valid road route.");
    }

    const roadRoute = data.routes[0];

    // Convert [longitude, latitude] to [latitude, longitude].
    const coordinates = roadRoute.geometry.coordinates.map(
      ([longitude, latitude]) => [latitude, longitude]
    );

    return {
      from: from.name,
      to: to.name,
      coordinates,
      distanceKm: Number(
        (roadRoute.distance / 1000).toFixed(2)
      ),
      durationSeconds: Math.round(roadRoute.duration),
      source: "OSRM",
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  getRoadRoute,
};
