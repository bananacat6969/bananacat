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
    const testResult = await pool.query("SELECT 1 as test");
    console.log("✓ Database connection successful");

    // Check current schema
    console.log("Checking current schema...");
    const threadsSchema = await pool.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'threads' AND column_name = 'image_url'
    `);

    const postsSchema = await pool.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'posts' AND column_name = 'image_url'
    `);

    console.log("Current threads.image_url schema:", threadsSchema.rows[0]);
    console.log("Current posts.image_url schema:", postsSchema.rows[0]);

    // Fix threads table
    console.log("Updating threads.image_url column...");
    await pool.query(
      "ALTER TABLE threads ALTER COLUMN image_url TYPE TEXT;",
    );
    console.log("✓ threads.image_url updated to TEXT");

    // Fix posts table
    console.log("Updating posts.image_url column...");
    await pool.query("ALTER TABLE posts ALTER COLUMN image_url TYPE TEXT;");
    console.log("✓ posts.image_url updated to TEXT");

    // Verify the changes after updating
    const newThreadsSchema = await pool.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'threads' AND column_name = 'image_url'
    `);

    const newPostsSchema = await pool.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'posts' AND column_name = 'image_url'
    `);

    console.log("New threads.image_url schema:", newThreadsSchema.rows[0]);
    console.log("New posts.image_url schema:", newPostsSchema.rows[0]);

    console.log("Schema fix completed successfully!");
  } catch (error) {
    console.error("Error fixing schema:", error.message);
    console.error("Full error:", error);
  } finally {
    await pool.end();
  }
}

// Set DATABASE_URL if not already set (use your production URL)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://yokona_nbql_user:qrajVTS75czjnwybEgqkMYeWGB7A4oMt@dpg-d1fqs0vfte5s73frpa4g-a/yokona_nbql";
}

fixSchema();
