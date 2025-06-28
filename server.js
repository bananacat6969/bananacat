
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Database setup - use PostgreSQL when DATABASE_URL is available, SQLite otherwise
let db;
const hasPostgreSQL = !!process.env.DATABASE_URL;

if (hasPostgreSQL) {
  // PostgreSQL for production
  const { Pool } = require('pg');
  
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 3, // Further reduced for stability
    min: 0, // Allow pool to scale down to 0
    idleTimeoutMillis: 30000, // Longer idle timeout
    connectionTimeoutMillis: 10000, // Increased connection timeout
    acquireTimeoutMillis: 15000, // Longer wait for connection
    allowExitOnIdle: true, // Allow graceful shutdown
    statement_timeout: 10000, // 10 second statement timeout
    query_timeout: 10000, // 10 second query timeout
  });
  
  // Handle pool errors with reconnection
  db.on('error', (err) => {
    console.error('Unexpected error on idle client:', err.message);
    // Don't exit the process, let it recover
  });
  
  db.on('connect', () => {
    console.log('New client connected to the database');
  });
  
  db.on('remove', () => {
    console.log('Client removed from pool');
  });
  
  console.log('Using PostgreSQL database');
} else {
  // SQLite for development (Replit)
  const Database = require('better-sqlite3');
  db = new Database('yokona.db');
  console.log('Using SQLite for development');
}

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

