# DispatchFlow — Intelligent Delivery Dispatch & ETA Analytics

DispatchFlow is a full-stack delivery dispatch platform that combines asynchronous job processing, intelligent driver recommendations, ETA predictions, and delivery analytics.

It manages the delivery lifecycle from order creation to completion, providing visibility into driver assignment decisions, delivery progress, and estimated delivery times.

## 🚀 Live Demo

- **Frontend:** https://dispatch-flow-six.vercel.app
- **Backend API:** https://dispatchflow-as2e.onrender.com
- **API Health:** https://dispatchflow-as2e.onrender.com/api/health

## ✨ Features

### 1. Delivery Management
- Create and manage delivery requests.
- Track delivery status and priority.
- Search and filter deliveries.
- View delivery details and assignment history.

### 2. Asynchronous Job Processing
- BullMQ and Redis-powered delivery queue.
- Priority-based job processing.
- Automatic retries with exponential backoff.
- Background worker for delivery assignment and processing.

### 3. Authentication & Persistence
- JWT-based authentication.
- Password hashing using bcrypt.
- MySQL/TiDB Cloud database integration.
- Persistent users, drivers, deliveries, and assignment records.
- Protected API endpoints with role-based authorization.

### 4. Intelligent Driver Recommendations
- Evaluates available drivers using delivery-related factors.
- Predicts ETA for candidate drivers.
- Ranks drivers based on predicted delivery time.
- Displays recommendation factors such as:
  - Driver average speed
  - Pickup delay
  - Driver-to-pickup distance
  - Pickup-to-destination distance
  - Traffic multiplier
- Stores recommendation snapshots for historical traceability.

### 5. Machine Learning ETA Prediction
- TensorFlow.js-based neural network model.
- Uses delivery distance, driver speed, pickup delay, and traffic-related features.
- Generates ETA predictions for candidate driver assignments.
- Includes comparison against a baseline estimate.

### 6. ETA Analytics
- Compare predicted ETA with simulated delivery duration.
- View prediction errors and baseline comparisons.
- Track MAE and RMSE metrics.
- Analyze model predictions through the dashboard.

### 7. Delivery Timeline & Real-Time Updates
- Track assignment, pickup, transit, and delivery milestones.
- Persist delivery lifecycle timestamps.
- Display delivery progress in the dashboard.
- Support real-time updates using Socket.IO.

## 🛠️ Tech Stack

| Category | Technologies |
|---|---|
| Frontend | React, Vite, JavaScript, CSS |
| Backend | Node.js, Express.js |
| Database | MySQL, TiDB Cloud |
| Queue Processing | BullMQ, Redis |
| Authentication | JWT, bcrypt |
| Real-Time Communication | Socket.IO |
| Machine Learning | TensorFlow.js |
| Data Visualization | Recharts |
| Testing | Jest, Supertest |
| Frontend Deployment | Vercel |
| Backend Deployment | Render |

## 🏗️ System Architecture

1. A user creates a delivery request through the React frontend.
2. The Express backend validates the request and stores delivery information in MySQL.
3. The delivery job is added to the BullMQ queue using Redis.
4. A background worker processes queued deliveries according to priority.
5. The system evaluates available drivers and generates recommendations.
6. A suitable driver is assigned and the delivery progresses through its lifecycle.
7. ETA predictions and delivery analytics are generated.
8. Socket.IO communicates real-time delivery updates to the frontend.

## 🧪 Testing & Code Coverage

DispatchFlow includes an automated backend testing suite built using **Jest and Supertest**.

The tests cover API endpoints, authentication, authorization middleware, delivery processing, driver management, tracking, analytics, and error handling.

### Test Results

| Metric | Result |
|---|---:|
| Test Suites | 11 passed |
| Automated Tests | 63 passed |
| Statement Coverage | 100% |
| Branch Coverage | 100% |
| Function Coverage | 100% |
| Line Coverage | 100% |

### Run Tests Locally

From the project root:

```bash
# Run all backend tests
npm test

# Run tests with coverage report
npm test -- --coverage
```

## ⚙️ Local Setup & Installation

### Prerequisites

- Node.js and npm
- MySQL-compatible database
- Redis instance

### 1. Clone the Repository

```bash
git clone https://github.com/anishWkx/DispatchFlow.git
cd DispatchFlow
```

### 2. Install Backend Dependencies

```bash
npm install
```

Configure the required database, Redis, and authentication environment variables for your local setup.

### 3. Start the Backend

From the project root:

```bash
npm run dev
```

The backend runs on the configured server port.

### 4. Install Frontend Dependencies

Open another terminal:

```bash
cd client
npm install
```

### 5. Start the Frontend

```bash
npm run dev
```

The frontend and backend will now run locally.

## ☁️ Deployment

| Component | Platform |
|---|---|
| Frontend | Vercel |
| Backend | Render |
| Database | TiDB Cloud |
| Redis Queue | Upstash Redis |

## 📁 Project Structure

```text
DispatchFlow/
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── dispatchMap.jsx
│   └── package.json
│
├── server/
│   ├── app.js
│   ├── server.js
│   ├── config/
│   ├── data/
│   ├── ml/
│   ├── routes/
│   ├── workers/
│   └── tests/
│       ├── analytics.test.js
│       ├── app.test.js
│       ├── auth.test.js
│       ├── authErrors.test.js
│       ├── authMiddleware.test.js
│       ├── delivery.test.js
│       ├── deliveryList.test.js
│       ├── deliveryQueueFailure.test.js
│       ├── driver.test.js
│       ├── health.test.js
│       └── tracking.test.js
│
├── package.json
├── package-lock.json
└── README.md
```

##