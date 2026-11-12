# DispatchFlow — Delivery Dispatch and Queue Management System

DispatchFlow is a full-stack delivery dispatch and queue management application designed to manage delivery requests, assign drivers, and process deliveries asynchronously.

It uses **BullMQ and Redis** for background job processing, **MySQL** for persistent application data, and **Socket.IO** for real-time delivery updates. The application provides an interactive dashboard to monitor delivery operations, driver availability, queue activity, and delivery performance.

## Project Links

- **Live Demo:** https://dispatch-flow-six.vercel.app
- **Backend API:** https://dispatchflow-as2e.onrender.com
- **API Health Check:** https://dispatchflow-as2e.onrender.com/api/health
- **GitHub Repository:** https://github.com/anishWkx/DispatchFlow

## Features

### Delivery Management
- Create and manage delivery requests with pickup and drop-off locations.
- Track delivery status throughout the processing lifecycle.
- View delivery details, priority levels, and creation timestamps.
- Search deliveries by delivery ID, pickup location, and drop-off location.
- Filter deliveries by status, priority, and date range.
- Paginated delivery listing.

### Background Job Processing
- Asynchronous delivery processing using BullMQ and Redis.
- Priority-based job scheduling.
- Automatic job retries with exponential backoff.
- Background workers for delivery processing.
- Driver assignment and release during delivery execution.

### Authentication and Data Persistence
- User registration and login using JWT authentication.
- Password hashing using bcrypt.
- Protected backend API routes.
- MySQL/TiDB persistence for users, drivers, deliveries, and assignment records.

### Real-Time Updates
- Real-time delivery updates using Socket.IO.
- Automatic dashboard refresh when delivery events occur.
- Authenticated WebSocket connections.

### Dashboard and Monitoring
- Dashboard displaying delivery statistics and queue activity.
- Driver availability and assignment information.
- Delivery progress and completion monitoring.
- Interactive delivery map.
- Dark and light dashboard themes.

## Technologies Used

| Category | Technologies |
|---|---|
| Frontend | React, Vite, JavaScript, CSS |
| Backend | Node.js, Express.js |
| Database | MySQL, TiDB Cloud |
| Job Queue | BullMQ |
| Queue Storage | Redis, Upstash Redis |
| Authentication | JWT, bcrypt |
| Real-Time Communication | Socket.IO |
| Deployment | Vercel, Render |

## System Architecture

1. The React frontend communicates with the Node.js and Express backend through REST APIs.
2. Users authenticate using JWT tokens to access protected application features.
3. New delivery requests are validated and persisted in MySQL.
4. The backend adds delivery jobs to the BullMQ queue.
5. Redis stores queue information and job states.
6. A background worker processes queued deliveries and invokes the driver assignment logic.
7. The worker updates delivery progress and assignment records in MySQL.
8. Socket.IO broadcasts delivery events to connected dashboard clients.
9. The frontend displays updated delivery information and operational statistics.

## API Endpoints

Base URL: `https://dispatchflow-as2e.onrender.com`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Checks backend health |
| POST | `/api/auth/register` | Registers a user |
| POST | `/api/auth/login` | Authenticates a user |
| GET | `/api/deliveries` | Retrieves delivery records |
| GET | `/api/drivers` | Retrieves driver information |

Protected endpoints require a valid JWT access token in the Authorization header.

## Running Locally

### Prerequisites

- Node.js and npm
- MySQL or a compatible TiDB database
- Redis running locally or a hosted Redis instance
- Git

### 1. Clone the repository

\`\`\`bash
git clone https://github.com/anishWkx/DispatchFlow.git
cd DispatchFlow
\`\`\`

### 2. Install backend dependencies

\`\`\`bash
npm install
\`\`\`

### 3. Install frontend dependencies

\`\`\`bash
cd client
npm install
cd ..
\`\`\`

### 4. Configure environment variables

Create a `.env` file in the project root and configure your database, Redis, and authentication settings.

The backend requires the appropriate database connection settings, `JWT_SECRET`, and `REDIS_URL`.

For local Redis development, the default connection URL is:

\`\`\`text
redis://127.0.0.1:6379
\`\`\`

For the frontend, configure `VITE_API_URL` if you want to use a backend other than the default API URL.

**Important:** Keep database credentials, JWT secrets, and Redis credentials private. Never commit `.env` files to GitHub.

### 5. Start the backend

From the project root:

\`\`\`bash
npm start
\`\`\`

The backend starts the Express server and delivery worker.

### 6. Start the frontend

Open a separate terminal:

\`\`\`bash
cd client
npm run dev
\`\`\`

Open the local URL displayed by Vite.

## Deployment

- **Frontend:** Vercel
- **Backend API and Background Worker:** Render
- **Database:** TiDB Cloud
- **Queue Storage:** Upstash Redis

The frontend communicates with the deployed backend, while the backend handles authentication, database operations, queue processing, and real-time delivery events.

## Future Enhancements

- Smart driver assignment using distance, workload, and delivery performance scoring.
- AI-powered dispatch assistant for operational queries and recommendations.
- Delivery delay risk analysis.
- Advanced delivery performance analytics.

## Project Objective

DispatchFlow demonstrates full-stack application development, REST API design, authentication, relational database management, asynchronous job processing, priority queues, background workers, real-time communication, and cloud deployment.

## Developer

**Anish Bhaktula**

GitHub: https://github.com/anishWkx