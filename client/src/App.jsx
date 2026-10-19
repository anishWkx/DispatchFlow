
import DispatchMap from "./dispatchMap.jsx";
import { useEffect, useState } from "react";
import {
  Activity,
  Bike,
  CheckCircle2,
  Clock3,
  Package,
  RefreshCw,
  Truck,
  AlertTriangle,
  Gauge,
  Timer,
  MapPin,
  ArrowRight,
  X,
  UserRound,
  CalendarClock,
} from "lucide-react";
import "./App.css";

const API = "https://dispatchflow-as2e.onrender.com";

const emptyAnalytics = {
  waiting: 0,
  active: 0,
  completed: 0,
  failed: 0,
  delayed: 0,
  successRate: 0,
  averageProcessingTimeMs: 0,
};

function formatStatus(status) {
  const labels = {
    waiting: "Waiting",
    active: "In progress",
    completed: "Completed",
    failed: "Failed",
    delayed: "Retry scheduled",
    "waiting-children": "Waiting",
  };

  return labels[status] || status || "Unknown";
}

function getProgress(delivery) {
  if (delivery.status === "completed") return 100;
  if (delivery.status === "failed") return Number(delivery.progress) || 0;

  const progress = Number(delivery.progress);
  return Number.isFinite(progress)
    ? Math.min(100, Math.max(0, progress))
    : 0;
}

