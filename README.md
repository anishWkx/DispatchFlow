# DispatchFlow — Intelligent Delivery Dispatch & ETA Analytics

DispatchFlow is a full-stack delivery dispatch platform that combines asynchronous job processing, intelligent driver recommendations, machine-learning-based ETA predictions, and delivery analytics.

It manages the delivery lifecycle from order creation to completion, while providing visibility into driver assignment decisions and estimated delivery times.

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
- Includes a comparison against a baseline estimate.

### 6. ETA Analytics
- Compare predicted ETA with simulated delivery duration.
- View prediction errors and baseline comparisons.
- Track MAE and RMSE metrics.
- Analyze model predictions through the dashboard.

### 7. Delivery Timeline
- Track assignment, pickup, transit, and delivery milestones.
- Persist delivery lifecycle timestamps.
- Display delivery progress in the dashboard.
- Support real-time updates using Socket.IO.

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, JavaScript, CSS |
| Backend | Node.js, Express.js |
| Database | MySQL, TiDB Cloud |
| Queue | BullMQ, Redis |
| Authentication | JWT, bcrypt |
| Machine Learning | TensorFlow.js |
| Real-time | Socket.IO |
| Deployment | Vercel, Render |
| Queue Hosting | Upstash Redis |

## 🏗️ Architecture

```text
                 React + Vite Frontend
                          |
                          v
                   Express REST API
                          |
             +------------+------------+
             |            |            |
             v            v            v
          MySQL         Redis       JWT Auth
        (TiDB Cloud)   Queue
                          |
                          v
                    BullMQ Worker
                          |
                          v
                 Driver Recommendation
                          |
                          v
                  ML-based ETA Model
                          |
                          v
                Delivery Assignment
                          |
                          v
                 Delivery Lifecycle
                          |
                          v
                 Dashboard Analytics
```

## 📊 ETA Prediction Model

The ETA prediction pipeline uses a synthetic dataset to demonstrate model training and prediction.

**Model inputs:**
- Average driver speed
- Pickup delay
- Driver-to-pickup distance
- Pickup-to-dropoff distance
- Traffic multiplier

**Model architecture:**
- Input layer: 5 features
- Hidden layer: 32 neurons with ReLU
- Hidden layer: 16 neurons with ReLU
- Output layer: 1 neuron with linear activation
- Optimizer: Adam
- Loss function: Mean Squared Error

The model is trained and evaluated using a scenario-based train/test split.

**Important:** The current training labels and delivery simulation are synthetic. The model demonstrates the ML pipeline and recommendation workflow; its metrics should not be interpreted as validated real-world ETA accuracy.

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Backend health check |
| POST | `/api/auth/register` | Register a user |
| POST | `/api/auth/login` | Authenticate a user |
| GET | `/api/deliveries` | Retrieve deliveries |
| POST | `/api/deliveries` | Create a delivery |
| GET | `/api/deliveries/analytics/eta` | Retrieve ETA analytics |
| GET | `/api/drivers` | Retrieve drivers |

Protected endpoints require a valid JWT Bearer token.

## ⚙️ Local Development

### Prerequisites
- Node.js
- MySQL
- Redis
- npm

### 1. Clone the repository

```bash
git clone https://github.com/anishWkx/DispatchFlow.git
cd DispatchFlow
```

### 2. Install dependencies

```bash
npm install
cd client
npm install
cd ..
```

### 3. Configure environment variables

Create a `server/.env.development` file with your local database, Redis, and authentication configuration.

Example:

```env
PORT=5001
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=dispatchflow_dev
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your_local_secret
```

Create `client/.env.local`:

```env
VITE_API_URL=http://localhost:5001
```

Use your own local credentials. Do not commit environment files or secrets.

### 4. Start the backend

```bash
npm run dev
```

### 5. Start the frontend

Open another terminal:

```bash
cd client
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
│   ├── config/
│   ├── data/
│   ├── ml/
│   ├── routes/
│   ├── workers/
│   └── index.js
│
├── package.json
└── README.md
```

## 🔮 Future Improvements

- Train ETA models using real historical delivery data.
- Integrate live traffic information.
- Improve ETA accuracy through continuous model evaluation.
- Introduce delivery delay and risk alerts.
- Expand driver availability and route optimization.

## 👨‍💻 Author

**Anish Bhaktula**

- GitHub: https://github.com/anishWkx
- LinkedIn: https://www.linkedin.com/in/anish-bhaktula-b3b307286/

---

*DispatchFlow — Making delivery dispatch smarter through automation, intelligent recommendations, and predictive analytics.*