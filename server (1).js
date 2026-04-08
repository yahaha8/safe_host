// server.js – SafeStay backend (Node + Express + Neon PostgreSQL)
// ─────────────────────────────────────────────────────────────────
// Deployed on Render. DATABASE_URL is set as an environment variable.
// ─────────────────────────────────────────────────────────────────

const express = require("express");
const cors    = require("cors");
const { neon } = require("@neondatabase/serverless");

// ── Neon connection string from Render environment variable ─────
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("❌ DATABASE_URL is not set!"); process.exit(1); }
// ────────────────────────────────────────────────────────────────

const sql = neon(DATABASE_URL);
const app = express();

app.use(cors());
app.use(express.json());

// ── Create tables on first run ───────────────────────────────────
async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS owners (
      id   SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS listings (
      id             SERIAL PRIMARY KEY,
      owner_id       INTEGER REFERENCES owners(id),
      type           TEXT CHECK (type IN ('housing','storage')),
      title          TEXT NOT NULL,
      description    TEXT,
      price          NUMERIC NOT NULL,
      market_average NUMERIC DEFAULT 0,
      price_flagged  BOOLEAN DEFAULT FALSE,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS reviews (
      id         SERIAL PRIMARY KEY,
      listing_id INTEGER REFERENCES listings(id),
      owner_id   INTEGER,
      rating     INTEGER CHECK (rating BETWEEN 1 AND 5),
      comment    TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS price_flags (
      id            SERIAL PRIMARY KEY,
      owner_id      INTEGER,
      listing_title TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )`;

  // Seed sample owners if empty
  const existing = await sql`SELECT COUNT(*) FROM owners`;
  if (parseInt(existing[0].count) === 0) {
    await sql`INSERT INTO owners (name, email) VALUES
      ('Rahul Sharma', 'rahul@example.com'),
      ('Priya Verma',  'priya@example.com'),
      ('Amit Singh',   'amit@example.com')`;
    console.log("✅ Sample owners seeded.");
  }

  console.log("✅ Database ready.");
}

// ── Routes ───────────────────────────────────────────────────────

// GET all owners
app.get("/api/owners", async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM owners ORDER BY name`;
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET all listings
app.get("/api/listings", async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM listings ORDER BY created_at DESC`;
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST new listing
app.post("/api/listings", async (req, res) => {
  const { owner_id, type, title, description, price, market_average } = req.body;
  const price_flagged = market_average > 0 && price > market_average * 1.15;
  try {
    const rows = await sql`
      INSERT INTO listings (owner_id, type, title, description, price, market_average, price_flagged)
      VALUES (${owner_id}, ${type}, ${title}, ${description}, ${price}, ${market_average}, ${price_flagged})
      RETURNING *`;

    // Auto-insert price flag if flagged
    if (price_flagged) {
      await sql`INSERT INTO price_flags (owner_id, listing_title) VALUES (${owner_id}, ${title})`;
    }
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET all reviews
app.get("/api/reviews", async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM reviews ORDER BY created_at DESC`;
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST new review
app.post("/api/reviews", async (req, res) => {
  const { listing_id, owner_id, rating, comment } = req.body;
  try {
    const rows = await sql`
      INSERT INTO reviews (listing_id, owner_id, rating, comment)
      VALUES (${listing_id}, ${owner_id}, ${rating}, ${comment})
      RETURNING *`;
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET all price flags
app.get("/api/price_flags", async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM price_flags`;
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Start ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 SafeStay API running at http://localhost:${PORT}`));
}).catch(err => {
  console.error("❌ DB init failed:", err.message);
  process.exit(1);
});
