
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./DispatchMap.css";
import locationConfig from "../../shared/locations.json";

const locations = locationConfig.locations;

const ACTIVE_STATUSES = ["assigned", "picked_up", "in_transit"];

const ROUTE_COLORS = {
  assigned: "#f59e0b",
  picked_up: "#38bdf8",
  in_transit: "#22c55e",
};

const makeIcon = (label, className) =>
  L.divIcon({
    className: "",
    html: `<div class="${className}">${label}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

const driverIcon = makeIcon("🚚", "driver-map-marker");
const pickupIcon = makeIcon("P", "pickup-map-marker");
const dropoffIcon = makeIcon("D", "dropoff-map-marker");

const routeCache = new Map();

async function fetchRoadRoute(pickup, dropoff, signal) {
  const [pickupLat, pickupLon] = pickup.coords;
  const [dropoffLat, dropoffLon] = dropoff.coords;

  const cacheKey = [
    pickupLat,
    pickupLon,
    dropoffLat,
    dropoffLon,
  ].join(",");

  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey);
  }

  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${pickupLon},${pickupLat};${dropoffLon},${dropoffLat}` +
    `?overview=full&geometries=geojson&steps=false`;

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error("Routing service is unavailable.");
  }

  const data = await response.json();

  if (data.code !== "Ok" || !data.routes?.length) {
    throw new Error("No driving route found.");
  }

  const roadRoute = data.routes[0];
  routeCache.set(cacheKey, roadRoute);

  return roadRoute;
}

function findLocation(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) return null;

  return (
    locations.find(
      (location) => location.name.toLowerCase() === normalized
    ) ||
    locations.find(
      (location) =>
        normalized.includes(location.name.toLowerCase()) ||
        location.name.toLowerCase().includes(normalized)
    ) ||
    null
  );
}

function getRoutePositions(route) {
  return (
    route?.geometry?.coordinates?.map(
      ([longitude, latitude]) => [latitude, longitude]
    ) || []
  );
}

function getPositionAlongRoute(positions, progress) {
  if (!positions.length) return null;
  if (positions.length === 1) return positions[0];

  const segments = [];
  let totalLength = 0;

  for (let i = 0; i < positions.length - 1; i++) {
    const [lat1, lon1] = positions[i];
    const [lat2, lon2] = positions[i + 1];

    const meanLat = ((lat1 + lat2) / 2) * (Math.PI / 180);
    const latDistance = lat2 - lat1;
    const lonDistance = (lon2 - lon1) * Math.cos(meanLat);
    const length = Math.hypot(latDistance, lonDistance);

    segments.push(length);
    totalLength += length;
  }

  if (totalLength === 0) return positions[0];

  let remaining =
    Math.max(0, Math.min(1, progress)) * totalLength;

  for (let i = 0; i < segments.length; i++) {
    if (remaining <= segments[i] || i === segments.length - 1) {
      const ratio =
        segments[i] === 0 ? 0 : remaining / segments[i];

      const [lat1, lon1] = positions[i];
      const [lat2, lon2] = positions[i + 1];

      return [
        lat1 + (lat2 - lat1) * ratio,
        lon1 + (lon2 - lon1) * ratio,
      ];
    }

    remaining -= segments[i];
  }

  return positions[positions.length - 1];
}

function MapControls({ positions }) {
  const map = useMap();

  function resetView() {
    if (positions.length > 1) {
      map.fitBounds(positions, {
        padding: [45, 45],
        maxZoom: 14,
      });
    } else {
      map.setView(locations[0].coords, 12);
    }
  }

  return (
    <button
      className="map-reset-button"
      type="button"
      onClick={resetView}
    >
      Fit fleet / Reset
    </button>
  );
}

function formatStatus(status) {
  return String(status || "unknown").replaceAll("_", " ");
}

function getTrackingPosition(tracking) {
  if (
    !tracking ||
    !Number.isFinite(Number(tracking.latitude)) ||
    !Number.isFinite(Number(tracking.longitude))
  ) {
    return null;
  }

  return [
    Number(tracking.latitude),
    Number(tracking.longitude),
  ];
}

