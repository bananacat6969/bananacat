
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Database setup - use Supabase PostgreSQL in production, SQLite for development
let db;
const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
const hasSupabase = process.env.SUPABASE_URL || isProduction;

if (hasSupabase) {
  // Supabase PostgreSQL for production
  const { Pool } = require('pg');
  
  // Use environment variables with fallbacks
  const dbConfig = {
    connectionString: process.env.DATABASE_URL || `postgresql://postgres:iLovePlasticGirl!88@db.yxppeiyytciuvzeskukw.supabase.co:5432/postgres`,
    ssl: { rejectUnauthorized: false },
    max: 3,
    min: 0,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
    acquireTimeoutMillis: 15000,
    allowExitOnIdle: true,
    statement_timeout: 10000,
    query_timeout: 10000,
    // Force IPv4 to avoid IPv6 connection issues
    family: 4
  };

  db = new Pool(dbConfig);

  // Handle pool errors with reconnection
  db.on('error', (err) => {
    console.error('Database pool error:', err.message);
  });

  db.on('connect', (client) => {
    console.log('✓ Connected to Supabase PostgreSQL');
  });

  console.log('Using Supabase PostgreSQL database');
} else {
  // SQLite for development (Replit)
  const Database = require('better-sqlite3');
  db = new Database('yokona.db');
  console.log('Using SQLite for development');
}

// Visitor tracking middleware
app.use((req, res, next) => {
  // Skip tracking for API endpoints and static files
  if (!req.path.startsWith('/api/') && !req.path.includes('.')) {
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
    const userAgent = req.headers['user-agent'] || '';
    const sessionKey = `${clientIP}-${userAgent}`;

    // Track unique sessions (approximates unique visitors)
    visitorSessions.add(sessionKey);

    // Track daily visitors
    const today = new Date().toDateString();
    if (!dailyVisitors.has(today)) {
      dailyVisitors.set(today, new Set());
    }
    dailyVisitors.get(today).add(sessionKey);

    // Clean up sessions older than 30 minutes
    setTimeout(() => {
      visitorSessions.delete(sessionKey);
    }, 30 * 60 * 1000);
  }

  next();
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'yokona/public')));

// File upload configuration
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Simple visitor tracking
const visitorSessions = new Set();
const dailyVisitors = new Map();

