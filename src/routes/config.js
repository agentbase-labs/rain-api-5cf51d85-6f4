"use strict";
const { Router } = require("express");
const { query } = require("../db");

const router = Router();

// GET /config/:workflowId
router.get("/:workflowId", async (req, res) => {
  try {
    const result = await query(
      "SELECT * FROM site_config WHERE workflow_id = $1",
      [req.params.workflowId]
    );
    if (!result.rows.length) {
      return res.json({ workflow_id: req.params.workflowId, market_ids: [] });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /config — upsert branding + market_ids mirror of brand.json
router.post("/", async (req, res) => {
  try {
    const {
      workflow_id, site_name, primary_color, accent_color,
      market_ids, logo_url, api_url,
    } = req.body || {};
    if (!workflow_id) return res.status(400).json({ error: "workflow_id is required" });

    const mids = Array.isArray(market_ids) ? market_ids : [];
    const result = await query(
      `INSERT INTO site_config
        (workflow_id, site_name, primary_color, accent_color, market_ids, logo_url, api_url)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       ON CONFLICT (workflow_id) DO UPDATE SET
         site_name     = COALESCE(EXCLUDED.site_name, site_config.site_name),
         primary_color = COALESCE(EXCLUDED.primary_color, site_config.primary_color),
         accent_color  = COALESCE(EXCLUDED.accent_color, site_config.accent_color),
         market_ids    = COALESCE(EXCLUDED.market_ids, site_config.market_ids),
         logo_url      = COALESCE(EXCLUDED.logo_url, site_config.logo_url),
         api_url       = COALESCE(EXCLUDED.api_url, site_config.api_url),
         updated_at    = NOW()
       RETURNING *`,
      [
        workflow_id,
        site_name || null,
        primary_color || null,
        accent_color || null,
        JSON.stringify(mids),
        logo_url || null,
        api_url || null,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