// Database helper functions with improved retry logic
async function query(sql, params = [], retries = 3) {
  if (hasPostgreSQL) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      let client;
      try {
        // Add timeout to connection acquisition
        client = await Promise.race([
          db.connect(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout')), 8000)
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
          throw error;
        }
        
        // Exponential backoff with jitter
        const delay = Math.pow(2, attempt) * 500 + Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } else {
    const stmt = db.prepare(sql);
    if (sql.trim().toLowerCase().startsWith('select')) {
      return stmt.all(...params);
    } else {
      const result = stmt.run(...params);
      return [{ id: result.lastInsertRowid, ...result }];
    }
  }
}

// Initialize database
async function initDB() {
  try {
    if (hasPostgreSQL) {
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
          image_url VARCHAR(500),
          reply_count INTEGER DEFAULT 0,
          views INTEGER DEFAULT 0,
          last_bump_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS posts (
          id SERIAL PRIMARY KEY,
          thread_id INTEGER REFERENCES threads(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          image_url VARCHAR(500),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
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
          image_url TEXT,
          reply_count INTEGER DEFAULT 0,
          views INTEGER DEFAULT 0,
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
          image_url TEXT,
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
      if (hasPostgreSQL) {
        await query(
          'INSERT INTO boards (slug, name, description) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING',
          [board.slug, board.name, board.description]
        );
      } else {
        try {
          db.prepare('INSERT OR IGNORE INTO boards (slug, name, description) VALUES (?, ?, ?)')
            .run(board.slug, board.name, board.description);
        } catch (e) {
          // Ignore if already exists
        }
      }
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// API Routes

// Database health check
app.get('/api/health', async (req, res) => {
  try {
    if (hasPostgreSQL) {
      await query('SELECT 1 as health');
      res.json({ status: 'ok', database: 'postgresql', timestamp: new Date().toISOString() });
    } else {
      await query('SELECT 1 as health');
      res.json({ status: 'ok', database: 'sqlite', timestamp: new Date().toISOString() });
    }
  } catch (error) {
    console.error('Health check failed:', error.message);
    res.status(503).json({ 
      status: 'error', 
      database: hasPostgreSQL ? 'postgresql' : 'sqlite',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get board info
app.get('/api/boards/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const boards = hasPostgreSQL 
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
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const threads = hasPostgreSQL
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

    const count = hasPostgreSQL
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
    const { subject, content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Check if board exists
    const boards = hasPostgreSQL
      ? await query('SELECT * FROM boards WHERE slug = $1', [slug])
      : await query('SELECT * FROM boards WHERE slug = ?', [slug]);
    
    if (boards.length === 0) {
      return res.status(404).json({ error: 'Board not found' });
    }

    // Handle image upload
    let imageUrl = null;
    if (req.file) {
      // For now, convert to base64 data URL since we don't have file storage setup
      const base64 = req.file.buffer.toString('base64');
      imageUrl = `data:${req.file.mimetype};base64,${base64}`;
    }

    const result = hasPostgreSQL
      ? await query(`
          INSERT INTO threads (board_slug, subject, content, image_url)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `, [slug, subject || null, content, imageUrl])
      : await query(`
          INSERT INTO threads (board_slug, subject, content, image_url)
          VALUES (?, ?, ?, ?)
        `, [slug, subject || null, content, imageUrl]);

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
    const threads = hasPostgreSQL
      ? await query('SELECT * FROM threads WHERE id = $1', [id])
      : await query('SELECT * FROM threads WHERE id = ?', [id]);
    
    if (threads.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Get posts
    const posts = hasPostgreSQL
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
    if (hasPostgreSQL) {
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
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Check if thread exists
    const threads = hasPostgreSQL
      ? await query('SELECT * FROM threads WHERE id = $1', [id])
      : await query('SELECT * FROM threads WHERE id = ?', [id]);
    
    if (threads.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    let imageUrl = null;
    if (req.file) {
      // For now, convert to base64 data URL since we don't have file storage setup
      const base64 = req.file.buffer.toString('base64');
      imageUrl = `data:${req.file.mimetype};base64,${base64}`;
    }

    // Create post
    const postResult = hasPostgreSQL
      ? await query(`
          INSERT INTO posts (thread_id, content, image_url)
          VALUES ($1, $2, $3)
          RETURNING *
        `, [id, content, imageUrl])
      : await query(`
          INSERT INTO posts (thread_id, content, image_url)
          VALUES (?, ?, ?)
        `, [id, content, imageUrl]);

    // Update thread reply count and bump time
    if (hasPostgreSQL) {
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
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const countResult = hasPostgreSQL
      ? await query(`SELECT COUNT(*) as total FROM threads`)
      : await query(`SELECT COUNT(*) as total FROM threads`);
    
    const total = countResult[0].total || countResult[0].count || 0;
    const totalPages = Math.ceil(total / limit);

    const result = hasPostgreSQL
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

// Get site statistics
app.get('/api/stats', async (req, res) => {
  try {
    const threadsCount = hasPostgreSQL
      ? await query('SELECT COUNT(*) as count FROM threads')
      : await query('SELECT COUNT(*) as count FROM threads');
    
    const postsCount = hasPostgreSQL
      ? await query('SELECT COUNT(*) as count FROM posts')
      : await query('SELECT COUNT(*) as count FROM posts');
    
    const todayThreads = hasPostgreSQL
      ? await query(`SELECT COUNT(*) as count FROM threads WHERE created_at >= CURRENT_DATE`)
      : await query(`SELECT COUNT(*) as count FROM threads WHERE created_at >= date('now')`);
    
    const todayPosts = hasPostgreSQL
      ? await query(`SELECT COUNT(*) as count FROM posts WHERE created_at >= CURRENT_DATE`)
      : await query(`SELECT COUNT(*) as count FROM posts WHERE created_at >= date('now')`);

    res.json({
      totalThreads: parseInt(threadsCount[0].count || 0),
      totalPosts: parseInt(postsCount[0].count || 0),
      threadsToday: parseInt(todayThreads[0].count || 0),
      postsToday: parseInt(todayPosts[0].count || 0),
      siteUsers: Math.floor(Math.random() * 5000) + 2500 // Mock unique users count
    });
  } catch (error) {
    console.error('Error fetching stats:', error.message);
    
    // Return default stats instead of error
    res.json({
      totalThreads: 0,
      totalPosts: 0,
      threadsToday: 0,
      postsToday: 0,
      siteUsers: 2500,
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
  if (hasPostgreSQL) {
    await db.end();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully');
  if (hasPostgreSQL) {
    await db.end();
  }
  process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database: ${hasPostgreSQL ? 'PostgreSQL' : 'SQLite'}`);
  
  if (hasPostgreSQL) {
    console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);
  }
  
  try {
    await initDB();
  } catch (error) {
    console.error('Failed to initialize database:', error);
    if (hasPostgreSQL) {
      console.error('Make sure DATABASE_URL is set and PostgreSQL database is accessible');
    }
  }
});
