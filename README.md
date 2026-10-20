# DispatchFlow — Delivery Dispatch and Queue Management System

DispatchFlow is a full-stack delivery dispatch application built to manage delivery requests, assign available drivers, and process jobs asynchronously. It uses BullMQ and Redis to manage the delivery queue and provides a dashboard to monitor delivery progress, driver availability, and completed jobs.

## Project Links

- Live Demo: https://dispatch-flow-aq8fmqyiv-anish-and-team.vercel.app
- Backend API: https://dispatchflow-as2e.onrender.com
- API Health Check: https://dispatchflow-as2e.onrender.com/api/health
- GitHub Repository: https://github.com/anishWkx/DispatchFlow

## Features

- Delivery management with pickup and drop-off locations.
- Asynchronous delivery processing using BullMQ and Redis.
- Automatic driver assignment based on completed-delivery counts.
- Delivery progress tracking with status and completion details.
- Job history for completed and failed deliveries.
- Dashboard displaying delivery statistics, driver availability, and queue status.
- Redis-backed storage for queue records and job states.

## Technologies Used

- Frontend: React, Vite, JavaScript
- Backend: Node.js, Express.js
- Job Queue: BullMQ
- Data Store: Redis and Upstash Redis
- Deployment: Vercel and Render

## System Architecture

1. The React frontend sends delivery requests to the Express backend.
2. The backend adds new delivery jobs to the BullMQ queue.
3. Redis stores queue data and job states.
4. A background worker processes jobs and assigns available drivers.
5. The worker updates delivery progress and completion results.
6. The frontend retrieves delivery, driver, and queue information through API endpoints.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Checks backend health |
| GET | `/api/deliveries` | Retrieves delivery jobs |
| GET | `/api/drivers` | Retrieves driver information |

Base URL: https://dispatchflow-as2e.onrender.com

## Running Locally

### Prerequisites

- Node.js and npm
- Redis running locally or a hosted Redis instance

### 1. Clone the repository

```bash
git clone https://github.com/anishWkx/DispatchFlow.git
cd DispatchFlow
```

### 2. Install backend dependencies

```bash
npm install
```

### 3. Install frontend dependencies

```bash
cd client
npm install
cd ..
```

### 4. Configure Redis

Set the `REDIS_URL` environment variable to your Redis connection URL. For local development, the application defaults to:

```text
redis://127.0.0.1:6379
```

Keep Redis credentials private and never commit them to GitHub.

### 5. Start the backend

```bash
npm start
```

### 6. Start the frontend

Open a separate terminal and run:

```bash
cd ~/DispatchFlow/client
npm run dev
```

Open the local URL shown in the terminal.

## Deployment

The frontend is deployed on Vercel, the backend API and delivery worker run on Render, and Upstash Redis provides hosted queue storage.

## Project Objective

This project demonstrates full-stack development, REST API integration, asynchronous job processing, background workers, queue management, Redis persistence, and cloud deployment.

## Developer

Anish Bhaktula

GitHub: https://github.com/anishWkx
