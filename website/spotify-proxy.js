/**
 * Local Spotify proxy for development.
 * Run: node spotify-proxy.js
 * Serves on http://localhost:3002/api/spotify
 */

const http = require('http');
const https = require('https');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error('Missing required env vars: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN');
  process.exit(1);
}

function fetchJSON(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (!data || res.statusCode === 204) {
          resolve({ status: res.statusCode, body: null });
        } else {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: null }); }
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  if (req.url !== '/api/spotify') {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  try {
    // 1. Refresh access token
    const tokenRes = await fetchJSON({
      hostname: 'accounts.spotify.com',
      path: '/api/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      },
    }, `grant_type=refresh_token&refresh_token=${REFRESH_TOKEN}`);

    if (!tokenRes.body.access_token) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Token refresh failed', details: tokenRes.body }));
      return;
    }

    const auth = { 'Authorization': `Bearer ${tokenRes.body.access_token}` };

    // 2. Try currently playing
    const nowRes = await fetchJSON({
      hostname: 'api.spotify.com',
      path: '/v1/me/player/currently-playing',
      headers: auth,
    });

    let nowPlaying = null;
    if (nowRes.status === 200 && nowRes.body && nowRes.body.is_playing && nowRes.body.item) {
      nowPlaying = { item: nowRes.body.item, is_playing: true };
    }

    // 3. Get recently played
    const recentRes = await fetchJSON({
      hostname: 'api.spotify.com',
      path: '/v1/me/player/recently-played?limit=6',
      headers: auth,
    });

    // 4. Get playlist "#1"
    const PLAYLIST_ID = '02f4rDPLarhAIRHcITsYQG';
    let playlistTracks = [];
    let playlistName = '#1';
    const plRes = await fetchJSON({
      hostname: 'api.spotify.com',
      path: `/v1/playlists/${PLAYLIST_ID}`,
      headers: auth,
    });
    if (plRes.body) {
      playlistName = plRes.body.name || '#1';
      const items = plRes.body.items?.items || plRes.body.items || [];
      // items can be array directly or {items: [...]}
      const trackList = Array.isArray(items) ? items : (items.items || []);
      playlistTracks = trackList.slice(0, 8);
    }

    res.writeHead(200);
    res.end(JSON.stringify({
      now_playing: nowPlaying,
      recently_played: (recentRes.body && recentRes.body.items) || [],
      playlist: {
        name: playlistName,
        tracks: playlistTracks,
      },
    }));

  } catch (err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(3003, () => {
  console.log('Spotify proxy running at http://localhost:3003/api/spotify');
});
