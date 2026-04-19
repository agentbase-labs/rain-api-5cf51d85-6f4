"use strict";
const { Router } = require("express");
const { query } = require("../db");

const router = Router();

// POST /transactions — log invest / sell / claim / add_liquidity (dedupe by tx_hash)
router.post("/", async (req, res) => {
  try {
    const {
      tx_hash, market_id, wallet_address, tx_type,
      option_index, amount_usdt, shares, outcome_received, workflow_id,
    } = req.body || {};

    if (!tx_hash) return res.status(400).json({ error: "tx_hash is required" });
    if (!market_id) return res.status(400).json({ error: "market_id is required" });
    if (!wallet_address) return res.status(400).json({ error: "wallet_address is required" });
    if (!tx_type) return res.status(400).json({ error: "tx_type is required" });

    const wallet = String(wallet_address).toLowerCase();
    const ins = await query(
      `INSERT INTO transactions
        (tx_hash, market_id, wallet_address, tx_type, option_index, amount_usdt, shares, outcome_received, workflow_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (tx_hash) DO NOTHING
       RETURNING *`,
      [
        tx_hash,
        String(market_id),
        wallet,
        String(tx_type),
        option_index != null ? option_index : null,
        amount_usdt != null ? amount_usdt : null,
        shares != null ? shares : null,
        outcome_received != null ? outcome_received : null,
        workflow_id || null,
      ]
    );

    if (!ins.rows.length) {
      return res.json({ ok: true, duplicate: true });
    }

    if (tx_type === "invest") {
      await query(
        `INSERT INTO positions (wallet_address, market_id, option_index, option_name, amount_usdt, transaction_hash)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (wallet_address, market_id, option_index) DO UPDATE SET
           amount_usdt = positions.amount_usdt + EXCLUDED.amount_usdt,
           transaction_hash = EXCLUDED.transaction_hash`,
        [
          wallet,
          String(market_id),
          Number(option_index) || 0,
          null,
          Number(amount_usdt) || 0,
          tx_hash,
        ]
      );
    }

    res.status(201).json({ transaction: ins.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /transactions/:walletAddress — history
router.get("/:walletAddress", async (req, res) => {
  try {
    const wallet = String(req.params.walletAddress || "").toLowerCase();
    const { market_id, tx_type, limit = "50" } = req.query;
    const params = [wallet];
    let sql =
      `SELECT t.*, m.question, m.options, m.status AS market_status
       FROM transactions t
       LEFT JOIN markets m ON m.market_id = t.market_id
       WHERE t.wallet_address = $1`;
    if (market_id) {
      params.push(market_id);
      sql += ` AND t.market_id = $${params.length}`;
    }
    if (tx_type) {
      params.push(tx_type);
      sql += ` AND t.tx_type = $${params.length}`;
    }
    params.push(parseInt(limit, 10) || 50);
    sql += ` ORDER BY t.created_at DESC LIMIT $${params.length}`;
    const result = await query(sql, params);
    res.json({ transactions: result.rows, total: result.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
