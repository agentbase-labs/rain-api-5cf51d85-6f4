"use strict";
const { Router } = require("express");
const { query } = require("../db");

const router = Router();

// GET /portfolio/:walletAddress — open positions + aggregate stats from transactions
router.get("/:walletAddress", async (req, res) => {
  try {
    const wallet = String(req.params.walletAddress || "").toLowerCase();
    const pos = await query(
      `SELECT p.*, m.question, m.options, m.bar_values, m.status AS market_status,
              m.winning_option, m.outcome_index
       FROM positions p
       JOIN markets m ON m.market_id = p.market_id
       WHERE p.wallet_address = $1 AND COALESCE(p.amount_usdt, 0) > 0
       ORDER BY p.created_at DESC`,
      [wallet]
    );
    const stats = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN tx_type = 'invest' THEN amount_usdt END), 0) AS total_invested,
         COALESCE(SUM(CASE WHEN tx_type = 'claim' THEN outcome_received END), 0) AS total_claimed,
         COALESCE(SUM(CASE WHEN tx_type = 'sell' THEN amount_usdt END), 0) AS total_sold,
         COUNT(DISTINCT market_id) AS markets_participated
       FROM transactions
       WHERE wallet_address = $1`,
      [wallet]
    );
    res.json({
      wallet,
      positions: pos.rows,
      stats: stats.rows[0] || {},
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
