
const { Pool } = require('pg');
require('dotenv').config();

async function migrateDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 1,
  });

  try {
    console.log('Starting migration to binary image storage...');
    
    // Add new columns
    await pool.query('ALTER TABLE threads ADD COLUMN IF NOT EXISTS image_data BYTEA');
    await pool.query('ALTER TABLE threads ADD COLUMN IF NOT EXISTS image_type VARCHAR(50)');
    await pool.query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_data BYTEA');
    await pool.query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_type VARCHAR(50)');
    
    console.log('✓ Added new columns for binary storage');
    
    // Note: You'll need to manually drop the old image_url columns after confirming everything works
    console.log('Migration complete. Test the new system, then manually drop image_url columns.');
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

migrateDatabase();