function formatTime(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(milliseconds) {
  if (!milliseconds) return "—";

  const seconds = milliseconds / 1000;
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
    : `${seconds.toFixed(1)}s`;
}

function CreateDelivery({ onCreated }) {
  const [pickup, setPickup] = useState("VIT-AP Campus");
  const [dropoff, setDropoff] = useState("Namburu");
  const [priority, setPriority] = useState("normal");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setIsError(false);

    try {
      const response = await fetch(`${API}/api/deliveries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickup, dropoff, priority }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not create delivery.");
      }

      setMessage(`Delivery #${data.jobId} added successfully!`);
      setDropoff("Namburu");
      await onCreated();
    } catch (error) {
      setIsError(true);
      setMessage(error.message || "Could not connect to the backend.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel create-delivery-panel">
      <div className="panel-heading">
        <div>
          <h3>Create a delivery</h3>
          <p>Add a job to the dispatch queue</p>
        </div>
      </div>

      <form className="delivery-form" onSubmit={handleSubmit}>
        <label>
          Pickup location
          <input
            value={pickup}
            onChange={(event) => setPickup(event.target.value)}
            required
            maxLength={100}
            placeholder="Enter pickup location"
          />
        </label>

        <label>
          Drop-off location
          <input
            value={dropoff}
            onChange={(event) => setDropoff(event.target.value)}
            required
            maxLength={100}
            placeholder="Enter drop-off location"
          />
        </label>

        <label>
          Priority
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>

        <button
          type="submit"
          className="refresh-button"
          disabled={submitting}
        >
          {submitting ? "Creating..." : "Create delivery"}
        </button>
      </form>

      {message && (
        <p role="status" className={isError ? "form-error" : "form-success"}>
          {message}
        </p>
      )}
    </section>
  );
}

function DeliveryDetails({
  delivery,
  loading,
  error,
  onClose,
}) {
  if (loading) {
    return (
      <article className="panel delivery-details-panel">
        <div className="details-empty">
          <RefreshCw size={22} className="details-loading-icon" />
          <h3>Loading delivery</h3>
          <p>Fetching the latest job information…</p>
        </div>
      </article>
    );
  }

  if (error) {
    return (
      <article className="panel delivery-details-panel">
        <div className="details-heading">
          <div>
            <span className="details-eyebrow">JOB INFORMATION</span>
            <h3>Unable to load</h3>
          </div>
          <button
            type="button"
            className="details-close-button"
            onClick={onClose}
            aria-label="Close delivery details"
          >
            <X size={17} />
          </button>
        </div>
        <p className="details-error">{error}</p>
      </article>
    );
  }

  if (!delivery) {
    return (
      <article className="panel delivery-details-panel">
        <div className="details-empty">
          <div className="details-empty-icon">
            <Package size={23} />
          </div>
          <span className="details-eyebrow">QUICK VIEW</span>
          <h3>Delivery details</h3>
          <p>
            Select a job from the table to see its route, status,
            progress and driver information.
          </p>
          <div className="details-hint">
            <ArrowRight size={14} />
            Choose any delivery
          </div>
        </div>
      </article>
    );
  }

  const progress = getProgress(delivery);
  const status = formatStatus(delivery.status);
  const driverName =
    delivery.result?.driverName ||
    delivery.result?.driver?.name ||
    "Not assigned yet";

  return (
    <article className="panel delivery-details-panel">
      <div className="details-heading">
        <div>
          <span className="details-eyebrow">DELIVERY QUICK VIEW</span>
          <h3>Job #{delivery.id}</h3>
        </div>

        <button
          type="button"
          className="details-close-button"
          onClick={onClose}
          aria-label="Close delivery details"
        >
          <X size={17} />
        </button>
      </div>

      <div className="details-status-line">
        <span
          className={`status-badge ${delivery.status}`}
        >
          {status}
        </span>
        <span className={`priority ${delivery.priority}`}>
          {delivery.priority || "normal"} priority
        </span>
      </div>

      <div className="details-route">
        <div className="details-route-point">
          <span className="route-marker pickup-marker" />
          <div>
            <span>FROM</span>
            <strong>{delivery.pickup || "Unknown location"}</strong>
          </div>
        </div>

        <div className="details-route-connector" />

        <div className="details-route-point">
          <span className="route-marker dropoff-marker" />
          <div>
            <span>TO</span>
            <strong>{delivery.dropoff || "Unknown location"}</strong>
          </div>
        </div>
      </div>

      <div className="details-progress-section">
        <div className="details-progress-label">
          <span>Delivery progress</span>
          <strong>{progress}%</strong>
        </div>
        <div
          className="details-progress-track"
          role="progressbar"
          aria-label="Delivery progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            className={`details-progress-fill ${
              delivery.status === "completed" ? "is-complete" : ""
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="details-progress-caption">
          {delivery.status === "completed"
            ? "Delivery completed successfully"
            : delivery.status === "failed"
              ? "This delivery failed"
              : delivery.status === "active"
                ? "Your job is being processed"
                : "Waiting for worker assignment"}
        </span>
      </div>

      <div className="details-info-list">
        <div className="details-info-row">
          <div className="details-info-icon">
            <UserRound size={16} />
          </div>
          <div>
            <span>Assigned driver</span>
            <strong>{driverName}</strong>
          </div>
        </div>

        <div className="details-info-row">
          <div className="details-info-icon">
            <CalendarClock size={16} />
          </div>
          <div>
            <span>Created</span>
            <strong>{formatTime(delivery.createdAt)}</strong>
          </div>
        </div>

        {delivery.result?.completedAt && (
          <div className="details-info-row">
            <div className="details-info-icon">
              <CheckCircle2 size={16} />
            </div>
            <div>
              <span>Completed at</span>
              <strong>{formatTime(delivery.result.completedAt)}</strong>
            </div>
          </div>
        )}
      </div>

      {delivery.failedReason && (
        <div className="details-failure">
          <AlertTriangle size={16} />
          <div>
            <strong>Failure reason</strong>
            <p>{delivery.failedReason}</p>
          </div>
        </div>
      )}
    </article>
  );
}

function App() {
  const [activePage, setActivePage] = useState("overview");
  const [deliveries, setDeliveries] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [analytics, setAnalytics] = useState(emptyAnalytics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  async function loadDashboard() {
    setRefreshing(true);

    try {
      const [deliveryResponse, driverResponse, analyticsResponse] =
        await Promise.all([
          fetch(`${API}/api/deliveries`),
          fetch(`${API}/api/drivers`),
          fetch(`${API}/api/deliveries/analytics/summary`),
        ]);

      if (
        !deliveryResponse.ok ||
        !driverResponse.ok ||
        !analyticsResponse.ok
      ) {
        throw new Error("The backend returned an error.");
      }

      const [deliveryData, driverData, analyticsData] = await Promise.all([
        deliveryResponse.json(),
        driverResponse.json(),
        analyticsResponse.json(),
      ]);

      if (
        !deliveryData.success ||
        !driverData.success ||
        !analyticsData.success
      ) {
        throw new Error("One or more API requests failed.");
      }

      setDeliveries(deliveryData.deliveries || []);
      setDrivers(driverData.drivers || []);
      setAnalytics({
        ...emptyAnalytics,
        ...analyticsData.analytics,
      });
      setError("");
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Dashboard loading error:", err);
      setError(
        "Cannot connect to the backend. Check that DispatchFlow is running on port 5001."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function openDeliveryDetails(id) {
    setSelectedDelivery(null);
    setDetailError("");
    setDetailLoading(true);

    try {
      const response = await fetch(`${API}/api/deliveries/${id}`);
      const data = await response.json();

      if (!response.ok || !data.success || !data.delivery) {
        throw new Error(data.message || "Could not load delivery details.");
      }

      setSelectedDelivery(data.delivery);
    } catch (err) {
      console.error("Delivery details error:", err);
      setDetailError(err.message || "Could not load delivery details.");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalDeliveries =
    analytics.waiting +
    analytics.active +
    analytics.completed +
    analytics.failed +
    analytics.delayed;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Truck size={22} />
          </div>
          <div>
            <h1>DispatchFlow</h1>
            <span>DELIVERY OPERATIONS</span>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>
        <button type="button" className={`nav-item ${activePage === "overview" ? "selected" : ""}`} onClick={() => setActivePage("overview")}>
          <Activity size={18} /> Overview
        </button>
        <button type="button" className={`nav-item ${activePage === "deliveries" ? "selected" : ""}`} onClick={() => setActivePage("deliveries")}>
          <Package size={18} /> Deliveries
        </button>
        <button type="button" className={`nav-item ${activePage === "drivers" ? "selected" : ""}`} onClick={() => setActivePage("drivers")}>
          <Bike size={18} /> Drivers
        </button>

        <div className="sidebar-bottom">
          <div className="system-indicator">
            <span /> System monitor
          </div>
          <p>Dispatch engine v1.0</p>
          <p>Local development</p>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div>
            <div className="eyebrow">OPERATIONS / {activePage.toUpperCase()}</div>
            <h2>
              {activePage === "overview"
                ? "Dispatch overview"
                : activePage === "deliveries"
                  ? "Deliveries"
                  : "Driver fleet"}
            </h2>
            <p className="subheading">
              {activePage === "overview"
                ? "Monitor delivery jobs and driver availability in real time."
                : activePage === "deliveries"
                  ? "Review delivery jobs and inspect individual delivery details."
                  : "Monitor driver availability and completed deliveries."}
            </p>
          </div>

          <button
            className="refresh-button"
            onClick={loadDashboard}
            disabled={refreshing}
          >
            <RefreshCw
              size={16}
              className={refreshing ? "refresh-spinning" : ""}
            />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {activePage === "overview" && (
          <>
        <section className="status-strip">
          <div className="live-dot" />
          <span>DISPATCH SERVICE</span>
          <strong>{error ? "Connection issue" : "Monitoring active"}</strong>
          <span className="updated-label">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : "Connecting…"}
          </span>
        </section>

        <section className="stats-grid">
          <article className="stat-card">
            <div className="stat-top">
              <span>Total deliveries</span>
              <Package size={18} />
            </div>
            <strong>{totalDeliveries}</strong>
            <small>Jobs currently retained in queue</small>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span>Completed</span>
              <CheckCircle2 size={18} />
            </div>
            <strong>{analytics.completed}</strong>
            <small>Completed queue jobs</small>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span>In progress</span>
              <Truck size={18} />
            </div>
            <strong>{analytics.active}</strong>
            <small>Jobs being handled by workers</small>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span>Waiting</span>
              <Clock3 size={18} />
            </div>
            <strong>{analytics.waiting + analytics.delayed}</strong>
            <small>Jobs awaiting processing</small>
          </article>
        </section>

        <section className="stats-grid analytics-grid">
          <article className="stat-card">
            <div className="stat-top">
              <span>Success rate</span>
              <Gauge size={18} />
            </div>
            <strong>{analytics.successRate}%</strong>
            <small>Of retained finished jobs</small>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span>Average processing</span>
              <Timer size={18} />
            </div>
            <strong>
              {formatDuration(analytics.averageProcessingTimeMs)}
            </strong>
            <small>Average worker execution time</small>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span>Failed jobs</span>
              <AlertTriangle size={18} />
            </div>
            <strong>{analytics.failed}</strong>
            <small>Jobs currently marked failed</small>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span>Delayed jobs</span>
              <Clock3 size={18} />
            </div>
            <strong>{analytics.delayed}</strong>
            <small>Scheduled for later processing</small>
          </article>
        </section>

          </>
        )}

        {activePage === "overview" && (
          <>
            <CreateDelivery onCreated={loadDashboard} />
            <DispatchMap deliveries={deliveries} drivers={drivers} />
          </>
        )}

        {activePage === "overview" && (
        <section className="content-grid">
          <article className="panel deliveries-panel">
            <div className="panel-heading">
              <div>
                <h3>Recent deliveries</h3>
                <p>Choose a job to view its details</p>
              </div>
              <span className="count-pill">{deliveries.length} jobs</span>
            </div>

            {loading ? (
              <p className="empty-state">Loading deliveries…</p>
            ) : deliveries.length === 0 ? (
              <p className="empty-state">No delivery jobs yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>JOB</th>
                      <th>ROUTE</th>
                      <th>PRIORITY</th>
                      <th>STATUS</th>
                      <th>CREATED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries
                      .slice()
                      .reverse()
                      .slice(0, 10)
                      .map((delivery) => (
                        <tr
                          key={delivery.id}
                          className={`delivery-table-row ${
                            selectedDelivery?.id === delivery.id
                              ? "is-selected"
                              : ""
                          }`}
                          onClick={() => openDeliveryDetails(delivery.id)}
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (
                              event.key === "Enter" ||
                              event.key === " "
                            ) {
                              event.preventDefault();
                              openDeliveryDetails(delivery.id);
                            }
                          }}
                          aria-label={`View details for delivery ${delivery.id}`}
                        >
                          <td className="job-id">#{delivery.id}</td>
                          <td>
                            <div className="route-cell">
                              <strong>{delivery.pickup}</strong>
                              <span>↓ {delivery.dropoff}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`priority ${delivery.priority}`}>
                              {delivery.priority}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`status-badge ${delivery.status}`}
                            >
                              {formatStatus(delivery.status)}
                            </span>
                          </td>
                          <td className="time-cell">
                            {formatTime(delivery.createdAt)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <DeliveryDetails
            delivery={selectedDelivery}
            loading={detailLoading}
            error={detailError}
            onClose={() => {
              setSelectedDelivery(null);
              setDetailError("");
            }}
          />

          <article className="panel drivers-panel">
            <div className="panel-heading">
              <div>
                <h3>Driver fleet</h3>
                <p>Current driver availability</p>
              </div>
              <span className="count-pill">{drivers.length} drivers</span>
            </div>

            {drivers.map((driver) => (
              <div className="driver-row" key={driver.id}>
                <div className="driver-avatar">
                  <Bike size={19} />
                </div>
                <div className="driver-info">
                  <strong>{driver.name}</strong>
                  <span>{driver.location}</span>
                </div>
                <div className="driver-right">
                  <span className={`driver-status ${driver.status}`}>
                    {driver.status}
                  </span>
                  <small>{driver.deliveriesCompleted} completed</small>
                </div>
              </div>
            ))}

            {!loading && drivers.length === 0 && (
              <p className="empty-state">
                No drivers returned by the API.
              </p>
            )}
          </article>
        </section>
        )}

        {activePage === "deliveries" && (
          <section className="content-grid">
            <article className="panel deliveries-panel">
              <div className="panel-heading">
                <div>
                  <h3>All deliveries</h3>
                  <p>Select a job to view its details</p>
                </div>
                <span className="count-pill">{deliveries.length} jobs</span>
              </div>
              {loading ? (
                <p className="empty-state">Loading deliveries…</p>
              ) : deliveries.length === 0 ? (
                <p className="empty-state">No delivery jobs yet.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>JOB</th><th>ROUTE</th><th>PRIORITY</th><th>STATUS</th><th>CREATED</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveries.slice().reverse().map((delivery) => (
                        <tr
                          key={delivery.id}
                          className={`delivery-table-row ${selectedDelivery?.id === delivery.id ? "is-selected" : ""}`}
                          onClick={() => openDeliveryDetails(delivery.id)}
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openDeliveryDetails(delivery.id);
                            }
                          }}
                          aria-label={`View details for delivery ${delivery.id}`}
                        >
                          <td className="job-id">#{delivery.id}</td>
                          <td><div className="route-cell"><strong>{delivery.pickup}</strong><span>↓ {delivery.dropoff}</span></div></td>
                          <td><span className={`priority ${delivery.priority}`}>{delivery.priority}</span></td>
                          <td><span className={`status-badge ${delivery.status}`}>{formatStatus(delivery.status)}</span></td>
                          <td className="time-cell">{formatTime(delivery.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
            <DeliveryDetails
              delivery={selectedDelivery}
              loading={detailLoading}
              error={detailError}
              onClose={() => {
                setSelectedDelivery(null);
                setDetailError("");
              }}
            />
          </section>
        )}

        {activePage === "drivers" && (
          <section className="content-grid drivers-page-grid">
            <article className="panel drivers-panel drivers-fleet-panel">
              <div className="panel-heading">
                <div><h3>Driver fleet</h3><p>Current driver availability</p></div>
                <span className="count-pill">{drivers.length} drivers</span>
              </div>
              {drivers.map((driver) => (
                <div className="driver-row" key={driver.id}>
                  <div className="driver-avatar"><Bike size={19} /></div>
                  <div className="driver-info"><strong>{driver.name}</strong><span>{driver.location}</span></div>
                  <div className="driver-right">
                    <span className={`driver-status ${driver.status}`}>{driver.status}</span>
                    <small>{driver.deliveriesCompleted} completed</small>
                  </div>
                </div>
              ))}
              {!loading && drivers.length === 0 && <p className="empty-state">No drivers returned by the API.</p>}
            </article>
          </section>
        )}

        <footer>
          DispatchFlow · Queue-based delivery dispatch simulator
          <span>Built with React, Express & BullMQ</span>
        </footer>
      </section>
    </main>
  );
}

export default App;
