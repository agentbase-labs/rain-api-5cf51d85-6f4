"use strict";
const { Router } = require("express");
const { query } = require("../db");

const router = Router();

async function canonicalRainMarketId(raw) {
  const s = String(raw || "").trim();
  if (!s || !/^0x[a-fA-F0-9]{40}$/.test(s)) return s;
  try {
    const env = process.env.RAIN_ENVIRONMENT || "production";
    const rpcUrl = process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc";
    const { Rain } = require("@buidlrrr/rain-sdk");
    const rain = new Rain({ environment: env, rpcUrl });
    const id = await rain.getMarketId(s);
    return id ? String(id).trim() : s;
  } catch (e) {
    console.warn("[markets] canonicalRainMarketId:", e && e.message);
    return s;
  }
}

// GET /markets  — list all markets (optionally filter by workflow_id)
router.get("/", async (req, res) => {
  try {
    const { workflow_id, status, limit = 100, offset = 0 } = req.query;
    let sql = "SELECT * FROM markets WHERE 1=1";
    const params = [];
    if (workflow_id) { sql += ` AND workflow_id = $${params.push(workflow_id)}`; }
    if (status)      { sql += ` AND status = $${params.push(status)}`; }
    sql += ` ORDER BY created_at DESC LIMIT $${params.push(parseInt(limit, 10))} OFFSET $${params.push(parseInt(offset, 10))}`;
    const result = await query(sql, params);
    res.json({ markets: result.rows, total: result.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /markets/:marketId
router.get("/:marketId", async (req, res) => {
  try {
    let key = req.params.marketId;
    let result = await query(
      "SELECT * FROM markets WHERE market_id = $1 LIMIT 1",
      [key]
    );
    if (!result.rows.length && /^0x[a-fA-F0-9]{40}$/.test(String(key || "").trim())) {
      const alt = await canonicalRainMarketId(key);
      if (alt !== key) {
        result = await query(
          "SELECT * FROM markets WHERE market_id = $1 LIMIT 1",
          [alt]
        );
      }
    }
    if (!result.rows.length) return res.status(404).json({ error: "Market not found" });
    res.json({ market: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /markets  — create or upsert a market
router.post("/", async (req, res) => {
  try {
    const {
      market_id, workflow_id, question, options = [], tags = [],
      market_type, country, liquidity_usdt = 0, duration_days = 30,
      contract_address, transaction_hash, image_url, description = "", bar_values = [],
      status = "active", creator_wallet,
    } = req.body;

    if (!market_id) return res.status(400).json({ error: "market_id is required" });
    if (!question)  return res.status(400).json({ error: "question is required" });

    const mid = await canonicalRainMarketId(String(market_id).trim());
    const creatorW = creator_wallet ? String(creator_wallet).toLowerCase() : null;

    const result = await query(`
      INSERT INTO markets
        (market_id, workflow_id, question, options, tags, market_type, country,
         liquidity_usdt, duration_days, contract_address, transaction_hash,
         image_url, description, bar_values, status, creator_wallet)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (market_id) DO UPDATE SET
        question         = EXCLUDED.question,
        options          = EXCLUDED.options,
        tags             = EXCLUDED.tags,
        market_type      = EXCLUDED.market_type,
        country          = EXCLUDED.country,
        liquidity_usdt   = EXCLUDED.liquidity_usdt,
        image_url        = COALESCE(EXCLUDED.image_url, markets.image_url),
        description      = EXCLUDED.description,
        bar_values       = EXCLUDED.bar_values,
        creator_wallet   = COALESCE(EXCLUDED.creator_wallet, markets.creator_wallet),
        updated_at       = NOW()
      RETURNING *
    `, [
      mid, workflow_id, question,
      JSON.stringify(options), JSON.stringify(tags),
      market_type, country, liquidity_usdt, duration_days,
      contract_address, transaction_hash, image_url, description,
      JSON.stringify(Array.isArray(bar_values) ? bar_values : []), status, creatorW,
    ]);

    res.status(201).json({ market: result.rows[0], created: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /markets/:marketId — partial update (resolve, bar_values, etc.)
router.patch("/:marketId", async (req, res) => {
  try {
    let key = String(req.params.marketId || "").trim();
    const alt = await canonicalRainMarketId(key);
    if (alt) key = alt;
    const b = req.body || {};
    const params = [key];
    const parts = [];
    const push = (col, val) => {
      params.push(val);
      parts.push(col + " = $" + params.length);
    };
    if (b.status !== undefined) push("status", b.status);
    if (b.winning_option !== undefined) push("winning_option", b.winning_option);
    if (b.outcome_index !== undefined) push("outcome_index", b.outcome_index);
    if (b.bar_values !== undefined) {
      push("bar_values", JSON.stringify(Array.isArray(b.bar_values) ? b.bar_values : []));
    }
    if (b.image_url !== undefined) push("image_url", b.image_url);
    if (b.description !== undefined) push("description", b.description);
    if (b.liquidity_usdt !== undefined) push("liquidity_usdt", b.liquidity_usdt);
    if (b.end_date !== undefined) push("end_date", b.end_date);
    if (b.contract_address !== undefined) push("contract_address", b.contract_address);
    if (b.workflow_id !== undefined) push("workflow_id", b.workflow_id);
    if (!parts.length) return res.status(400).json({ error: "No fields to update" });
    const result = await query(
      "UPDATE markets SET " + parts.join(", ") + ", updated_at = NOW() WHERE market_id = $1 RETURNING *",
      params
    );
    if (!result.rows.length) return res.status(404).json({ error: "Market not found" });
    res.json({ market: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /markets/:marketId/status  — update market status (active/resolved/expired)
router.put("/:marketId/status", async (req, res) => {
  try {
    const { status, winning_option_index } = req.body;
    if (!["active", "resolved", "expired", "pending"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }
    const result = await query(`
      UPDATE markets SET status = $1, updated_at = NOW()
      WHERE market_id = $2 RETURNING *
    `, [status, req.params.marketId]);
    if (!result.rows.length) return res.status(404).json({ error: "Market not found" });
    res.json({ market: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
