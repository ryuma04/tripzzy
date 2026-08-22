# ✈️ Tripzyy — AI-Powered Travel Planning & Itinerary Platform

> **Tripzyy** is a modern, full-stack travel planning platform built with **FastAPI**, **PostgreSQL**, **Next.js 16**, and **Groq AI (Llama 3.3 70B)**. It features intelligent itinerary generation, interactive map exploration, real-time budget analytics, OTP-secured authentication, and community trip cloning.

---

## 🌟 Key Features

- 🤖 **AI Trip Generator**: Instant, personalized multi-day itinerary generation based on user preferences, duration, style, and budget limits powered by **Groq Llama-3.3-70b**.
- 🗺️ **Interactive Leaflet Maps**: Real-time geolocation visualization of trip stops, route tracking, and place details.
- 📅 **Day-by-Day Itinerary Builder**: Drag-and-drop stop reordering, time slot assignment, activity filtering, and custom location tags.
- 📊 **Budget & Expense Analytics**: Detailed financial tracking by category (Transport, Stay, Activities, Dining) with high-precision string numeric handling (`Numeric(12,2)`) and interactive Recharts visualizations.
- 🌐 **Community Feed & Trip Cloning**: Share travel plans publicly or clone itineraries from fellow travelers with soft-delete data integrity.
- 🔐 **Enterprise Auth & Security**: JWT authentication with refresh tokens, server-side token revocation database, bcrypt password hashing, and email OTP verification via Google Apps Script or SMTP.
- 📐 **Standardized API Envelope**: Unified FastAPI response structure with strict error codes (`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`).

---

## 🛠️ Tech Stack

### **Backend**
| Component | Technology | Description |
|---|---|---|
| **Framework** | [FastAPI](https://fastapi.tiangolo.com/) | High-performance Python async web framework |
| **Database** | [PostgreSQL 18](https://www.postgresql.org/) + [SQLAlchemy 2.0](https://www.sqlalchemy.org/) | Async ORM via `asyncpg` engine |
| **Migrations** | [Alembic](https://alembic.sqlalchemy.org/) | Schema migration management |
| **AI Integration** | [Groq API](https://groq.com/) | `llama-3.3-70b-versatile` for trip generation |
| **Validation** | [Pydantic v2](https://docs.pydantic.dev/) | Request/response data models & settings |
| **Security** | [PyJWT](https://pyjwt.readthedocs.io/) + [Passlib](https://passlib.readthedocs.io/) | Bcrypt password hashing & JWT token revocation |
| **Email/OTP** | `aiosmtplib` / Google Apps Script | Asynchronous email dispatch for OTP codes |
| **Testing** | [Pytest](https://docs.pytest.org/) + `pytest-asyncio` | Full suite with 250+ unit and integration tests |

### **Frontend**
| Component | Technology | Description |
|---|---|---|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router) | Server & Client component architecture |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | End-to-end static typing |
| **UI Framework** | [React 19](https://react.dev/) + [Tailwind CSS v4](https://tailwindcss.com/) | Modern design system & styling |
| **Components** | [Shadcn UI](https://ui.shadcn.com/) / Base UI | Accessible UI primitives |
| **Animations** | [Framer Motion](https://www.framer.com/motion/) | Smooth UI micro-interactions |
| **Maps** | [Leaflet](https://leafletjs.com/) | Interactive map rendering |
| **Charts** | [Recharts](https://recharts.org/) | Dynamic budget data visualizations |

---

## 📂 Directory Structure

```
Tripzyy/
├── backend/                  # FastAPI Application
│   ├── app/
│   │   ├── core/             # Configuration, security, dependencies, exception handlers
│   │   ├── db/               # Async database engine & session manager
│   │   ├── models/           # SQLAlchemy database models (13 tables)
│   │   ├── schemas/          # Pydantic schemas for request/response validation
│   │   ├── repositories/     # Data access layer & queries
│   │   ├── services/         # Business logic (AI, Email, Itinerary, Trips, Community)
│   │   ├── routers/          # API route definitions (auth, trips, stops, places, etc.)
│   │   └── seed/             # Catalog JSON & idempotent database seeder
│   ├── alembic/              # Database migration scripts
│   ├── tests/                # Pytest async test suite
│   ├── .env.example          # Backend environment variable template
│   └── requirements.txt      # Python dependencies
│
└── frontend/                 # Next.js 16 Application
    ├── src/
    │   ├── app/              # Next.js App Router (auth, dashboard, explore, trips, community)
    │   ├── components/       # UI components (budget, itinerary, map, layout, ui)
    │   ├── lib/              # API clients, authentication utilities, helper functions
    │   ├── services/         # Frontend API service abstractions
    │   └── types/            # TypeScript interfaces & API schema types
    ├── public/               # Static assets
    ├── package.json          # Frontend dependencies
    └── tsconfig.json         # TypeScript configuration
```

---

## 🚀 Quick Start Guide

### Prerequisites

- **Python**: `3.12+`
- **Node.js**: `v20+` (npm `v10+`)
- **PostgreSQL**: `v18+` (running on `localhost:5432`)

---

### 1️⃣ Backend Setup

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Create and activate a virtual environment**:
   - **Windows (PowerShell)**:
     ```powershell
     python -m venv .venv
     .\.venv\Scripts\Activate.ps1
     ```
   - **macOS / Linux**:
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   *Generate a secure `SECRET_KEY` using Python:*
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```
   Update `.env` with your PostgreSQL password and generated `SECRET_KEY`.

5. **Initialize Database & Apply Schema**:
   Ensure PostgreSQL is running, then create the database and run migrations:
   ```bash
   createdb -U postgres tripzyy
   python -m alembic upgrade head
   ```

6. **Seed Initial Data**:
   Populate 40+ destinations, 200+ activities, and demo accounts:
   ```bash
   python -m app.seed.seed --demo
   ```

7. **Start the FastAPI Dev Server**:
   ```bash
   python -m uvicorn app.main:app --reload --port 8000
   ```
   - 📌 **Interactive OpenAPI Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
   - 📌 **Health Check**: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

---

### 2️⃣ Frontend Setup

1. **Navigate to the frontend directory**:
   ```bash
   cd ../frontend
   ```

2. **Install Node dependencies**:
   ```bash
   npm install
   ```

3. **Run Development Server**:
   ```bash
   npm run dev
   ```

4. **Access Application**:
   Open [http://localhost:3000](http://localhost:3000) in your web browser.

---

## 🔑 Demo Login Credentials

When seeded with `--demo`, you can log in immediately using these pre-configured accounts:

| Role | Email | Password |
|---|---|---|
| 👑 **Admin** | `admin@tripzyy.com` | `Admin@123` |
| 🧳 **Traveller** | `traveller@tripzyy.com` | `Travel@123` |
| 🧭 **Explorer** | `explorer@tripzyy.com` | `Explore@123` |

---

## 🔒 API Response Format & Standard Errors

All API endpoints return responses encapsulated in a unified envelope:

### **Success Response Envelope**
```json
{
  "success": true,
  "message": "Trip fetched successfully",
  "data": { ... },
  "error": null
}
```

### **Error Response Envelope**
```json
{
  "success": false,
  "message": "Validation failed",
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "details": {
      "fields": {
        "title": "Field required"
      }
    }
  }
}
```

---

## 🧪 Testing

### Backend Unit & Integration Tests

Create a dedicated test database before running tests:
```bash
createdb -U postgres tripzyy_test
```

Run the complete test suite:
```bash
cd backend
python -m pytest
```

Run specific test files:
```bash
python -m pytest tests/test_trips.py
python -m pytest tests/test_places_router.py
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.
