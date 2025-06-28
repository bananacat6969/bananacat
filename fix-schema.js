
const { Pool } = require('pg');
require('dotenv').config();

async function fixSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('Connecting to database...');
    
    // Fix threads table
    console.log('Updating threads.image_url column...');
    await pool.query('ALTER TABLE threads ALTER COLUMN image_url TYPE TEXT;');
    console.log('✓ threads.image_url updated to TEXT');
    
    // Fix posts table
    console.log('Updating posts.image_url column...');
    await pool.query('ALTER TABLE posts ALTER COLUMN image_url TYPE TEXT;');
    console.log('✓ posts.image_url updated to TEXT');
    
    console.log('Schema fix completed successfully!');
  } catch (error) {
    console.error('Error fixing schema:', error.message);
  } finally {
    await pool.end();
  }
}

fixSchema();