export default function DispatchMap({
  deliveries = [],
  drivers = [],
  trackingPositions = {},
}) {
  const [selected, setSelected] = useState("all");
  const [route, setRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [animatedPositions, setAnimatedPositions] = useState({});
  const [fleetRoutes, setFleetRoutes] = useState({});

  const selectedDelivery = deliveries.find(
    (delivery) => String(delivery.id) === selected
  );

  const pickup = selectedDelivery
    ? findLocation(selectedDelivery.pickup)
    : null;

  const dropoff = selectedDelivery
    ? findLocation(selectedDelivery.dropoff)
    : null;

  const status = String(
    selectedDelivery?.status || ""
  ).toLowerCase();

  const priority = selectedDelivery?.priority || "—";

  const selectedTracking =
    trackingPositions[String(selectedDelivery?.id)];

  const selectedGpsPosition =
    getTrackingPosition(selectedTracking);

  const statusSteps = [
    { key: "assigned", label: "Assigned" },
    { key: "picked_up", label: "Picked up" },
    { key: "in_transit", label: "In transit" },
    { key: "delivered", label: "Delivered" },
  ];

  const currentStep = Math.max(
    0,
    statusSteps.findIndex((step) => step.key === status)
  );

  const progressPercentage =
    selectedTracking?.progressPercentage != null &&
    status === "in_transit"
      ? Number(selectedTracking.progressPercentage)
      : status === "delivered"
        ? 100
        : status === "in_transit"
          ? 75
          : status === "picked_up"
            ? 45
            : 20;

  const assignedDriver = selectedDelivery?.driver_id
    ? drivers.find(
        (driver) =>
          Number(driver.id) === Number(selectedDelivery.driver_id)
      )
    : null;

  // Fleet overview from actual API data.
  const activeDeliveries = useMemo(
    () =>
      deliveries.filter((delivery) =>
        ACTIVE_STATUSES.includes(
          String(delivery.status || "").toLowerCase()
        )
      ),
    [deliveries]
  );

  const completedCount = deliveries.filter((delivery) =>
    ["delivered", "completed"].includes(
      String(delivery.status || "").toLowerCase()
    )
  ).length;

  const availableDrivers = drivers.filter(
    (driver) =>
      String(driver.status || "").toLowerCase() === "available"
  ).length;

  const busyDrivers = drivers.filter(
    (driver) =>
      String(driver.status || "").toLowerCase() === "busy"
  ).length;

  // Fetch routes for up to four other active deliveries.
  const additionalRouteDeliveries = useMemo(
    () =>
      activeDeliveries
        .filter(
          (delivery) => String(delivery.id) !== selected
        )
        .filter(
          (delivery) =>
            findLocation(delivery.pickup) &&
            findLocation(delivery.dropoff)
        )
        .slice(0, 4),
    [activeDeliveries, selected]
  );

  // Load additional fleet routes sequentially.
  useEffect(() => {
    const controller = new AbortController();

    async function loadFleetRoutes() {
      setFleetRoutes({});

      const nextRoutes = {};

      for (const delivery of additionalRouteDeliveries) {
        if (controller.signal.aborted) return;

        const routePickup = findLocation(delivery.pickup);
        const routeDropoff = findLocation(delivery.dropoff);

        if (!routePickup || !routeDropoff) continue;

        try {
          const roadRoute = await fetchRoadRoute(
            routePickup,
            routeDropoff,
            controller.signal
          );

          if (controller.signal.aborted) return;

          nextRoutes[delivery.id] = roadRoute;
          setFleetRoutes({ ...nextRoutes });
        } catch (error) {
          if (error.name !== "AbortError") {
            console.warn(
              `Could not load route for job ${delivery.id}:`,
              error.message
            );
          }
        }
      }
    }

    loadFleetRoutes();

    return () => controller.abort();
  }, [additionalRouteDeliveries]);

  const routePositions = useMemo(
    () => getRoutePositions(route),
    [route]
  );

  // Fetch the selected delivery's road route.
  useEffect(() => {
    if (!pickup || !dropoff) {
      setRoute(null);
      setRouteError("");
      setRouteLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadRoute() {
      setRoute(null);
      setRouteError("");
      setRouteLoading(true);

      try {
        const roadRoute = await fetchRoadRoute(
          pickup,
          dropoff,
          controller.signal
        );

        setRoute(roadRoute);
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Route loading error:", error);
          setRouteError(
            error.message || "Could not load road route."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setRouteLoading(false);
        }
      }
    }

    loadRoute();

    return () => controller.abort();
  }, [pickup, dropoff]);

  // Build fallback routes for in-transit deliveries.
  // Backend GPS coordinates take priority over this animation.
  const animationRoutes = useMemo(() => {
    const result = {};

    for (const delivery of activeDeliveries) {
      const deliveryStatus = String(
        delivery.status || ""
      ).toLowerCase();

      if (deliveryStatus !== "in_transit") continue;

      const deliveryRoute =
        String(delivery.id) === selected
          ? route
          : fleetRoutes[delivery.id];

      const positions = getRoutePositions(deliveryRoute);

      if (positions.length > 1) {
        result[String(delivery.id)] = positions;
      }
    }

    return result;
  }, [activeDeliveries, selected, route, fleetRoutes]);

  // Keep the original local animation as a fallback.
  useEffect(() => {
    const deliveryIds = Object.keys(animationRoutes);

    if (deliveryIds.length === 0) {
      setAnimatedPositions({});
      return;
    }

    const duration = 15000;
    const startTime = Date.now();

    setAnimatedPositions((previous) => {
      const next = { ...previous };

      deliveryIds.forEach((id) => {
        next[id] = animationRoutes[id][0];
      });

      return next;
    });

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const nextPositions = {};

      deliveryIds.forEach((id) => {
        nextPositions[id] = getPositionAlongRoute(
          animationRoutes[id],
          progress
        );
      });

      setAnimatedPositions((previous) => ({
        ...previous,
        ...nextPositions,
      }));

      if (progress >= 1) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [animationRoutes]);

  const isTracking =
    status === "in_transit" || status === "delivered";

  // Backend GPS is the primary source of the selected truck position.
  const truckPosition =
    selectedGpsPosition ||
    (status === "delivered" && routePositions.length > 1
      ? routePositions[routePositions.length - 1]
      : animatedPositions[String(selectedDelivery?.id)] || null);

  const distanceKm = route
    ? (route.distance / 1000).toFixed(2)
    : null;

  const durationMinutes = route
    ? Math.round(route.duration / 60)
    : null;

  // Combine all known route points for the map's fit control.
  const allMapPositions = useMemo(() => {
    const positions = [...routePositions];

    for (const roadRoute of Object.values(fleetRoutes)) {
      positions.push(...getRoutePositions(roadRoute));
    }

    if (pickup) positions.push(pickup.coords);
    if (dropoff) positions.push(dropoff.coords);

    for (const delivery of additionalRouteDeliveries) {
      const p = findLocation(delivery.pickup);
      const d = findLocation(delivery.dropoff);

      if (p) positions.push(p.coords);
      if (d) positions.push(d.coords);
    }

    return positions;
  }, [
    routePositions,
    fleetRoutes,
    pickup,
    dropoff,
    additionalRouteDeliveries,
  ]);

  function selectDelivery(id) {
    setSelected(String(id));
  }

  return (
    <section className="map-panel">
      <div className="map-panel-header">
        <div>
          <span className="map-eyebrow">
            FLEET OPERATIONS · LIVE QUEUE DATA
          </span>
          <h3>Fleet command center</h3>
          <p>
            Delivery routes, driver assignments and dispatch activity.
          </p>
        </div>

        <select
          value={selected}
          onChange={(event) => selectDelivery(event.target.value)}
          aria-label="Select delivery"
        >
          <option value="all">Select a delivery</option>

          {deliveries.map((delivery) => (
            <option
              key={delivery.id}
              value={String(delivery.id)}
            >
              Job #{delivery.id} · {formatStatus(delivery.status)}
            </option>
          ))}
        </select>
      </div>

      {/* Fleet metrics */}
      <div className="fleet-metrics">
        <div className="fleet-metric-card">
          <span className="fleet-metric-label">ACTIVE DELIVERIES</span>
          <strong>{activeDeliveries.length}</strong>
          <span className="fleet-metric-hint">Assigned and in progress</span>
        </div>

        <div className="fleet-metric-card">
          <span className="fleet-metric-label">AVAILABLE DRIVERS</span>
          <strong>{availableDrivers}</strong>
          <span className="fleet-metric-hint">Ready for assignment</span>
        </div>

        <div className="fleet-metric-card">
          <span className="fleet-metric-label">BUSY DRIVERS</span>
          <strong>{busyDrivers}</strong>
          <span className="fleet-metric-hint">Currently assigned</span>
        </div>

        <div className="fleet-metric-card">
          <span className="fleet-metric-label">COMPLETED</span>
          <strong>{completedCount}</strong>
          <span className="fleet-metric-hint">In loaded delivery records</span>
        </div>
      </div>

      {selectedDelivery && (
        <div className="selected-delivery-details">
          {[
            ["JOB", `#${selectedDelivery.id}`],
            ["PICKUP", selectedDelivery.pickup],
            ["DROP-OFF", selectedDelivery.dropoff],
            ["STATUS", selectedDelivery.status],
            ["PRIORITY", priority],
          ].map(([label, value]) => (
            <div className="selected-detail-card" key={label}>
              <span>{label}</span>
              <strong>{String(value || "—")}</strong>
            </div>
          ))}
        </div>
      )}

      {selectedDelivery && (
        <div className="selected-route-metrics">
          <div>
            <span>ROAD DISTANCE</span>
            <strong>
              {routeLoading
                ? "Loading..."
                : distanceKm
                  ? `${distanceKm} km`
                  : "—"}
            </strong>
          </div>

          <div>
            <span>ESTIMATED DRIVING TIME</span>
            <strong>
              {routeLoading
                ? "Loading..."
                : durationMinutes !== null
                  ? `${durationMinutes} min`
                  : "—"}
            </strong>
          </div>
        </div>
      )}

      {selectedDelivery && (
        <div className="delivery-tracking-panel">
          <div className="tracking-heading">
            <div>
              <span className="tracking-label">DELIVERY LIFECYCLE</span>
              <h4>Delivery progress</h4>
            </div>
            <strong>{progressPercentage}%</strong>
          </div>

          <div className="tracking-progress-track">
            <div
              className="tracking-progress-fill"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          <div className="tracking-steps">
            {statusSteps.map((step, index) => {
              const completed = index <= currentStep;
              const active = index === currentStep;

              return (
                <div
                  key={step.key}
                  className={`tracking-step ${
                    completed ? "completed" : ""
                  } ${active ? "active" : ""}`}
                >
                  <span className="tracking-step-dot">
                    {index < currentStep ? "✓" : index + 1}
                  </span>
                  <span>{step.label}</span>
                </div>
              );
            })}
          </div>

          {selectedTracking && (
            <div className="selected-route-metrics">
              <div>
                <span>SIMULATED SPEED</span>
                <strong>
                  {Number(selectedTracking.speedKmph || 0).toFixed(1)} km/h
                </strong>
              </div>

              <div>
                <span>REMAINING DISTANCE</span>
                <strong>
                  {selectedTracking.remainingDistanceKm != null
                    ? `${Number(
                        selectedTracking.remainingDistanceKm
                      ).toFixed(2)} km`
                    : "—"}
                </strong>
              </div>
            </div>
          )}

          <div className="driver-info-card">
            <div className="driver-info-icon">🚚</div>

            <div className="driver-info-content">
              <span className="tracking-label">ASSIGNED DRIVER</span>
              <strong>
                {assignedDriver?.name ||
                  "Awaiting driver information"}
              </strong>
              <span>
                {assignedDriver
                  ? `Stored location: ${
                      assignedDriver.location || "Unavailable"
                    }`
                  : "Driver details are not currently available"}
              </span>
            </div>

            <span className="driver-status">
              {assignedDriver?.status || "—"}
            </span>
          </div>

          <div className="tracking-demo-note">
            <span>●</span>
            {selectedTracking
              ? "Backend GPS simulation · OSRM road coordinates"
              : "Waiting for backend GPS updates..."}
          </div>
        </div>
      )}

      {/* Map and fleet sidebar */}
      <div className="fleet-command-layout">
        <div className="fleet-map-column">
          <div className="dispatch-map">
            <MapContainer
              center={locations[0].coords}
              zoom={12}
              scrollWheelZoom
              className="leaflet-map"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <MapControls positions={allMapPositions} />

              {locations.map((location) => (
                <Marker
                  key={location.name}
                  position={location.coords}
                  icon={pickupIcon}
                >
                  <Popup>
                    <strong>{location.name}</strong>
                    <br />
                    Mapped location
                  </Popup>
                </Marker>
              ))}

              {/* Stored driver locations */}
              {drivers.map((driver) => {
                const driverLocation = findLocation(driver.location);

                if (!driverLocation) return null;

                if (
                  isTracking &&
                  assignedDriver &&
                  Number(driver.id) === Number(assignedDriver.id)
                ) {
                  return null;
                }

                return (
                  <Marker
                    key={driver.id}
                    position={driverLocation.coords}
                    icon={driverIcon}
                  >
                    <Popup>
                      <strong>{driver.name}</strong>
                      <br />
                      Location: {driver.location}
                      <br />
                      Status: {driver.status}
                      <br />
                      Stored location — not live GPS.
                    </Popup>
                  </Marker>
                );
              })}

              {/* Other active delivery routes and trucks */}
              {additionalRouteDeliveries.map((delivery) => {
                const roadRoute = fleetRoutes[delivery.id];
                const positions = getRoutePositions(roadRoute);

                const deliveryStatus = String(
                  delivery.status || ""
                ).toLowerCase();

                const routeColor =
                  ROUTE_COLORS[deliveryStatus] || "#818cf8";

                const routePickup = findLocation(delivery.pickup);
                const routeDropoff = findLocation(delivery.dropoff);

                const liveTracking =
                  trackingPositions[String(delivery.id)];

                const liveTruckPosition =
                  getTrackingPosition(liveTracking);

                const otherTruckPosition =
                  liveTruckPosition ||
                  animatedPositions[String(delivery.id)];

                const otherDriver = drivers.find(
                  (driver) =>
                    Number(driver.id) === Number(delivery.driver_id)
                );

                return (
                  <Fragment key={delivery.id}>
                    {positions.length > 1 && (
                      <Polyline
                        positions={positions}
                        pathOptions={{
                          color: routeColor,
                          weight: 4,
                          opacity: 0.8,
                          dashArray: "8 7",
                        }}
                        eventHandlers={{
                          click: () =>
                            selectDelivery(delivery.id),
                        }}
                      />
                    )}

                    {routePickup && (
                      <Marker
                        position={routePickup.coords}
                        icon={pickupIcon}
                        eventHandlers={{
                          click: () =>
                            selectDelivery(delivery.id),
                        }}
                      >
                        <Popup>
                          <strong>Job #{delivery.id} pickup</strong>
                          <br />
                          {delivery.pickup}
                          <br />
                          Click the route or marker to select this job.
                        </Popup>
                      </Marker>
                    )}

                    {routeDropoff && (
                      <Marker
                        position={routeDropoff.coords}
                        icon={dropoffIcon}
                        eventHandlers={{
                          click: () =>
                            selectDelivery(delivery.id),
                        }}
                      >
                        <Popup>
                          <strong>Job #{delivery.id} drop-off</strong>
                          <br />
                          {delivery.dropoff}
                        </Popup>
                      </Marker>
                    )}

                    {deliveryStatus === "in_transit" &&
                      otherTruckPosition && (
                        <Marker
                          position={otherTruckPosition}
                          icon={driverIcon}
                        >
                          <Popup>
                            <strong>
                              {otherDriver?.name || "Delivery truck"}
                            </strong>
                            <br />
                            Job #{delivery.id}
                            <br />
                            Status: In transit
                            <br />
                            {liveTruckPosition
                              ? "Backend GPS simulation · OSRM road route"
                              : "Fallback route animation"}
                          </Popup>
                        </Marker>
                      )}
                  </Fragment>
                );
              })}

              {/* Selected delivery route */}
              {routePositions.length > 1 && (
                <Polyline
                  positions={routePositions}
                  pathOptions={{
                    color: "#818cf8",
                    weight: 7,
                    opacity: 1,
                  }}
                />
              )}

              {pickup && (
                <Marker position={pickup.coords} icon={pickupIcon}>
                  <Popup>
                    <strong>Pickup · Job #{selectedDelivery.id}</strong>
                    <br />
                    {selectedDelivery.pickup}
                  </Popup>
                </Marker>
              )}

              {dropoff && (
                <Marker position={dropoff.coords} icon={dropoffIcon}>
                  <Popup>
                    <strong>Drop-off · Job #{selectedDelivery.id}</strong>
                    <br />
                    {selectedDelivery.dropoff}
                  </Popup>
                </Marker>
              )}

              {truckPosition && (
                <Marker position={truckPosition} icon={driverIcon}>
                  <Popup>
                    <strong>
                      {assignedDriver?.name || "Delivery truck"}
                    </strong>
                    <br />
                    Job #{selectedDelivery?.id}
                    <br />
                    Status: {formatStatus(status)}
                    <br />
                    {selectedGpsPosition
                      ? "Backend GPS simulation · OSRM road route"
                      : "Fallback simulated movement"}
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>

          <div className="map-legend">
            <span><i className="legend-pickup" /> Pickup</span>
            <span><i className="legend-dropoff" /> Drop-off</span>
            <span>🚚 Simulated GPS truck</span>
          </div>

          <div className="fleet-map-note">
            {selectedDelivery
              ? routeLoading
                ? "Calculating the selected delivery's road route..."
                : routeError
                  ? `Selected route unavailable: ${routeError}`
                  : selectedGpsPosition
                    ? "Truck position is received from backend GPS simulation and follows OSRM road geometry."
                    : status === "in_transit" && truckPosition
                      ? "Waiting for backend GPS. Showing fallback road animation."
                      : "Routes use OSRM road data and OpenStreetMap. Travel times are estimates, not live traffic."
              : "Select a delivery from the list or click an active delivery route to inspect it."}
          </div>
        </div>

        {/* Driver and active delivery sidebar */}
        <aside className="fleet-sidebar">
          <div className="fleet-sidebar-section">
            <div className="fleet-sidebar-heading">
              <div>
                <span>OPERATIONS</span>
                <h4>Active deliveries</h4>
              </div>
              <strong>{activeDeliveries.length}</strong>
            </div>

            {activeDeliveries.length === 0 ? (
              <p className="fleet-empty">
                No active deliveries right now.
              </p>
            ) : (
              <div className="fleet-delivery-list">
                {activeDeliveries.map((delivery) => {
                  const active = String(delivery.id) === selected;
                  const driver = drivers.find(
                    (item) =>
                      Number(item.id) === Number(delivery.driver_id)
                  );

                  return (
                    <button
                      type="button"
                      key={delivery.id}
                      className={`fleet-delivery-item ${
                        active ? "selected" : ""
                      }`}
                      onClick={() => selectDelivery(delivery.id)}
                    >
                      <div className="fleet-item-top">
                        <strong>Job #{delivery.id}</strong>
                        <span
                          className={`fleet-status-dot ${
                            String(delivery.status).toLowerCase()
                          }`}
                        />
                      </div>

                      <span className="fleet-item-route">
                        {delivery.pickup} → {delivery.dropoff}
                      </span>

                      <span className="fleet-item-driver">
                        {driver?.name || "Driver not assigned"}
                      </span>

                      <span className="fleet-item-status">
                        {formatStatus(delivery.status)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="fleet-sidebar-section">
            <div className="fleet-sidebar-heading">
              <div>
                <span>PERSONNEL</span>
                <h4>Driver activity</h4>
              </div>
              <strong>{drivers.length}</strong>
            </div>

            <div className="fleet-driver-list">
              {drivers.map((driver) => {
                const driverDelivery = deliveries.find(
                  (delivery) =>
                    Number(delivery.driver_id) === Number(driver.id) &&
                    ACTIVE_STATUSES.includes(
                      String(delivery.status || "").toLowerCase()
                    )
                );

                const driverStatus = String(
                  driver.status || "unknown"
                ).toLowerCase();

                return (
                  <div className="fleet-driver-item" key={driver.id}>
                    <div className="fleet-driver-avatar">🚚</div>

                    <div className="fleet-driver-details">
                      <strong>{driver.name}</strong>
                      <span>{driver.location || "Location unavailable"}</span>
                      <span>
                        {driverDelivery
                          ? `Working on Job #${driverDelivery.id}`
                          : `${driver.deliveriesCompleted || 0} completed deliveries`}
                      </span>
                    </div>

                    <span
                      className={`fleet-driver-status ${driverStatus}`}
                    >
                      {driverStatus}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
