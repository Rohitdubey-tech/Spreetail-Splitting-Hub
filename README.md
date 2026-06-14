# Spreetail Splitwise Clone - Full-Stack App

This is a beautiful, full-stack, real-time Splitwise clone built in 2 days. It features a premium dark glassmorphism design, real-time expense chat via WebSockets, group membership validations, and a debt simplification algorithm.

---

## Technical Stack

- **Frontend:** React (Vite, JS/JSX) + Custom Vanilla CSS (HSL warm terracotta tokens, glassmorphism, responsive grid)
- **Backend:** Node.js (Express in JavaScript ES Modules) + Prisma ORM
- **Database:** SQLite Relational Database (portable, zero-dependency)
- **Real-Time:** Socket.io (WebSockets)

---

## Prerequisites

Make sure you have Node.js (version 18+) and npm installed on your machine.
- Node.js version on this environment: `v25.9.0`
- NPM version on this environment: `11.12.1`

---

## Setup & Running Locally

Follow these steps to run both the backend API server and frontend application.

### 1. Setup Backend
Open a terminal window and navigate to the `backend` folder:
```bash
cd backend
npm install
```

Create a `.env` file in the `backend` directory (one is already created for you in this workspace):
```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="supersecretkeyforjwttokenauthtesting"
PORT=3001
```

Run database migrations to initialize the SQLite relational database and generate the Prisma Client:
```bash
npx prisma migrate dev --name init
```

Start the backend server in development mode:
```bash
npm run dev
```
The server will start on `http://localhost:3001` and the Socket.io WebSocket listener will be attached.

### 2. Run Backend Tests
To run unit tests verifying expense split validation math, rounding corrections, and the debt simplification algorithm, run:
```bash
npm run test
```

### 3. Setup Frontend
Open a separate terminal window and navigate to the `frontend` folder:
```bash
cd frontend
npm install
```

Start the frontend development server:
```bash
npm run dev
```
The application will boot up and run on `http://localhost:5173`. Open this URL in your web browser.

---

## Features Showcase

1. **Authentication:** Register and log in. Once authenticated, the token is saved in localStorage and Axios headers are globally configured.
2. **Dashboard Overview:** Displays aggregate balances (total you owe and are owed) across all groups.
3. **Groups:** Create groups and select users to invite.
4. **Interactive Expenses & Splits:** Create, edit, and delete expenses using EQUAL, UNEQUAL, PERCENTAGE, and SHARE splits. Math is validated dynamically before submit.
5. **Real-time Chat:** Chat inside individual expenses. WebSocket rooms keep messages synchronized in real-time.
6. **Pairwise & Graph-based Debts:** Toggle between **Direct Debts** (pairwise balances) and **Simplified Debts** (greedy transaction minimizer graph).
7. **Settlement Logic:** Settle balances directly. Revert recorded payments at any time.

---

## Production Deployment

### Database Transition (SQLite to PostgreSQL)
To transition this app to production using PostgreSQL (e.g. Supabase, Neon, or RDS):
1. In `backend/prisma/schema.prisma`, update the datasource block:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Update the `DATABASE_URL` environment variable to your PostgreSQL connection string.
3. Run `npx prisma migrate deploy` in your production pipeline.

### Hosting
- **Frontend:** Build production assets via `npm run build` inside `frontend`, then deploy the `dist` folder to Vercel, Netlify, or AWS S3.
- **Backend:** Deploy the `backend` Node server to Render, Railway, or Heroku. Ensure you configure environment variables (`DATABASE_URL`, `JWT_SECRET`, `PORT`).
