
const { Pool } = require('pg');
require('dotenv').config();

async function migrateDatabase() {
  // Use the same connection configuration as the main server
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 1,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });

  try {
    console.log('Connecting to production database...');
    console.log('Database URL present:', !!process.env.DATABASE_URL);
    
    // Test connection
    await pool.query('SELECT 1 as test');
    console.log('✓ Connected to production database');
    
    // Check if old columns exist
    const threadsColumns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'threads' AND column_name IN ('image_url', 'image_data', 'image_type')
    `);
    
    const postsColumns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'posts' AND column_name IN ('image_url', 'image_data', 'image_type')
    `);
    
    console.log('Existing threads columns:', threadsColumns.rows.map(r => r.column_name));
    console.log('Existing posts columns:', postsColumns.rows.map(r => r.column_name));
    
    // Add new binary columns if they don't exist
    const hasThreadsImageData = threadsColumns.rows.some(r => r.column_name === 'image_data');
    const hasThreadsImageType = threadsColumns.rows.some(r => r.column_name === 'image_type');
    const hasPostsImageData = postsColumns.rows.some(r => r.column_name === 'image_data');
    const hasPostsImageType = postsColumns.rows.some(r => r.column_name === 'image_type');
    
    if (!hasThreadsImageData) {
      await pool.query('ALTER TABLE threads ADD COLUMN image_data BYTEA');
      console.log('✓ Added image_data column to threads table');
    } else {
      console.log('- image_data column already exists in threads table');
    }
    
    if (!hasThreadsImageType) {
      await pool.query('ALTER TABLE threads ADD COLUMN image_type VARCHAR(50)');
      console.log('✓ Added image_type column to threads table');
    } else {
      console.log('- image_type column already exists in threads table');
    }
    
    if (!hasPostsImageData) {
      await pool.query('ALTER TABLE posts ADD COLUMN image_data BYTEA');
      console.log('✓ Added image_data column to posts table');
    } else {
      console.log('- image_data column already exists in posts table');
    }
    
    if (!hasPostsImageType) {
      await pool.query('ALTER TABLE posts ADD COLUMN image_type VARCHAR(50)');
      console.log('✓ Added image_type column to posts table');
    } else {
      console.log('- image_type column already exists in posts table');
    }
    
    // Remove old image_url columns if they exist
    const hasThreadsImageUrl = threadsColumns.rows.some(r => r.column_name === 'image_url');
    const hasPostsImageUrl = postsColumns.rows.some(r => r.column_name === 'image_url');
    
    if (hasThreadsImageUrl) {
      await pool.query('ALTER TABLE threads DROP COLUMN image_url');
      console.log('✓ Removed image_url column from threads table');
    } else {
      console.log('- image_url column does not exist in threads table');
    }
    
    if (hasPostsImageUrl) {
      await pool.query('ALTER TABLE posts DROP COLUMN image_url');
      console.log('✓ Removed image_url column from posts table');
    } else {
      console.log('- image_url column does not exist in posts table');
    }
    
    // Verify final schema
    const finalThreadsColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'threads' AND column_name LIKE '%image%'
      ORDER BY column_name
    `);
    
    const finalPostsColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'posts' AND column_name LIKE '%image%'
      ORDER BY column_name
    `);
    
    console.log('\nFinal schema:');
    console.log('Threads image columns:', finalThreadsColumns.rows);
    console.log('Posts image columns:', finalPostsColumns.rows);
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
  } finally {
    await pool.end();
  }
}

// Set DATABASE_URL if not already set (fallback to your production URL)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://yokona_w8fl_user:bFqt2Gg9ivoZ3mhl8N7CNhiNY3t4ckqC@dpg-d1fmnn3ipnbc739pao2g-a/yokona_w8fl";
}

// Export the function so it can be used by server.js
module.exports = { migrateDatabase };

// Run migration if this file is executed directly
if (require.main === module) {
  migrateDatabase();
}
