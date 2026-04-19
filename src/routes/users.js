"use strict";
const { Router } = require("express");
const { query } = require("../db");

const router = Router();

// GET /users/:walletAddress
router.get("/:address", async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    const userResult = await query(
      "SELECT * FROM users WHERE wallet_address = $1",
      [address]
    );
    if (!userResult.rows.length) return res.status(404).json({ error: "User not found" });

    const posResult = await query(
      "SELECT p.*, m.question, m.status FROM positions p LEFT JOIN markets m ON m.market_id = p.market_id WHERE p.wallet_address = $1 ORDER BY p.created_at DESC",
      [address]
    );

    res.json({ user: userResult.rows[0], positions: posResult.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /users/connect  — register wallet address (called on wallet connect)
router.post("/connect", async (req, res) => {
  try {
    const { wallet_address, workflow_id, display_name } = req.body;
    if (!wallet_address) return res.status(400).json({ error: "wallet_address is required" });

    const address = wallet_address.toLowerCase();
    const result = await query(`
      INSERT INTO users (wallet_address, workflow_id, display_name, last_seen_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (wallet_address) DO UPDATE SET
        last_seen_at = NOW(),
        display_name = COALESCE(EXCLUDED.display_name, users.display_name)
      RETURNING *
    `, [address, workflow_id, display_name || null]);

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /positions  — save a trading position
router.post("/:address/positions", async (req, res) => {
  try {
    const wallet_address = req.params.address.toLowerCase();
    const { market_id, option_index, option_name, amount_usdt, transaction_hash } = req.body;
    if (!market_id || option_index === undefined) {
      return res.status(400).json({ error: "market_id and option_index are required" });
    }
    const result = await query(`
      INSERT INTO positions (wallet_address, market_id, option_index, option_name, amount_usdt, transaction_hash)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (wallet_address, market_id, option_index) DO UPDATE SET
        amount_usdt = positions.amount_usdt + EXCLUDED.amount_usdt,
        transaction_hash = EXCLUDED.transaction_hash
      RETURNING *
    `, [wallet_address, market_id, option_index, option_name, amount_usdt || 0, transaction_hash]);
    res.status(201).json({ position: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