// Password hashing utility
function hashPassword(password) {
  if (!password) return null;
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Clean up old daily visitor data (keep last 7 days)
setInterval(() => {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoKey = weekAgo.toDateString();

  for (const [date] of dailyVisitors) {
    if (date < weekAgoKey) {
      dailyVisitors.delete(date);
    }
  }
}, 24 * 60 * 60 * 1000); // Run daily

// Database helper functions with improved retry logic
async function query(sql, params = [], retries = 2) {
  if (hasSupabase) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      let client;
      try {
        // Add timeout to connection acquisition
        client = await Promise.race([
          db.connect(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout')), 5000)
          )
        ]);

        const result = await client.query(sql, params);
        client.release();
        return result.rows;
      } catch (error) {
        console.error(`Database query attempt ${attempt}/${retries} failed:`, error.message);

        if (client) {
          try {
            client.release(true); // Release with error flag
          } catch (releaseError) {
            console.error('Error releasing client:', releaseError.message);
          }
        }

        if (attempt === retries) {
          // If all attempts fail, fall back to SQLite if not in production
          if (!isProduction) {
            console.log('Falling back to SQLite due to connection issues');
            const Database = require('better-sqlite3');
            if (!db.prepare) { // If db is still Pool, switch to SQLite
              db = new Database('yokona.db');
            }
            return querySQLite(sql, params);
          }
          throw error;
        }

        // Exponential backoff
        const delay = Math.pow(2, attempt) * 300;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } else {
    return querySQLite(sql, params);
  }
}

function querySQLite(sql, params) {
  try {
    const stmt = db.prepare(sql);
    if (sql.trim().toLowerCase().startsWith('select')) {
      return stmt.all(...params);
    } else {
      const result = stmt.run(...params);
      return [{ id: result.lastInsertRowid, ...result }];
    }
  } catch (error) {
    console.error('SQLite query error:', error.message);
    throw error;
  }
}

// Initialize database
async function initDB() {
  try {
    if (hasSupabase) {
      // PostgreSQL schema
      await query(`
        CREATE TABLE IF NOT EXISTS boards (
          id SERIAL PRIMARY KEY,
          slug VARCHAR(20) UNIQUE NOT NULL,
          name VARCHAR(100) NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS threads (
          id SERIAL PRIMARY KEY,
          board_slug VARCHAR(20) REFERENCES boards(slug),
          subject VARCHAR(200),
          content TEXT NOT NULL,
          image_data BYTEA,
          image_type VARCHAR(50),
          reply_count INTEGER DEFAULT 0,
          views INTEGER DEFAULT 0,
          is_nsfw BOOLEAN DEFAULT FALSE,
          password_hash VARCHAR(255),
          last_bump_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS posts (
          id SERIAL PRIMARY KEY,
          thread_id INTEGER REFERENCES threads(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          image_data BYTEA,
          image_type VARCHAR(50),
          password_hash VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Add missing columns if they don't exist
      try {
        await query('ALTER TABLE threads ADD COLUMN IF NOT EXISTS is_nsfw BOOLEAN DEFAULT FALSE');
        console.log('✓ Added is_nsfw column to threads table (if not exists)');
      } catch (e) {
        console.log('- is_nsfw column already exists in threads table');
      }

      try {
        await query('ALTER TABLE threads ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)');
        console.log('✓ Added password_hash column to threads table (if not exists)');
      } catch (e) {
        console.log('- password_hash column already exists in threads table');
      }

      try {
        await query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)');
        console.log('✓ Added password_hash column to posts table (if not exists)');
      } catch (e) {
        console.log('- password_hash column already exists in posts table');
      }

      
    } else {
      // SQLite schema
      db.prepare(`
        CREATE TABLE IF NOT EXISTS boards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      db.prepare(`
        CREATE TABLE IF NOT EXISTS threads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          board_slug TEXT NOT NULL,
          subject TEXT,
          content TEXT NOT NULL,
          image_data BLOB,
          image_type TEXT,
          reply_count INTEGER DEFAULT 0,
          views INTEGER DEFAULT 0,
          is_nsfw INTEGER DEFAULT 0,
          password_hash TEXT,
          last_bump_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (board_slug) REFERENCES boards(slug)
        )
      `).run();

      db.prepare(`
        CREATE TABLE IF NOT EXISTS posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          thread_id INTEGER NOT NULL,
          content TEXT NOT NULL,
          image_data BLOB,
          image_type TEXT,
          password_hash TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
        )
      `).run();
    }

    // Insert default boards
    const boards = [
      { slug: 'gen', name: 'General Discussions', description: 'General topics and casual conversation' },
      { slug: 'pol', name: 'Politically Incorrect', description: 'Uncensored political discussions and debate' },
      { slug: 'hot', name: 'Spicy Takes', description: 'Controversial opinions and hot takes' },
      { slug: 'pasta', name: 'CopyPastas', description: 'Copy and paste content' },
      { slug: 'sch', name: 'Schizo-posting', description: 'Schizophrenic rambling and theories' },
      { slug: 'db', name: 'Heated Debates', description: 'Serious debates and discussions' },
      { slug: 'marx', name: 'Marxism-Leninism', description: 'Theory and praxis discussions' },
      { slug: 'lol', name: 'Meme Culture', description: 'Memes and internet culture' },
      { slug: 'gr', name: 'Green-Text', description: 'Green text stories' },
      { slug: 'worm', name: 'Brainworm', description: 'Brain worm discussions' },
      { slug: 'coal', name: 'Coal Mine', description: 'Coal posts and content' },
      { slug: 'gem', name: 'Rare Gem', description: 'Rare and valuable content' }
    ];

    for (const board of boards) {
      try {
        if (hasSupabase) {
          await query(
            'INSERT INTO boards (slug, name, description) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING',
            [board.slug, board.name, board.description]
          );
        } else {
          db.prepare('INSERT OR IGNORE INTO boards (slug, name, description) VALUES (?, ?, ?)')
            .run(board.slug, board.name, board.description);
        }
      } catch (e) {
        console.log(`Board ${board.slug} already exists or error:`, e.message);
      }
    }

    console.log('✓ Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error.message);
    if (!isProduction) {
      console.log('Falling back to SQLite...');
      try {
        const Database = require('better-sqlite3');
        db = new Database('yokona.db');
        await initDB(); // Retry with SQLite
      } catch (sqliteError) {
        console.error('SQLite fallback failed:', sqliteError.message);
      }
    }
  }
}

// API Routes

// Database health check
app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1 as health');
    res.json({ 
      status: 'ok', 
      database: hasSupabase ? 'supabase-postgresql' : 'sqlite',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Health check failed:', error.message);
    res.status(503).json({ 
      status: 'error', 
      database: hasSupabase ? 'supabase-postgresql' : 'sqlite',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get board info
app.get('/api/boards/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const boards = hasSupabase
      ? await query('SELECT * FROM boards WHERE slug = $1', [slug])
      : await query('SELECT * FROM boards WHERE slug = ?', [slug]);

    if (boards.length === 0) {
      return res.status(404).json({ error: 'Board not found' });
    }

    res.json(boards[0]);
  } catch (error) {
    console.error('Error fetching board:', error.message);
    res.status(500).json({ 
      error: 'Database connection error', 
      details: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});

// Get threads for a board
app.get('/api/boards/:slug/threads', async (req, res) => {
  try {
    const { slug } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const offset = (page - 1) * limit;

    const threads = hasSupabase
      ? await query(`
          SELECT * FROM threads 
          WHERE board_slug = $1 
          ORDER BY last_bump_at DESC 
          LIMIT $2 OFFSET $3
        `, [slug, limit, offset])
      : await query(`
          SELECT * FROM threads 
          WHERE board_slug = ? 
          ORDER BY last_bump_at DESC 
          LIMIT ? OFFSET ?
        `, [slug, limit, offset]);

    const count = hasSupabase
      ? await query('SELECT COUNT(*) as count FROM threads WHERE board_slug = $1', [slug])
      : await query('SELECT COUNT(*) as count FROM threads WHERE board_slug = ?', [slug]);

    const total = count[0].count;

    res.json({
      threads,
      total: parseInt(total),
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching threads:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new thread
app.post('/api/boards/:slug/threads', upload.single('image'), async (req, res) => {
  try {
    const { slug } = req.params;
    const { subject, content, isNsfw, password } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Check if board exists
    const boards = hasSupabase
      ? await query('SELECT * FROM boards WHERE slug = $1', [slug])
      : await query('SELECT * FROM boards WHERE slug = ?', [slug]);

    if (boards.length === 0) {
      return res.status(404).json({ error: 'Board not found' });
    }

    // Handle image upload with validation
    let imageData = null;
    let imageType = null;
    if (req.file) {
      // Validate file type
      if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({ error: 'Only image files are allowed' });
      }

      // Validate file size (5MB limit already handled by multer)
      if (req.file.size > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'File size too large (max 5MB)' });
      }

      imageData = req.file.buffer;
      imageType = req.file.mimetype;
    }

    const passwordHash = hashPassword(password);
    const isNsfwBool = isNsfw === 'true' || isNsfw === true;

    const result = hasSupabase
      ? await query(`
          INSERT INTO threads (board_slug, subject, content, image_data, image_type, is_nsfw, password_hash)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [slug, subject || null, content, imageData, imageType, isNsfwBool, passwordHash])
      : await query(`
          INSERT INTO threads (board_slug, subject, content, image_data, image_type, is_nsfw, password_hash)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [slug, subject || null, content, imageData, imageType, isNsfwBool ? 1 : 0, passwordHash]);

    res.json(result[0] || { id: result.lastInsertRowid });
  } catch (error) {
    console.error('Error creating thread:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get thread with posts
app.get('/api/threads/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get thread info
    const threads = hasSupabase
      ? await query('SELECT * FROM threads WHERE id = $1', [id])
      : await query('SELECT * FROM threads WHERE id = ?', [id]);

    if (threads.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Get posts
    const posts = hasSupabase
      ? await query(`
          SELECT * FROM posts 
          WHERE thread_id = $1 
          ORDER BY created_at ASC
        `, [id])
      : await query(`
          SELECT * FROM posts 
          WHERE thread_id = ? 
          ORDER BY created_at ASC
        `, [id]);

    // Increment view count
    if (hasSupabase) {
      await query('UPDATE threads SET views = views + 1 WHERE id = $1', [id]);
    } else {
      await query('UPDATE threads SET views = views + 1 WHERE id = ?', [id]);
    }

    res.json({
      thread: threads[0],
      posts: posts
    });
  } catch (error) {
    console.error('Error fetching thread:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new post
app.post('/api/threads/:id/posts', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { content, password } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Check if thread exists
    const threads = hasSupabase
      ? await query('SELECT * FROM threads WHERE id = $1', [id])
      : await query('SELECT * FROM threads WHERE id = ?', [id]);

    if (threads.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    let imageData = null;
    let imageType = null;
    if (req.file) {
      // Validate file type
      if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({ error: 'Only image files are allowed' });
      }

      // Validate file size (5MB limit already handled by multer)
      if (req.file.size > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'File size too large (max 5MB)' });
      }

      imageData = req.file.buffer;
      imageType = req.file.mimetype;
    }

    const passwordHash = hashPassword(password);

    // Create post
    const postResult = hasSupabase
      ? await query(`
          INSERT INTO posts (thread_id, content, image_data, image_type, password_hash)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `, [id, content, imageData, imageType, passwordHash])
      : await query(`
          INSERT INTO posts (thread_id, content, image_data, image_type, password_hash)
          VALUES (?, ?, ?, ?, ?)
        `, [id, content, imageData, imageType, passwordHash]);

    // Update thread reply count and bump time
    if (hasSupabase) {
      await query(`
        UPDATE threads 
        SET reply_count = reply_count + 1, last_bump_at = CURRENT_TIMESTAMP 
        WHERE id = $1
      `, [id]);
    } else {
      await query(`
        UPDATE threads 
        SET reply_count = reply_count + 1, last_bump_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [id]);
    }

    res.json(postResult[0] || { id: postResult.lastInsertRowid });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get latest posts for homepage
app.get('/api/latest-posts', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const offset = (page - 1) * limit;

    const countResult = hasSupabase
      ? await query(`SELECT COUNT(*) as total FROM threads`)
      : await query(`SELECT COUNT(*) as total FROM threads`);

    const total = countResult[0].total || countResult[0].count || 0;
    const totalPages = Math.ceil(total / limit);

    const result = hasSupabase
      ? await query(`
          SELECT t.*, b.name as board_name, b.slug as board_slug
          FROM threads t
          JOIN boards b ON t.board_slug = b.slug
          ORDER BY t.last_bump_at DESC
          LIMIT $1 OFFSET $2
        `, [limit, offset])
      : await query(`
          SELECT t.*, b.name as board_name, b.slug as board_slug
          FROM threads t
          JOIN boards b ON t.board_slug = b.slug
          ORDER BY t.last_bump_at DESC
          LIMIT ? OFFSET ?
        `, [limit, offset]);

    res.json({
      posts: result || [],
      totalPages,
      currentPage: page,
      total: parseInt(total)
    });
  } catch (error) {
    console.error('Error fetching latest posts:', error.message);

    // Return empty data instead of error to keep the frontend functional
    res.json({
      posts: [],
      totalPages: 1,
      currentPage: 1,
      total: 0,
      error: 'Database temporarily unavailable'
    });
  }
});

// Serve images
app.get('/api/images/thread/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = hasSupabase
      ? await query('SELECT image_data, image_type FROM threads WHERE id = $1', [id])
      : await query('SELECT image_data, image_type FROM threads WHERE id = ?', [id]);

    if (result.length === 0 || !result[0].image_data) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const { image_data, image_type } = result[0];

    res.set('Content-Type', image_type);
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.send(image_data);
  } catch (error) {
    console.error('Error serving thread image:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/images/post/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = hasSupabase
      ? await query('SELECT image_data, image_type FROM posts WHERE id = $1', [id])
      : await query('SELECT image_data, image_type FROM posts WHERE id = ?', [id]);

    if (result.length === 0 || !result[0].image_data) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const { image_data, image_type } = result[0];

    res.set('Content-Type', image_type);
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.send(image_data);
  } catch (error) {
    console.error('Error serving post image:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete thread
app.delete('/api/threads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const passwordHash = hashPassword(password);

    // Check if thread exists and password matches
    const threads = hasSupabase
      ? await query('SELECT * FROM threads WHERE id = $1 AND password_hash = $2', [id, passwordHash])
      : await query('SELECT * FROM threads WHERE id = ? AND password_hash = ?', [id, passwordHash]);

    if (threads.length === 0) {
      return res.status(404).json({ error: 'Thread not found or incorrect password' });
    }

    // Delete thread (posts will be cascade deleted)
    if (hasSupabase) {
      await query('DELETE FROM threads WHERE id = $1', [id]);
    } else {
      await query('DELETE FROM threads WHERE id = ?', [id]);
    }

    res.json({ message: 'Thread deleted successfully' });
  } catch (error) {
    console.error('Error deleting thread:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete post
app.delete('/api/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const passwordHash = hashPassword(password);

    // Check if post exists and password matches
    const posts = hasSupabase
      ? await query('SELECT * FROM posts WHERE id = $1 AND password_hash = $2', [id, passwordHash])
      : await query('SELECT * FROM posts WHERE id = ? AND password_hash = ?', [id, passwordHash]);

    if (posts.length === 0) {
      return res.status(404).json({ error: 'Post not found or incorrect password' });
    }

    const threadId = posts[0].thread_id;

    // Delete post
    if (hasSupabase) {
      await query('DELETE FROM posts WHERE id = $1', [id]);
    } else {
      await query('DELETE FROM posts WHERE id = ?', [id]);
    }

    // Update thread reply count
    if (hasSupabase) {
      await query('UPDATE threads SET reply_count = reply_count - 1 WHERE id = $1', [threadId]);
    } else {
      await query('UPDATE threads SET reply_count = reply_count - 1 WHERE id = ?', [threadId]);
    }

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get site statistics
app.get('/api/stats', async (req, res) => {
  try {
    const threadsCount = hasSupabase
      ? await query('SELECT COUNT(*) as count FROM threads')
      : await query('SELECT COUNT(*) as count FROM threads');

    const postsCount = hasSupabase
      ? await query('SELECT COUNT(*) as count FROM posts')
      : await query('SELECT COUNT(*) as count FROM posts');

    const todayThreads = hasSupabase
      ? await query(`SELECT COUNT(*) as count FROM threads WHERE created_at >= CURRENT_DATE`)
      : await query(`SELECT COUNT(*) as count FROM threads WHERE created_at >= date('now')`);

    const todayPosts = hasSupabase
      ? await query(`SELECT COUNT(*) as count FROM posts WHERE created_at >= CURRENT_DATE`)
      : await query(`SELECT COUNT(*) as count FROM posts WHERE created_at >= date('now')`);

    // Calculate realistic visitor stats
    const today = new Date().toDateString();
    const todayVisitors = dailyVisitors.get(today)?.size || 0;
    const currentOnline = visitorSessions.size;

    // Estimate total unique visitors (based on content activity and some baseline)
    const totalContent = parseInt(threadsCount[0].count || 0) + parseInt(postsCount[0].count || 0);
    const estimatedTotalVisitors = Math.max(
      Math.floor(totalContent * 2.5 + 150), // Base estimate: content * 2.5 + baseline
      todayVisitors + 100 // Ensure it's at least higher than today's count
    );

    res.json({
      totalThreads: parseInt(threadsCount[0].count || 0),
      totalPosts: parseInt(postsCount[0].count || 0),
      threadsToday: parseInt(todayThreads[0].count || 0),
      postsToday: parseInt(todayPosts[0].count || 0),
      siteUsers: estimatedTotalVisitors,
      onlineUsers: currentOnline,
      visitorsToday: todayVisitors
    });
  } catch (error) {
    console.error('Error fetching stats:', error.message);

    // Return fallback stats with current visitor data
    const today = new Date().toDateString();
    const todayVisitors = dailyVisitors.get(today)?.size || 0;
    const currentOnline = visitorSessions.size;

    res.json({
      totalThreads: 0,
      totalPosts: 0,
      threadsToday: 0,
      postsToday: 0,
      siteUsers: Math.max(todayVisitors + 150, 250),
      onlineUsers: currentOnline,
      visitorsToday: todayVisitors,
      error: 'Database temporarily unavailable'
    });
  }
});

// Serve static pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'yokona/public/home.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'yokona/public/home.html'));
});

// Catch-all route for client-side routing
app.get('*', (req, res) => {
  // Don't catch API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }

  // For any other route, serve the home page (client-side routing)
  res.sendFile(path.join(__dirname, 'yokona/public/home.html'));
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully');
  if (hasSupabase) {
    await db.end();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully');
  if (hasSupabase) {
    await db.end();
  }
  process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Production mode: ${isProduction}`);
  console.log(`Database: ${hasSupabase ? 'Supabase PostgreSQL' : 'SQLite'}`);

  if (hasSupabase) {
    console.log('Connected to Supabase PostgreSQL at:', 'db.yxppeiyytciuvzeskukw.supabase.co');
  }

  try {
    await initDB();
    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    if (hasSupabase) {
      console.error('Make sure you have run the init-supabase.sql script in your Supabase SQL editor');
      console.error('Connection details: host=db.yxppeiyytciuvzeskukw.supabase.co, database=postgres');
    }
  }
});
