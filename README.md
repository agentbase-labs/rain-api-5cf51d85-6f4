# JoniRainBets API

Backend for JoniRainBets prediction market site. PostgreSQL is provisioned by **AgentBase** (`deploy-rain-backend.cjs`); `DATABASE_URL` is injected on Render.

## Environment
- **RAIN_ENVIRONMENT** — must match the frontend **VITE_RAIN_ENVIRONMENT** (default `production`).
- **DATABASE_URL** — PostgreSQL (AgentBase).
- **FRONTEND_URL** — optional comma-separated list; when set, CORS allows only these origins (otherwise all origins).
- **GEMINI_API_KEY** — for AI routes if your deployed bundle includes them.
- **ARBITRUM_RPC_URL** — optional.

## HTTP routes
Same JSON is served under `/markets` and `/api/markets` (and likewise for users, transactions, portfolio, config).

| Method | Path | Purpose |
|--------|------|--------|
| GET | /health | Liveness |
| GET/POST | /markets | List / create markets |
| PATCH | /markets/:marketId | Partial update (resolve, bar_values, …) |
| POST | /transactions | Log on-chain action (invest, sell, claim, …) |
| GET | /transactions/:wallet | Transaction history |
| GET | /portfolio/:wallet | Positions + stats |
| GET/POST | /config | Site mirror (workflow_id, branding, market_ids) |
