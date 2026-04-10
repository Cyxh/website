/**
 * Spotify Proxy — Vercel Serverless Function
 *
 * Refreshes the access token and returns recently played tracks.
 *
 * Deploy to Vercel, then set these environment variables in your
 * Vercel project settings (Settings > Environment Variables):
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 *   SPOTIFY_REFRESH_TOKEN  (from running spotify-setup.js)
 */

export default async function handler(req, res) {
  // CORS headers so your frontend can call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env;

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
    return res.status(500).json({ error: 'Missing Spotify environment variables' });
  }

  try {
    // 1. Get a fresh access token
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: SPOTIFY_REFRESH_TOKEN,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(500).json({ error: 'Token refresh failed', details: tokenData });
    }

    const accessToken = tokenData.access_token;
    const headers = { 'Authorization': `Bearer ${accessToken}` };

    // 2. Try "currently playing" first
    const nowRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers });

    if (nowRes.status === 200) {
      const nowData = await nowRes.json();
      if (nowData.is_playing && nowData.item) {
        // Return currently playing + recently played for more tracks
        const recentRes = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=5', { headers });
        const recentData = recentRes.ok ? await recentRes.json() : { items: [] };

        return res.status(200).json({
          now_playing: {
            item: nowData.item,
            is_playing: true,
          },
          recently_played: recentData.items || [],
        });
      }
    }

    // 3. Fall back to recently played
    const recentRes = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=6', { headers });
    const recentData = await recentRes.json();

    return res.status(200).json({
      now_playing: null,
      recently_played: recentData.items || [],
    });

  } catch (err) {
    return res.status(500).json({ error: 'Proxy error', message: err.message });
  }
}
