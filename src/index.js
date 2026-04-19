"use strict";
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { runMigrations } = require("./migrate");
const marketsRouter = require("./routes/markets");
const usersRouter = require("./routes/users");
const transactionsRouter = require("./routes/transactions");
const portfolioRouter = require("./routes/portfolio");
const configRouter = require("./routes/config");

const app = express();
const PORT = process.env.PORT || 10000;

const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ── Middleware ──────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.length === 0) return cb(null, true);
      if (allowedOrigins.some((o) => origin === o || (o && origin.startsWith(o)))) return cb(null, true);
      return cb(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes (same handlers at /markets and /api/markets for tutorial + frontend parity) ──
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "JoniRainBets API",
    version: "1.0.0",
    uptime: process.uptime(),
    ts: Date.now(),
  });
});

app.use("/markets", marketsRouter);
app.use("/api/markets", marketsRouter);
app.use("/users", usersRouter);
app.use("/api/users", usersRouter);
app.use("/transactions", transactionsRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/portfolio", portfolioRouter);
app.use("/api/portfolio", portfolioRouter);
app.use("/config", configRouter);
app.use("/api/config", configRouter);

// 404 handler
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: err.message || "Internal server error" });
});

// ── Start ───────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await runMigrations();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ JoniRainBets API running on port ${PORT}`);
      console.log(
        `   CORS: ${allowedOrigins.length ? allowedOrigins.join(", ") : "all origins (set FRONTEND_URL to restrict)"}`,
      );
    });
  } catch (err) {
    console.error("❌ Failed to start:", err.message);
    process.exit(1);
  }
})();
