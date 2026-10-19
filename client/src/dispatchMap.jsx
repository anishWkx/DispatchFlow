import { useMemo, useState } from "react";
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

const locations = [
  { name: "VIT-AP Campus", coords: [16.4968, 80.5005] },
  { name: "Namburu", coords: [16.3505, 80.5505] },
  { name: "Mangalagiri", coords: [16.4305, 80.5685] },
];

// Slightly offset demo truck markers so they remain visually distinct
// from each other and from pickup/drop-off markers.
const driverPositions = [
  locations[0].coords, // Ravi — VIT-AP Campus
  locations[1].coords, // Kiran — Namburu
  locations[2].coords, // Priya — Mangalagiri
];

const makeIcon = (label, className) =>
  L.divIcon({
    className: "",
    html: `<div class="${className}">${label}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });

const driverIcon = makeIcon("🚚", "driver-map-marker");
const pickupIcon = makeIcon("P", "pickup-map-marker");
const dropoffIcon = makeIcon("D", "dropoff-map-marker");

function findLocation(value) {
  const normalized = String(value || "").trim().toLowerCase();

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

function MapControls({ positions }) {
  const map = useMap();

  function resetView() {
    if (positions.length > 1) {
      map.fitBounds(positions, { padding: [45, 45], maxZoom: 12 });
    } else {
      map.setView(locations[0].coords, 11);
    }
  }

  return (
    <button
      className="map-reset-button"
      type="button"
      onClick={resetView}
    >
      Fit route / Reset
    </button>
  );
}

export default function DispatchMap({
  deliveries = [],
  drivers = [],
}) {
  const [selected, setSelected] = useState("all");

  const selectedDelivery = deliveries.find(
    (delivery) => String(delivery.id) === selected
  );

  const pickup = selectedDelivery
    ? findLocation(selectedDelivery.pickup)
    : null;

  const dropoff = selectedDelivery
    ? findLocation(selectedDelivery.dropoff)
    : null;

  const routePositions = useMemo(() => {
    if (!pickup || !dropoff) return [];
    return [pickup.coords, dropoff.coords];
  }, [pickup, dropoff]);

  const status = selectedDelivery?.status || "—";
  const priority = selectedDelivery?.priority || "—";

  return (
    <section className="map-panel">
      <div className="map-panel-header">
        <div>
          <span className="map-eyebrow">FLEET TRACKING · DEMO</span>
          <h3>Dispatch map</h3>
          <p>Choose a job to inspect its mapped pickup and drop-off.</p>
        </div>

        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          aria-label="Select delivery"
        >
          <option value="all">Select a delivery</option>
          {deliveries.map((delivery) => (
            <option key={delivery.id} value={String(delivery.id)}>
              Job #{delivery.id} · {delivery.status}
            </option>
          ))}
        </select>
      </div>

      {selectedDelivery && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))",
          gap: 12,
          padding: "0 24px 18px",
        }}>
          {[
            ["JOB", `#${selectedDelivery.id}`],
            ["PICKUP", selectedDelivery.pickup],
            ["DROP-OFF", selectedDelivery.dropoff],
            ["STATUS", status],
            ["PRIORITY", priority],
          ].map(([label, value]) => (
            <div key={label} style={{
              minWidth: 0,
              padding: 12,
              borderRadius: 10,
              background: "#1a2030",
              border: "1px solid #30394b",
            }}>
              <div style={{
                color: "#8994a8",
                fontSize: 10,
                letterSpacing: 1,
                marginBottom: 6,
              }}>
                {label}
              </div>
              <div style={{
                color: "#f1f5f9",
                fontSize: 13,
                fontWeight: 600,
                overflowWrap: "anywhere",
                textTransform: label === "STATUS" || label === "PRIORITY"
                  ? "capitalize"
                  : "none",
              }}>
                {String(value || "—")}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="dispatch-map">
        <MapContainer
          center={locations[0].coords}
          zoom={11}
          scrollWheelZoom
          className="leaflet-map"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapControls positions={routePositions} />

          {locations.map((location, index) => (
            <Marker
              key={location.name}
              position={location.coords}
              icon={index === 0 ? pickupIcon : dropoffIcon}
            >
              <Popup>
                <strong>{location.name}</strong>
                <br />
                Approximate demo location — not live GPS.
              </Popup>
            </Marker>
          ))}

          {drivers.map((driver, index) => (
            <Marker
              key={driver.id}
              position={driverPositions[index % driverPositions.length]}
              icon={driverIcon}
            >
              <Popup>
                <strong>{driver.name}</strong>
                <br />
                Status: {driver.status}
                <br />
                Illustrative position — not live GPS.
              </Popup>
            </Marker>
          ))}

          {routePositions.length === 2 && (
            <>
              <Polyline
                positions={routePositions}
                pathOptions={{
                  color: "#818cf8",
                  weight: 5,
                  opacity: 0.9,
                  dashArray: "8 8",
                }}
              />
              <Marker position={pickup.coords} icon={pickupIcon}>
                <Popup>Pickup: {selectedDelivery.pickup}</Popup>
              </Marker>
              <Marker position={dropoff.coords} icon={dropoffIcon}>
                <Popup>Drop-off: {selectedDelivery.dropoff}</Popup>
              </Marker>
            </>
          )}
        </MapContainer>
      </div>

      <div className="map-legend">
        <span><i className="legend-pickup" /> Pickup / mapped location</span>
        <span><i className="legend-dropoff" /> Drop-off</span>
        <span>🚚 Demo driver</span>
      </div>

      <div style={{
        padding: "0 24px 20px",
        color: "#a4aec0",
        fontSize: 12,
        lineHeight: 1.6,
      }}>
        {!selectedDelivery
          ? "Select a job to view its details and mapped route."
          : !pickup || !dropoff
            ? "Route not shown: one or both addresses are not in the demo location list. The map does not geocode arbitrary addresses yet."
            : "Dashed line connects approximate demo coordinates. It is illustrative, not a road-following navigation route."}
      </div>
    </section>
  );
}
