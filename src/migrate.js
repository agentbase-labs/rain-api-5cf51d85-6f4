"use strict";
const { query } = require("./db");

async function runMigrations() {
  console.log("🔄 Running database migrations...");

  // Markets table
  await query(`
    CREATE TABLE IF NOT EXISTS markets (
      id SERIAL PRIMARY KEY,
      market_id VARCHAR(255) UNIQUE NOT NULL,
      workflow_id VARCHAR(255),
      question TEXT NOT NULL DEFAULT '',
      options JSONB NOT NULL DEFAULT '[]',
      tags JSONB NOT NULL DEFAULT '[]',
      market_type VARCHAR(100),
      country VARCHAR(100),
      liquidity_usdt NUMERIC(18, 6) DEFAULT 0,
      duration_days INTEGER DEFAULT 30,
      contract_address VARCHAR(255),
      transaction_hash VARCHAR(255),
      image_url VARCHAR(500),
      description TEXT DEFAULT '',
      bar_values JSONB NOT NULL DEFAULT '[]',
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Users table (wallet-based)
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(255) UNIQUE NOT NULL,
      workflow_id VARCHAR(255),
      display_name VARCHAR(255),
      avatar_url VARCHAR(500),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Positions table
  await query(`
    CREATE TABLE IF NOT EXISTS positions (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(255) NOT NULL,
      market_id VARCHAR(255) NOT NULL,
      option_index INTEGER NOT NULL,
      option_name VARCHAR(255),
      amount_usdt NUMERIC(18, 6) DEFAULT 0,
      transaction_hash VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(wallet_address, market_id, option_index)
    )
  `);

  await query(`ALTER TABLE markets ADD COLUMN IF NOT EXISTS creator_wallet VARCHAR(255)`);
  await query(`ALTER TABLE markets ADD COLUMN IF NOT EXISTS winning_option TEXT`);
  await query(`ALTER TABLE markets ADD COLUMN IF NOT EXISTS outcome_index INTEGER`);
  await query(`ALTER TABLE markets ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ`);

  await query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      tx_hash VARCHAR(255) UNIQUE NOT NULL,
      market_id VARCHAR(255) NOT NULL,
      wallet_address VARCHAR(255) NOT NULL,
      tx_type VARCHAR(50) NOT NULL,
      option_index INTEGER,
      amount_usdt NUMERIC(18, 6),
      shares NUMERIC(18, 6),
      outcome_received NUMERIC(18, 6),
      workflow_id VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS site_config (
      workflow_id VARCHAR(255) PRIMARY KEY,
      site_name TEXT,
      primary_color VARCHAR(100),
      accent_color VARCHAR(100),
      market_ids JSONB NOT NULL DEFAULT '[]',
      logo_url TEXT,
      api_url TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_txns_wallet ON transactions(wallet_address)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_txns_market ON transactions(market_id)`);

  // Updated-at trigger function ($func$ avoids escaped-\ dollar quotes in emitted migrate.js)
  await query(`
    CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $func$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
    $func$ LANGUAGE plpgsql
  `);

  await query(`
    DROP TRIGGER IF EXISTS markets_updated_at ON markets
  `);
  await query(`
    CREATE TRIGGER markets_updated_at
    BEFORE UPDATE ON markets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at()
  `);

  // Indexes
  await query(`CREATE INDEX IF NOT EXISTS idx_markets_workflow_id ON markets(workflow_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_positions_wallet ON positions(wallet_address)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_positions_market ON positions(market_id)`);

  console.log("✅ Migrations complete");
}

module.exports = { runMigrations };
