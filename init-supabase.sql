
-- Supabase Database Initialization Script
-- Run this in your Supabase SQL editor to set up the database schema

-- Create boards table
CREATE TABLE IF NOT EXISTS boards (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create threads table
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
);

-- Create posts table
CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  thread_id INTEGER REFERENCES threads(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  image_data BYTEA,
  image_type VARCHAR(50),
  password_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default boards
INSERT INTO boards (slug, name, description) VALUES 
  ('gen', 'General Discussions', 'General topics and casual conversation'),
  ('pol', 'Politically Incorrect', 'Uncensored political discussions and debate'),
  ('hot', 'Spicy Takes', 'Controversial opinions and hot takes'),
  ('pasta', 'CopyPastas', 'Copy and paste content'),
  ('sch', 'Schizo-posting', 'Schizophrenic rambling and theories'),
  ('db', 'Heated Debates', 'Serious debates and discussions'),
  ('marx', 'Marxism-Leninism', 'Theory and praxis discussions'),
  ('lol', 'Meme Culture', 'Memes and internet culture'),
  ('gr', 'Green-Text', 'Green text stories'),
  ('worm', 'Brainworm', 'Brain worm discussions'),
  ('coal', 'Coal Mine', 'Coal posts and content'),
  ('gem', 'Rare Gem', 'Rare and valuable content')
ON CONFLICT (slug) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_threads_board_slug ON threads(board_slug);
CREATE INDEX IF NOT EXISTS idx_threads_last_bump ON threads(last_bump_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_thread_id ON posts(thread_id);
CREATE INDEX IF NOT EXISTS idx_threads_created_at ON threads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

-- Enable Row Level Security (optional but recommended for Supabase)
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust as needed for your security requirements)
CREATE POLICY "Allow public read access on boards" ON boards FOR SELECT USING (true);
CREATE POLICY "Allow public read access on threads" ON threads FOR SELECT USING (true);
CREATE POLICY "Allow public read access on posts" ON posts FOR SELECT USING (true);

CREATE POLICY "Allow public insert on threads" ON threads FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert on posts" ON posts FOR INSERT WITH CHECK (true);

-- Allow updates and deletes with password verification (handled by your application logic)
CREATE POLICY "Allow conditional updates on threads" ON threads FOR UPDATE USING (true);
CREATE POLICY "Allow conditional deletes on threads" ON threads FOR DELETE USING (true);
CREATE POLICY "Allow conditional updates on posts" ON posts FOR UPDATE USING (true);
CREATE POLICY "Allow conditional deletes on posts" ON posts FOR DELETE USING (true);
