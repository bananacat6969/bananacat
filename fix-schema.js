const { Pool } = require("pg");

async function fixSchema() {
  // Use the same connection configuration as the main server
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
    max: 1, // Use minimal connections for this operation
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });

  try {
    console.log("Connecting to production database...");
    console.log("Database URL present:", !!process.env.DATABASE_URL);

    // Test connection first
    await pool.query("SELECT 1 as test");
    console.log("✓ Database connection successful");

    // Update threads and posts table to handle long text content
    console.log("Updating threads.content and posts.content to TEXT...");
    await pool.query("ALTER TABLE threads ALTER COLUMN content TYPE TEXT;");
    await pool.query("ALTER TABLE posts ALTER COLUMN content TYPE TEXT;");
    console.log("✓ threads.content and posts.content updated to TEXT");

    // Update image_url columns in threads and posts tables
    console.log("Updating threads.image_url and posts.image_url to TEXT...");
    await pool.query("ALTER TABLE threads ALTER COLUMN image_url TYPE TEXT;");
    await pool.query("ALTER TABLE posts ALTER COLUMN image_url TYPE TEXT;");
    console.log("✓ threads.image_url and posts.image_url updated to TEXT");

    console.log("Schema updates completed successfully!");
  } catch (error) {
    console.error("Error updating schema:", error.message);
  } finally {
    await pool.end();
  }
}

// Set DATABASE_URL if not already set (use your production URL)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://yokona_w8fl_user:bFqt2Gg9ivoZ3mhl8N7CNhiNY3t4ckqC@dpg-d1fmnn3ipnbc739pao2g-a/yokona_w8fl";
}

fixSchema();
