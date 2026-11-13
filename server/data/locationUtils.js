const locationConfig = require("../../shared/locations.json");

const { locations, roadDistanceFactor } = locationConfig;

function findLocation(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return (
    locations.find(
      (location) => location.name.toLowerCase() === normalized
    ) || null
  );
}

function calculateStraightLineDistanceKm(from, to) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;

  const [lat1, lon1] = from.coords;
  const [lat2, lon2] = to.coords;

  const earthRadiusKm = 6371;

  const latitudeDifference = toRadians(lat2 - lat1);
  const longitudeDifference = toRadians(lon2 - lon1);

  const a =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(longitudeDifference / 2) ** 2;

  const centralAngle = 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a)
  );

  return earthRadiusKm * centralAngle;
}

function calculateRouteDistance(fromValue, toValue) {
  const from = findLocation(fromValue);
  const to = findLocation(toValue);

  if (!from) {
    throw new Error(`Unsupported demo location: ${fromValue}`);
  }

  if (!to) {
    throw new Error(`Unsupported demo location: ${toValue}`);
  }

  const straightLineDistanceKm =
    calculateStraightLineDistanceKm(from, to);

  return {
    from: from.name,
    to: to.name,
    straightLineDistanceKm: Number(
      straightLineDistanceKm.toFixed(2)
    ),
    estimatedRoadDistanceKm: Number(
      (straightLineDistanceKm * roadDistanceFactor).toFixed(2)
    ),
    roadDistanceFactor,
  };
}

module.exports = {
  findLocation,
  calculateStraightLineDistanceKm,
  calculateRouteDistance,
};
