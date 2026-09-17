import { Redis } from '@upstash/redis';

// Vercel's Redis marketplace integration may inject either naming convention
// depending on how it was connected, so we check both.
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
});

// Password required to READ the letters. Writing is open to anyone.
const READ_PASSWORD = '120403';
const STORAGE_KEY = 'minny_guestbook_letters';
const MAX_AUTHOR_LEN = 60;
const MAX_MESSAGE_LEN = 5000;
const MAX_LETTERS = 500; // safety cap so storage can't grow unbounded

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const password = (req.query.password || '').toString();
    if (password !== READ_PASSWORD) {
      return res.status(401).json({ error: 'Incorrect password' });
    }
    try {
      const letters = (await redis.get(STORAGE_KEY)) || [];
      // newest first
      const sorted = [...letters].sort((a, b) => new Date(b.date) - new Date(a.date));
      return res.status(200).json({ letters: sorted });
    } catch (err) {
      return res.status(500).json({ error: 'Could not load letters' });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const author = (body.author || '').toString().trim().slice(0, MAX_AUTHOR_LEN);
      const message = (body.message || '').toString().trim().slice(0, MAX_MESSAGE_LEN);

      if (!author || !message) {
        return res.status(400).json({ error: 'Please include your name and a message.' });
      }

      const letters = (await redis.get(STORAGE_KEY)) || [];
      letters.push({
        author,
        message,
        date: new Date().toISOString()
      });

      // keep only the most recent MAX_LETTERS to avoid unbounded growth
      const trimmed = letters.slice(-MAX_LETTERS);

      await redis.set(STORAGE_KEY, trimmed);
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: 'Could not save your letter' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}

