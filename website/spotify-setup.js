/**
 * Spotify Refresh Token Setup
 *
 * Run this once to get your refresh token:
 *   node spotify-setup.js <CLIENT_ID> <CLIENT_SECRET>
 *
 * Then open http://127.0.0.1:8888/login in your browser.
 *
 * In your Spotify app dashboard, set the redirect URI to:
 *   http://127.0.0.1:8888/callback
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const CLIENT_ID = process.argv[2];
const CLIENT_SECRET = process.argv[3];
const REDIRECT_URI = 'http://127.0.0.1:8888/callback';
const SCOPES = 'user-read-currently-playing user-read-recently-played playlist-read-private playlist-read-collaborative';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\nUsage: node spotify-setup.js <CLIENT_ID> <CLIENT_SECRET>\n');
  console.error('Get these from https://developer.spotify.com/dashboard');
  console.error('Set redirect URI to: http://127.0.0.1:8888/callback\n');
  process.exit(1);
}

function httpsRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:8888');

  if (url.pathname === '/login') {
    const authUrl = `https://accounts.spotify.com/authorize?` +
      `client_id=${CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(SCOPES)}`;
    res.writeHead(302, { Location: authUrl });
    res.end();
    return;
  }

  if (url.pathname === '/callback') {
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400);
      res.end('No code received');
      return;
    }

    const postData = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }).toString();

    const tokenData = await httpsRequest({
      hostname: 'accounts.spotify.com',
      path: '/api/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      },
    }, postData);

    if (tokenData.refresh_token) {
      console.log('\n========================================');
      console.log('  SPOTIFY REFRESH TOKEN (save this!)');
      console.log('========================================');
      console.log(tokenData.refresh_token);
      console.log('========================================\n');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html><body style="font-family:monospace;background:#111;color:#0f0;padding:2rem;">
          <h2>Success!</h2>
          <p>Your refresh token has been printed in the terminal.</p>
          <p>You can close this window and stop the server (Ctrl+C).</p>
        </body></html>
      `);

      setTimeout(() => {
        console.log('You can now stop this server (Ctrl+C).');
        console.log('Next: add the refresh token to your api/spotify.js proxy.\n');
      }, 500);
    } else {
      console.error('Error:', tokenData);
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`
        <html><body style="font-family:monospace;background:#111;color:#f44;padding:2rem;">
          <h2>Token exchange failed</h2>
          <pre>${JSON.stringify(tokenData, null, 2)}</pre>
        </body></html>
      `);
    }
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <html><body style="font-family:monospace;background:#111;color:#0f0;padding:2rem;">
      <h2>Spotify Auth Setup</h2>
      <a href="/login" style="color:#0ff;font-size:1.5rem;">Click here to authorize</a>
    </body></html>
  `);
});

server.listen(8888, '127.0.0.1', () => {
  console.log('\nSpotify Auth Server running!');
  console.log('Open http://127.0.0.1:8888/login in your browser.\n');
});
