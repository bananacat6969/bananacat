import { getDb, initializeDatabase } from '../setup-db.js';

let dbInitialized = false;

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  const { slug } = req.query;
  console.log(`Threads lookup for board slug: ${slug}`);
  
  try {
    const sql = getDb();
    
    if (!sql) {
      console.log('No database connection');
      return res.status(500).json({ error: 'Database not available' });
    }
    
    // Initialize database if needed
    if (!dbInitialized) {
      await initializeDatabase();
      dbInitialized = true;
    }
    
    const boards = await sql`SELECT * FROM boards WHERE slug = ${slug}`;
    const board = boards[0];
    
    if (!board) {
      console.log(`Board not found for threads slug: ${slug}`);
      return res.status(404).json({ error: `Board '${slug}' not found` });
    }
    
    if (req.method === 'GET') {
      const threads = await sql`
        SELECT * FROM threads 
        WHERE board_id = ${board.id}
        ORDER BY last_bump_at DESC
      `;
      res.status(200).json(threads);
    } else if (req.method === 'POST') {
      // Handle body parsing for Vercel
      let body = req.body;
      if (typeof body === 'string') {
        body = JSON.parse(body);
      }
      
      const { subject, content } = body || {};
      if (!content) {
        return res.status(400).json({ error: 'Content is required' });
      }
      
      // Create thread
      const threadResult = await sql`
        INSERT INTO threads (board_id, subject)
        VALUES (${board.id}, ${subject || null})
        RETURNING *
      `;
      const thread = threadResult[0];
      
      // Create initial post
      const postResult = await sql`
        INSERT INTO posts (thread_id, board_id, content)
        VALUES (${thread.id}, ${board.id}, ${content})
        RETURNING *
      `;
      const post = postResult[0];
      
      res.status(200).json({ thread, post });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database error' });
  }
}