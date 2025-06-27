// api/proxy.js (Node.js with Express)
require('dotenv').config()
const express = require('express')
const { createClient } = require('@supabase/supabase-js')

const app = express()
app.use(express.json())

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// Proxy endpoint to get threads
app.get('/api/threads/:board', async (req, res) => {
  const { board } = req.params
  const page = parseInt(req.query.page) || 1
  const perPage = parseInt(req.query.perPage) || 10
  const from = (page - 1) * perPage

  try {
    const { data, error, count } = await supabase
      .from('threads')
      .select('*', { count: 'exact' })
      .eq('board', board)
      .order('created_at', { ascending: false })
      .range(from, from + perPage - 1)

    if (error) throw error
    res.json({ data, total: count })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Proxy endpoint to create a thread
app.post('/api/threads/:board', async (req, res) => {
  const { board } = req.params
  const threadData = req.body

  try {
    const { data, error } = await supabase
      .from('threads')
      .insert([{ ...threadData, board }])

    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Proxy server running on port ${PORT}`))