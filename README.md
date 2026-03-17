# Ollia

Ollia is a family reassurance app that helps loved ones stay connected and at ease. It provides a simple way for family members to check in with each other, offering peace of mind through lightweight, everyday interactions.

## Monorepo Structure

```
ollia/
├── apps/
│   ├── backend/    # Kotlin/Spring Boot API (Gradle)
│   └── mobile/     # React Native / Expo mobile app
├── package.json    # npm workspaces (mobile only)
├── .env.example    # Environment variable template
└── .gitignore
```

- **apps/backend** -- Spring Boot API built with Kotlin and Gradle. Handles authentication (Clerk), database access (PostgreSQL), and scheduled tasks.
- **apps/mobile** -- Expo/React Native mobile application. Connects to the backend API and provides the user-facing experience.

## Backend Setup

### Prerequisites

- JDK 17 or higher
- PostgreSQL running locally (or a remote instance)

### Steps

1. Copy the environment template and fill in your values:
   ```bash
   cp .env.example .env
   ```
2. Make sure PostgreSQL is running and the `ollia` database exists:
   ```bash
   createdb ollia
   ```
3. Start the backend:
   ```bash
   cd apps/backend
   ./gradlew bootRun
   ```

The API will be available at `http://localhost:8080`. Health check endpoint: `/actuator/health`.

## Mobile Setup

### Prerequisites

- Node 18 or higher
- Expo CLI (`npm install -g expo-cli` or use `npx expo`)

### Steps

1. Install dependencies:
   ```bash
   cd apps/mobile
   npm install
   ```
2. Start the Expo dev server:
   ```bash
   npx expo start
   ```
3. Open the app on your device using **Expo Go** (scan the QR code from the terminal).

## Deploy to Railway

1. Push the repository to GitHub.
2. Create a new project on [Railway](https://railway.app) and connect the GitHub repo.
3. Add a **PostgreSQL plugin** -- Railway will auto-provision a `DATABASE_URL` environment variable.
4. Set the remaining environment variables in the Railway dashboard (see table below).
5. The backend uses the `Dockerfile` and `railway.toml` at `apps/backend/` for deployment configuration.
6. After deploy, verify the service is healthy at `/actuator/health`.

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string. Auto-provisioned by Railway Postgres plugin. | Yes |
| `CLERK_SECRET_KEY` | Clerk secret key for server-side auth. | Yes |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (used by the mobile app). | Yes |
| `CLERK_JWKS_URI` | Clerk JWKS endpoint for JWT verification. | Yes |
| `EXPO_PUBLIC_API_URL` | Base URL of the backend API (e.g., `http://localhost:8080` locally). | Yes |
| `CRON_SECRET` | Secret token to authorize scheduled/cron job requests. | Yes |
