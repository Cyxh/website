/* ============================================
   PLAYER ONE // PORTFOLIO - INTERACTIVE ENGINE
   ============================================ */

// ==========================================
// BOOT SEQUENCE
// ==========================================
const bootLines = [
  { text: 'Loading',                                        style: 'dim' },
  { text: '' },
  { text: 'Loading assets',                               style: 'default' },
  { text: 'Mounting interfaces',                          style: 'default' },
  { text: 'Connecting services',                          style: 'default' },
  { text: '' },
  { text: 'Ready.',                                       style: 'success' },
];

let bootIndex = 0;
let bootDone = false;
const bootLinesEl = document.getElementById('boot-lines');
const bootProgressBar = document.getElementById('boot-progress-bar');
const bootPrompt = document.getElementById('boot-prompt');
const bootScreen = document.getElementById('boot-screen');
const mainMenu = document.getElementById('main-menu');

function typeBootLine() {
  if (bootIndex >= bootLines.length) {
    bootProgressBar.style.width = '100%';
    setTimeout(() => {
      bootPrompt.classList.add('visible');
      bootDone = true;
    }, 200);
    return;
  }

  const entry = bootLines[bootIndex];
  const text = entry.text || '';
  const style = entry.style || 'default';
  const line = document.createElement('div');
  line.className = 'boot-line boot-style-' + style;
  line.style.opacity = '0';
  bootLinesEl.appendChild(line);

  // Update progress
  const progress = ((bootIndex + 1) / bootLines.length) * 100;
  bootProgressBar.style.width = progress + '%';

  if (text === '') {
    line.innerHTML = '&nbsp;';
    line.style.opacity = '1';
    bootIndex++;
    setTimeout(typeBootLine, 30);
  } else if (style === 'header') {
    // Headers type out character by character (fast)
    let charIndex = 0;
    function typeChar() {
      if (charIndex < text.length) {
        line.textContent += text[charIndex];
        line.style.opacity = '1';
        charIndex++;
        setTimeout(typeChar, Math.random() * 8 + 4);
      } else {
        bootIndex++;
        setTimeout(typeBootLine, 40);
      }
    }
    typeChar();
  } else {
    // All other lines appear instantly with a stagger
    line.textContent = text;
    line.style.opacity = '1';
    line.classList.add('boot-line-flash');
    bootIndex++;
    setTimeout(typeBootLine, Math.random() * 40 + 25);
  }
}

function dismissBoot() {
  if (!bootDone) return;
  bootScreen.classList.add('fade-out');
  mainMenu.classList.remove('hidden');
  setTimeout(() => {
    bootScreen.style.display = 'none';
    initMainContent();
  }, 800);
}

// Start boot
setTimeout(typeBootLine, 200);

// Listen for any key / click to dismiss
document.addEventListener('keydown', function bootKey(e) {
  if (bootDone) {
    dismissBoot();
    document.removeEventListener('keydown', bootKey);
  }
});

document.addEventListener('click', function bootClick(e) {
  if (bootDone && bootScreen.style.display !== 'none') {
    dismissBoot();
    document.removeEventListener('click', bootClick);
  }
});

// ==========================================
// API CONFIGURATION
// ==========================================
// Spotify: requires a proxy that handles the OAuth refresh token flow.
//   1. Create a Spotify app at https://developer.spotify.com/dashboard
//   2. Deploy a small proxy (e.g. Vercel serverless function) that:
//      - Stores your client_id, client_secret, and refresh_token
//      - Calls POST https://accounts.spotify.com/api/token to get an access token
//      - Calls GET https://api.spotify.com/v1/me/player/recently-played?limit=6
//      - Returns the JSON response
//   3. Set SPOTIFY_PROXY_URL to your deployed proxy endpoint
const SPOTIFY_PROXY_URL = '/api/spotify';

// YouTube: uses the public Data API v3 (no OAuth needed for public videos).
//   1. Get an API key at https://console.cloud.google.com (enable YouTube Data API v3)
//   2. Find your channel ID from your YouTube channel page URL
//   3. Set them in config.js (see config.example.js)
//   4. Restrict the API key to your domain in Google Cloud Console
const YOUTUBE_API_KEY = (window.SITE_CONFIG && window.SITE_CONFIG.YOUTUBE_API_KEY) || '';
const YOUTUBE_CHANNEL_ID = (window.SITE_CONFIG && window.SITE_CONFIG.YOUTUBE_CHANNEL_ID) || '';

// Gaming proxy (Steam + Riot)
const GAMING_PROXY_URL = '/api/gaming';

// Champion ID -> name mapping (Data Dragon)
const CHAMPION_NAMES = {};
let championDataLoaded = false;
async function loadChampionData() {
  try {
    const res = await fetch('https://ddragon.leagueoflegends.com/cdn/14.8.1/data/en_US/champion.json');
    const data = await res.json();
    Object.values(data.data).forEach(c => {
      CHAMPION_NAMES[parseInt(c.key)] = c.id;
    });
    championDataLoaded = true;
  } catch (e) {
    console.warn('Failed to load champion data:', e);
  }
}

function getChampionImageUrl(championIdOrName) {
  const name = typeof championIdOrName === 'number'
    ? (CHAMPION_NAMES[championIdOrName] || 'Unknown')
    : championIdOrName;
  return `https://ddragon.leagueoflegends.com/cdn/14.8.1/img/champion/${name}.png`;
}

// ==========================================
// SPOTIFY INTEGRATION
// ==========================================
async function fetchSpotifyTracks() {
  if (!SPOTIFY_PROXY_URL) return null;
  try {
    const res = await fetch(SPOTIFY_PROXY_URL);
    if (!res.ok) return null;
    const data = await res.json();

    function parseTrack(track, isNowPlaying) {
      return {
        name: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        albumArt: track.album.images[0]?.url,
        url: track.external_urls.spotify,
        nowPlaying: isNowPlaying || false
      };
    }

    const tracks = [];

    // Proxy returns { now_playing, recently_played }
    if (data.now_playing && data.now_playing.item) {
      tracks.push(parseTrack(data.now_playing.item, data.now_playing.is_playing));
    }
    if (data.recently_played) {
      data.recently_played.forEach(item => tracks.push(parseTrack(item.track, false)));
    }

    // Also handle raw Spotify API formats (direct endpoint calls)
    if (data.items) {
      data.items.forEach(item => tracks.push(parseTrack(item.track, false)));
    } else if (data.item && !data.now_playing) {
      tracks.push(parseTrack(data.item, data.is_playing));
    }

    return { tracks: tracks.length ? tracks : null, playlist: data.playlist || null };
  } catch (e) {
    console.warn('Spotify fetch failed:', e);
    return { tracks: null, playlist: null };
  }
}

function getContentWidth() {
  return Math.min(window.innerWidth, 1400) - 120;
}

function getMaxVinyls() {
  const vinylWidth = 210; // ~200px width + gap
  return Math.max(2, Math.floor(getContentWidth() / vinylWidth));
}

function getMaxSteamCards() {
  const profileCardWidth = 260;
  const gameCardWidth = 256; // 240 + gap
  return Math.max(1, Math.floor((getContentWidth() - profileCardWidth) / gameCardWidth));
}

// Re-render on resize
let _playlistCache = null;
let _recentCache = null;
let _steamCache = null;
let _resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    _isResizing = true;
    if (_playlistCache) renderPlaylistTracks(_playlistCache);
    if (_recentCache) renderSpotifyTracks(_recentCache);
    if (_steamCache) renderSteamData(_steamCache);
    _isResizing = false;
  }, 200);
});

let _isResizing = false;

function renderVinylRow(container, tracks, accents) {
  const max = getMaxVinyls();
  const cls = _isResizing ? 'rec-vinyl reveal visible' : 'rec-vinyl reveal';
  container.innerHTML = tracks.slice(0, max).map((track, i) => `
    <a class="${cls}" href="${track.url}" target="_blank" rel="noopener">
      <div class="vinyl-sleeve">
        <div class="vinyl-cover" style="--accent: ${accents[i % accents.length]};">
          ${track.albumArt
            ? `<img class="vinyl-art-img" src="${track.albumArt}" alt="${track.album}">`
            : `<div class="vinyl-art">${String(i + 1).padStart(2, '0')}</div>`
          }
        </div>
        <div class="vinyl-disc">
          <div class="vinyl-label"></div>
        </div>
      </div>
      <div class="vinyl-info">
        <h4>${track.name}</h4>
        <p>${track.artist}</p>
      </div>
    </a>
  `).join('');
}

function renderPlaylistTracks(playlistData) {
  const container = document.getElementById('playlist-tracks');
  if (!container) return;
  if (playlistData) _playlistCache = playlistData;

  if (!playlistData || !playlistData.tracks || playlistData.tracks.length === 0) {
    container.innerHTML = '<div class="spotify-empty">No playlist tracks available</div>';
    return;
  }

  const tracks = playlistData.tracks
    .filter(item => item.track || item.item)
    .map(item => {
      const t = item.track || item.item;
      return {
        name: t.name,
        artist: t.artists.map(a => a.name).join(', '),
        album: t.album.name,
        albumArt: t.album.images[0]?.url,
        url: t.external_urls.spotify,
      };
    });

  const accents = ['#8338ec', '#06d6a0', '#ff006e', '#3a86ff', '#fb5607', '#ffbe0b'];
  renderVinylRow(container, tracks, accents);
}

function renderSpotifyTracks(tracks) {
  const container = document.getElementById('spotify-tracks');
  const label = document.getElementById('spotify-label');
  const badge = document.getElementById('spotify-badge');
  if (!container) return;
  if (tracks) _recentCache = tracks;

  if (!tracks || tracks.length === 0) {
    container.innerHTML = '<div class="spotify-empty">No tracks available</div>';
    return;
  }

  // Update label if currently playing
  if (tracks[0].nowPlaying) {
    label.textContent = 'NOW PLAYING';
    badge.textContent = 'LIVE';
    badge.classList.add('live');
  }

  // Deduplicate by track name
  const seen = new Set();
  const unique = tracks.filter(t => {
    if (seen.has(t.name)) return false;
    seen.add(t.name);
    return true;
  });

  const accents = ['#ff006e', '#3a86ff', '#8338ec', '#06d6a0', '#fb5607', '#ffbe0b'];
  renderVinylRow(container, unique, accents);
}

// ==========================================
// YOUTUBE INTEGRATION
// ==========================================
async function fetchYouTubeVideos() {
  if (!YOUTUBE_API_KEY || !YOUTUBE_CHANNEL_ID) return null;
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${YOUTUBE_CHANNEL_ID}&maxResults=6&order=date&type=video&key=${YOUTUBE_API_KEY}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.items || []).map(item => ({
      id: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
      description: item.snippet.description,
      date: item.snippet.publishedAt
    }));
  } catch (e) {
    console.warn('YouTube fetch failed:', e);
    return null;
  }
}

function renderYouTubeVideos(videos) {
  const container = document.getElementById('filmstrip-frames');
  if (!container) return;

  if (!videos || videos.length === 0) {
    // Fallback placeholder frames
    container.innerHTML = Array.from({ length: 3 }, (_, i) => `
      <div class="film-frame" data-project="${i + 1}">
        <div class="frame-content">
          <div class="frame-thumbnail">
            <div class="frame-placeholder">
              <span class="frame-icon">&#9654;</span>
            </div>
          </div>
          <div class="frame-info">
            <span class="frame-number">${String(i + 1).padStart(3, '0')}</span>
            <h3>Coming Soon</h3>
            <p>YouTube integration &mdash; configure API key to load videos.</p>
            <div class="frame-tags"><span class="tag">YouTube</span></div>
          </div>
        </div>
      </div>
    `).join('');
    return;
  }

  container.innerHTML = videos.map((video, i) => `
    <div class="film-frame" data-project="${i + 1}">
      <a class="frame-content frame-link" href="https://www.youtube.com/watch?v=${video.id}" target="_blank" rel="noopener">
        <div class="frame-thumbnail">
          <img class="frame-thumb-img" src="${video.thumbnail}" alt="${video.title}">
        </div>
        <div class="frame-info">
          <span class="frame-number">${String(i + 1).padStart(3, '0')}</span>
          <h3>${video.title}</h3>
          <p>${video.description.length > 100 ? video.description.substring(0, 100) + '...' : video.description}</p>
          <div class="frame-tags">
            <span class="tag">YouTube</span>
          </div>
        </div>
      </a>
    </div>
  `).join('');
}

// ==========================================
// GAMING INTEGRATION (Riot + Steam)
// ==========================================
async function fetchGamingData() {
  if (!GAMING_PROXY_URL) return null;
  try {
    const res = await fetch(GAMING_PROXY_URL);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('Gaming fetch failed:', e);
    return null;
  }
}

function formatPlaytime(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 1000) return `${hours}h`;
  return `${(hours / 1000).toFixed(1)}k hrs`;
}

function renderRiotData(riot) {
  const container = document.getElementById('riot-cards');
  const badge = document.getElementById('riot-badge');
  if (!container) return;

  if (!riot || (!riot.lol && !riot.account)) {
    container.innerHTML = '<div class="spotify-empty">Riot API key expired &mdash; dev keys refresh every 24h</div>';
    return;
  }

  if (riot.account) {
    badge.textContent = `${riot.account.gameName}#${riot.account.tagLine}`;
    badge.classList.add('active');
  }

  let html = '';

  // League of Legends section
  if (riot.lol) {
    const lol = riot.lol;

    // Ranked card(s)
    const soloQ = lol.ranked?.RANKED_SOLO_5x5;
    const flex = lol.ranked?.RANKED_FLEX_SR;

    const totalPoints = lol.totalMasteryPoints ? (lol.totalMasteryPoints / 1000000).toFixed(1) + 'M' : '0';

    if (soloQ || flex) {
      const q = soloQ || flex;
      const queueName = soloQ ? 'Solo/Duo' : 'Flex';
      const winrate = ((q.wins / (q.wins + q.losses)) * 100).toFixed(0);
      html += `
        <div class="game-card ranked-card reveal">
          <div class="game-card-header">
            <img class="game-card-icon rank-icon" src="https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${q.tier.toLowerCase()}.png" alt="${q.tier}">
            <div class="game-card-titles">
              <h4>League of Legends</h4>
              <span class="game-card-sub">${queueName} &middot; Level ${lol.summonerLevel}</span>
            </div>
          </div>
          <div class="game-card-rank">
            <span class="rank-tier">${q.tier} ${q.rank}</span>
            <span class="rank-lp">${q.lp} LP</span>
          </div>
          <div class="game-card-stats">
            <span class="stat-win">${q.wins}W</span>
            <span class="stat-loss">${q.losses}L</span>
            <span class="stat-wr">${winrate}% WR</span>
          </div>
          <div class="lol-meta-stats">
            <div class="lol-meta"><span class="lol-meta-val">${lol.championsPlayed || 0}</span><span class="lol-meta-label">Champs</span></div>
            <div class="lol-meta"><span class="lol-meta-val">${lol.masteryScore || 0}</span><span class="lol-meta-label">Mastery</span></div>
            <div class="lol-meta"><span class="lol-meta-val">${totalPoints}</span><span class="lol-meta-label">Points</span></div>
          </div>
        </div>`;
    } else {
      // Unranked — fill the card with mastery + champion stats + recent record
      const recentWins = lol.recentMatches ? lol.recentMatches.filter(m => m.win).length : 0;
      const recentTotal = lol.recentMatches ? lol.recentMatches.length : 0;
      const recentWR = recentTotal > 0 ? ((recentWins / recentTotal) * 100).toFixed(0) : 0;
      html += `
        <div class="game-card ranked-card reveal">
          <div class="game-card-header">
            <div class="game-card-icon lol-icon">LoL</div>
            <div class="game-card-titles">
              <h4>League of Legends</h4>
              <span class="game-card-sub">Level ${lol.summonerLevel}</span>
            </div>
          </div>
          <div class="lol-overview-stats">
            <div class="lol-overview-stat">
              <span class="lol-overview-val">${lol.championsPlayed || 0}</span>
              <span class="lol-overview-label">Champions</span>
            </div>
            <div class="lol-overview-stat">
              <span class="lol-overview-val">${lol.masteryScore || 0}</span>
              <span class="lol-overview-label">Mastery</span>
            </div>
            <div class="lol-overview-stat">
              <span class="lol-overview-val">${totalPoints}</span>
              <span class="lol-overview-label">Total Points</span>
            </div>
          </div>
          <div class="lol-recent-record">
            <span class="stat-win">${recentWins}W</span>
            <span class="stat-loss">${recentTotal - recentWins}L</span>
            <span class="lol-recent-wr">${recentWR}% WR</span>
            <span class="lol-recent-label">last ${recentTotal} games</span>
          </div>
        </div>`;
    }

    // Top champions
    if (lol.topChampions && lol.topChampions.length > 0) {
      html += `<div class="game-card champions-card reveal">
        <div class="game-card-header">
          <div class="game-card-icon champ-icon">&#9733;</div>
          <div class="game-card-titles">
            <h4>Top Champions</h4>
            <span class="game-card-sub">By mastery</span>
          </div>
        </div>
        <div class="champion-list">`;

      lol.topChampions.forEach(c => {
        const champName = CHAMPION_NAMES[c.championId] || `Champ ${c.championId}`;
        const pointsK = (c.points / 1000).toFixed(0) + 'k';
        html += `
          <div class="champion-row">
            <img class="champion-img" src="${getChampionImageUrl(c.championId)}" alt="${champName}">
            <span class="champion-name">${champName}</span>
            <span class="champion-mastery">M${c.level}</span>
            <span class="champion-points">${pointsK}</span>
          </div>`;
      });

      html += `</div></div>`;
    }

    // Recent matches
    if (lol.recentMatches && lol.recentMatches.length > 0) {
      const wins = lol.recentMatches.filter(m => m.win).length;
      const losses = lol.recentMatches.length - wins;
      const avgKills = (lol.recentMatches.reduce((s, m) => s + m.kills, 0) / lol.recentMatches.length).toFixed(1);
      const avgDeaths = (lol.recentMatches.reduce((s, m) => s + m.deaths, 0) / lol.recentMatches.length).toFixed(1);
      const avgAssists = (lol.recentMatches.reduce((s, m) => s + m.assists, 0) / lol.recentMatches.length).toFixed(1);

      html += `<div class="game-card matches-card reveal">
        <div class="game-card-header">
          <div class="game-card-icon match-icon">&#9876;</div>
          <div class="game-card-titles">
            <h4>Recent Matches</h4>
            <span class="game-card-sub">Last ${lol.recentMatches.length} games</span>
          </div>
        </div>
        <div class="match-summary">
          <div class="match-summary-record">
            <span class="stat-win">${wins}W</span>
            <span class="stat-loss">${losses}L</span>
          </div>
          <div class="match-summary-kda">
            <span class="match-summary-val">${avgKills} / ${avgDeaths} / ${avgAssists}</span>
            <span class="match-summary-label">Avg KDA</span>
          </div>
        </div>
        <div class="match-list">`;

      lol.recentMatches.forEach(m => {
        const kda = `${m.kills}/${m.deaths}/${m.assists}`;
        const kdaRatio = m.deaths === 0 ? 'Perfect' : ((m.kills + m.assists) / m.deaths).toFixed(1);
        const duration = Math.floor(m.gameDuration / 60) + 'm';
        const cs = m.cs || 0;
        const csPerMin = m.gameDuration > 0 ? (cs / (m.gameDuration / 60)).toFixed(1) : '0';
        html += `
          <div class="match-row ${m.win ? 'win' : 'loss'}">
            <img class="match-champ-img" src="${getChampionImageUrl(m.champion)}" alt="${m.champion}">
            <span class="match-champ">${m.champion}</span>
            <span class="match-kda">${kda}</span>
            <span class="match-kda-ratio">${kdaRatio} KDA</span>
            <span class="match-cs">${cs} CS</span>
            <span class="match-result">${m.win ? 'WIN' : 'LOSS'}</span>
            <span class="match-duration">${duration}</span>
          </div>`;
      });

      html += `</div></div>`;
    }
  }

  // Valorant card (static — no API needed)
  html += `
    <div class="game-card val-card reveal">
      <div class="game-card-header">
        <div class="game-card-icon val-icon">VAL</div>
        <div class="game-card-titles">
          <h4>Valorant</h4>
          <span class="game-card-sub">Cyxh#thao</span>
        </div>
      </div>
      <div class="game-card-rank">
        <span class="rank-tier">Ascendant 2</span>
        <span class="rank-lp">Peak</span>
      </div>
    </div>`;

  container.innerHTML = html || '<div class="spotify-empty">No Riot data available</div>';
}

function renderSteamData(steam) {
  const container = document.getElementById('steam-cards');
  const badge = document.getElementById('steam-badge');
  if (!container) return;

  if (!steam || !steam.profile) {
    container.innerHTML = '<div class="spotify-empty">Could not load Steam data</div>';
    return;
  }
  _steamCache = steam;

  badge.textContent = steam.profile.status;
  badge.classList.add('active');
  if (steam.profile.status === 'Online') badge.classList.add('live');

  // Build all games list: recent first, then top by playtime (deduped)
  const allGames = [];
  if (steam.recentGames) {
    steam.recentGames.forEach(g => allGames.push({ ...g, isRecent: true }));
  }
  if (steam.topGames) {
    const recentIds = new Set((steam.recentGames || []).map(g => g.appid));
    steam.topGames.filter(g => !recentIds.has(g.appid)).forEach(g => allGames.push(g));
  }

  const maxGames = getMaxSteamCards();

  const totalHours = steam.totalPlaytime ? Math.floor(steam.totalPlaytime / 60) : 0;

  let html = `
    <a class="game-card steam-profile-card reveal${_isResizing ? ' visible' : ''}" href="${steam.profile.profileUrl}" target="_blank" rel="noopener">
      <div class="game-card-header">
        <img class="game-card-icon steam-avatar" src="${steam.profile.avatar}" alt="${steam.profile.name}">
        <div class="game-card-titles">
          <h4>${steam.profile.name}</h4>
          <span class="game-card-sub">${steam.profile.status}</span>
        </div>
      </div>
      <div class="steam-profile-stats">
        <div class="steam-profile-stat">
          <span class="steam-profile-val">${steam.ownedCount}</span>
          <span class="steam-profile-label">Games</span>
        </div>
        <div class="steam-profile-stat">
          <span class="steam-profile-val">${totalHours.toLocaleString()}</span>
          <span class="steam-profile-label">Hours</span>
        </div>
      </div>
    </a>`;

  allGames.slice(0, maxGames).forEach(g => {
    const recent = g.isRecent ? formatPlaytime(g.playtime2Weeks || 0) : null;
    const total = formatPlaytime(g.playtimeForever || 0);
    html += `
      <div class="game-card steam-game-card reveal${_isResizing ? ' visible' : ''}">
        <img class="steam-game-header" src="${g.header}" alt="${g.name}">
        <div class="steam-game-info">
          <h4>${g.name}</h4>
          <div class="steam-game-time">
            ${recent ? `<span>${recent} recent</span>` : ''}
            <span class="steam-total">${total} total</span>
          </div>
        </div>
      </div>`;
  });

  container.innerHTML = html;
}

async function initLiveData() {
  // Load champion data first, then fetch everything in parallel
  await loadChampionData();

  const [spotifyData, youtubeVideos, gamingData] = await Promise.all([
    fetchSpotifyTracks(),
    fetchYouTubeVideos(),
    fetchGamingData(),
  ]);
  renderPlaylistTracks(spotifyData.playlist);
  renderSpotifyTracks(spotifyData.tracks);
  renderYouTubeVideos(youtubeVideos);

  if (gamingData) {
    renderRiotData(gamingData.riot);
    renderSteamData(gamingData.steam);
  } else {
    renderRiotData(null);
    renderSteamData(null);
  }

  // Re-run scroll reveal on new dynamic elements
  document.querySelectorAll('#spotify-tracks .rec-vinyl, #filmstrip-frames .film-frame, .game-card').forEach(el => {
    el.classList.add('reveal');
  });
  initScrollReveal();
}

// ==========================================
// SCROLL TOOLTIP (dismiss on input)
// ==========================================
function initScrollTooltip() {
  const overlay = document.getElementById('scroll-overlay');
  if (!overlay) return;

  // Only show on first visit
  if (localStorage.getItem('visited')) {
    return;
  }
  overlay.style.display = '';

  function dismiss() {
    overlay.classList.add('dismissed');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
    localStorage.setItem('visited', '1');
    window.removeEventListener('scroll', dismiss);
    window.removeEventListener('keydown', dismiss);
    window.removeEventListener('mousedown', dismiss);
    window.removeEventListener('touchstart', dismiss);
    window.removeEventListener('wheel', dismiss);
  }
  // Delay attaching listeners so the boot-dismiss input doesn't immediately trigger
  setTimeout(() => {
    window.addEventListener('scroll', dismiss);
    window.addEventListener('keydown', dismiss);
    window.addEventListener('mousedown', dismiss);
    window.addEventListener('touchstart', dismiss);
    window.addEventListener('wheel', dismiss);
  }, 100);
}

// ==========================================
// PARTICLE SYSTEM
// ==========================================
const particleCanvas = document.getElementById('particles');
const pCtx = particleCanvas.getContext('2d');
let particles = [];
let mouse = { x: -9999, y: -9999 };
const mouseRadius = 180;

document.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});
document.addEventListener('mouseleave', () => {
  mouse.x = -9999;
  mouse.y = -9999;
});

function resizeParticleCanvas() {
  particleCanvas.width = window.innerWidth;
  particleCanvas.height = window.innerHeight;
}

class Particle {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = Math.random() * particleCanvas.width;
    this.y = Math.random() * particleCanvas.height;
    this.baseSize = Math.random() * 2 + 0.5;
    this.size = this.baseSize;
    this.speedX = (Math.random() - 0.5) * 0.12;
    this.speedY = (Math.random() - 0.5) * 0.12;
    this.baseOpacity = Math.random() * 0.5 + 0.1;
    this.opacity = this.baseOpacity;
    this.color = ['#6b8a92', '#8a6b82', '#7a7490', '#7b9499', '#8e7e96'][Math.floor(Math.random() * 5)];
    this.pulseSpeed = Math.random() * 0.02 + 0.005;
    this.pulsePhase = Math.random() * Math.PI * 2;
  }

  update(time) {
    this.x += this.speedX;
    this.y += this.speedY;

    if (this.x < 0 || this.x > particleCanvas.width) this.speedX *= -1;
    if (this.y < 0 || this.y > particleCanvas.height) this.speedY *= -1;

    // Subtle pulse (no flashing)
    const pulse = Math.sin(time * this.pulseSpeed + this.pulsePhase);
    this.opacity = this.baseOpacity + pulse * 0.03;
    this.size = this.baseSize + pulse * 0.1;

    // Mouse repulsion
    const dx = this.x - mouse.x;
    const dy = this.y - mouse.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < mouseRadius && dist > 0) {
      const force = (mouseRadius - dist) / mouseRadius * 0.8;
      this.x += (dx / dist) * force;
      this.y += (dy / dist) * force;
      this.opacity = Math.min(1, this.opacity + force * 0.5);
      this.size = this.baseSize + force * 2;
    }
  }

  draw() {
    pCtx.beginPath();
    pCtx.arc(this.x, this.y, Math.max(0.1, this.size), 0, Math.PI * 2);
    pCtx.fillStyle = this.color;
    pCtx.globalAlpha = Math.max(0, this.opacity);
    pCtx.fill();
    // Glow for larger particles
    if (this.size > 1.5) {
      pCtx.beginPath();
      pCtx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
      const grad = pCtx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size * 3);
      grad.addColorStop(0, this.color);
      grad.addColorStop(1, 'transparent');
      pCtx.fillStyle = grad;
      pCtx.globalAlpha = this.opacity * 0.15;
      pCtx.fill();
    }
    pCtx.globalAlpha = 1;
  }
}

function initParticles() {
  resizeParticleCanvas();
  const count = Math.min(120, Math.floor((window.innerWidth * window.innerHeight) / 10000));
  particles = [];
  for (let i = 0; i < count; i++) {
    particles.push(new Particle());
  }
}

function isLightTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

function lineColor(alpha) {
  return isLightTheme() ? `rgba(0, 0, 0, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
}

function drawParticles(time) {
  pCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);

  // Subtle gradient blobs
  const t = (time || 0) * 0.0003;
  const cx1 = particleCanvas.width * (0.3 + Math.sin(t) * 0.15);
  const cy1 = particleCanvas.height * (0.3 + Math.cos(t * 0.7) * 0.15);
  const cx2 = particleCanvas.width * (0.7 + Math.cos(t * 0.5) * 0.15);
  const cy2 = particleCanvas.height * (0.6 + Math.sin(t * 0.8) * 0.15);
  const blobSize = Math.min(particleCanvas.width, particleCanvas.height) * 0.4;

  const g1 = pCtx.createRadialGradient(cx1, cy1, 0, cx1, cy1, blobSize);
  g1.addColorStop(0, 'rgba(8, 145, 178, 0.03)');
  g1.addColorStop(1, 'transparent');
  pCtx.fillStyle = g1;
  pCtx.fillRect(0, 0, particleCanvas.width, particleCanvas.height);

  const g2 = pCtx.createRadialGradient(cx2, cy2, 0, cx2, cy2, blobSize);
  g2.addColorStop(0, 'rgba(168, 85, 247, 0.025)');
  g2.addColorStop(1, 'transparent');
  pCtx.fillStyle = g2;
  pCtx.fillRect(0, 0, particleCanvas.width, particleCanvas.height);

  // Draw connections
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 150) {
        pCtx.beginPath();
        pCtx.moveTo(particles[i].x, particles[i].y);
        pCtx.lineTo(particles[j].x, particles[j].y);
        pCtx.strokeStyle = lineColor(0.3 * (1 - dist / 150));
        pCtx.lineWidth = 0.8;
        pCtx.stroke();
      }
    }
  }

  // Mouse connection lines
  if (mouse.x > 0 && mouse.y > 0) {
    particles.forEach(p => {
      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < mouseRadius) {
        pCtx.beginPath();
        pCtx.moveTo(p.x, p.y);
        pCtx.lineTo(mouse.x, mouse.y);
        pCtx.strokeStyle = lineColor(0.35 * (1 - dist / mouseRadius));
        pCtx.lineWidth = 0.7;
        pCtx.stroke();
      }
    });
  }

  particles.forEach(p => {
    p.update(time || 0);
    p.draw();
  });

  requestAnimationFrame(drawParticles);
}

window.addEventListener('resize', () => {
  resizeParticleCanvas();
});

initParticles();
drawParticles();

// ==========================================
// AUDIO VISUALIZER (Simulated)
// ==========================================
const vizCanvas = document.getElementById('visualizer');
const vizCtx = vizCanvas.getContext('2d');
let vizBars = [];

function resizeVizCanvas() {
  vizCanvas.width = window.innerWidth;
  vizCanvas.height = 50;
}

function initViz() {
  resizeVizCanvas();
  const barCount = Math.floor(window.innerWidth / 4);
  vizBars = [];
  for (let i = 0; i < barCount; i++) {
    vizBars.push({
      height: Math.random() * 15 + 2,
      targetHeight: Math.random() * 25 + 2,
      speed: Math.random() * 0.5 + 0.2
    });
  }
}

function drawViz() {
  vizCtx.clearRect(0, 0, vizCanvas.width, vizCanvas.height);

  const barWidth = 3;
  const gap = 1;

  for (let i = 0; i < vizBars.length; i++) {
    const bar = vizBars[i];

    // Smooth towards target
    bar.height += (bar.targetHeight - bar.height) * bar.speed * 0.1;

    // Randomly change target
    if (Math.random() < 0.02) {
      bar.targetHeight = Math.random() * 30 + 2;
    }

    const x = i * (barWidth + gap);
    const gradient = vizCtx.createLinearGradient(x, vizCanvas.height, x, vizCanvas.height - bar.height);
    gradient.addColorStop(0, 'rgba(8, 145, 178, 0.5)');
    gradient.addColorStop(1, 'rgba(124, 58, 237, 0.15)');

    vizCtx.fillStyle = gradient;
    vizCtx.fillRect(x, vizCanvas.height - bar.height, barWidth, bar.height);
  }

  requestAnimationFrame(drawViz);
}

window.addEventListener('resize', resizeVizCanvas);
initViz();
drawViz();

// ==========================================
// MAIN CONTENT INITIALIZATION
// ==========================================
function initMainContent() {
  initTypingEffect();
  initNavigation();
  initThemeToggle();
  initLiveData();
  initScrollReveal();
  initFilmReel();
  initSkillTree();
  initCountUp();
  initTerminalReveal();
  initScrollTooltip();
}

// ==========================================
// TYPING EFFECT (Hero subtitle)
// ==========================================
function initTypingEffect() {
  const phrases = [
    'Simulating metasurfaces with RCWA',
    'Producing music in FL Studio',
    'Editing in Premiere Pro',
    'Modeling in Blender',
    'Calibrating polarimetric optics',
    'Harvard eSports President',
    'Published at IEEE CLEO 2023',
    'Researching nanophotonics at Harvard SEAS'
  ];

  const typedEl = document.getElementById('typed-subtitle');
  if (!typedEl) return;

  let phraseIndex = 0;
  let charIndex = 0;
  let isDeleting = false;

  function type() {
    const current = phrases[phraseIndex];

    if (isDeleting) {
      typedEl.textContent = current.substring(0, charIndex - 1);
      charIndex--;
    } else {
      typedEl.textContent = current.substring(0, charIndex + 1);
      charIndex++;
    }

    let speed = isDeleting ? 30 : 60;

    if (!isDeleting && charIndex === current.length) {
      speed = 2000; // Pause at end
      isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      phraseIndex = (phraseIndex + 1) % phrases.length;
      speed = 500;
    }

    setTimeout(type, speed);
  }

  type();
}

// ==========================================
// NAVIGATION
// ==========================================
// ==========================================
// THEME TOGGLE
// ==========================================
function initThemeToggle() {
  const toggle = document.getElementById('theme-toggle');
  const icon = document.getElementById('theme-toggle-icon');
  if (!toggle) return;

  // Check saved preference
  const saved = localStorage.getItem('theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    icon.innerHTML = '&#9790;'; // moon
  }

  toggle.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      icon.innerHTML = '&#9788;'; // sun
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      icon.innerHTML = '&#9790;'; // moon
      localStorage.setItem('theme', 'light');
    }
  });
}

function initNavigation() {
  // Nav links
  const navOffset = 90; // account for fixed header height

  document.querySelectorAll('.nav-link, .menu-item').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.dataset.section;
      const target = document.getElementById(section);
      if (target) {
        const top = target.getBoundingClientRect().top + window.scrollY - navOffset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  // Logo smooth scroll to top
  const logo = document.querySelector('.nav-logo');
  if (logo) {
    logo.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Active nav tracking — scroll-based for consistency
  const sections = document.querySelectorAll('.section');
  const navLinks = document.querySelectorAll('.nav-link');

  function updateActiveNav() {
    let currentId = '';
    const scrollY = window.scrollY + navOffset + 20;

    sections.forEach(section => {
      if (section.offsetTop <= scrollY) {
        currentId = section.id;
      }
    });

    navLinks.forEach(link => {
      link.classList.toggle('active', link.dataset.section === currentId);
    });
  }

  window.addEventListener('scroll', updateActiveNav, { passive: true });
  updateActiveNav();
}

// ==========================================
// SCROLL REVEAL
// ==========================================
function initScrollReveal() {
  // Add reveal class to elements
  document.querySelectorAll('.info-card, .rec-vinyl, .rec-cartridge, .rec-tool, .contact-btn, .skill-node').forEach(el => {
    el.classList.add('reveal');
  });

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
      if (entry.isIntersecting) {
        setTimeout(() => {
          entry.target.classList.add('visible');
        }, index * 100);
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
}

// ==========================================
// TERMINAL TEXT REVEAL
// ==========================================
function initTerminalReveal() {
  const terminalOutput = document.getElementById('about-terminal-output');
  if (!terminalOutput) return;

  const lines = terminalOutput.querySelectorAll('.t-line');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        lines.forEach((line, i) => {
          setTimeout(() => {
            line.classList.add('visible');
          }, i * 80);
        });
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  observer.observe(terminalOutput);
}

// ==========================================
// COUNT-UP ANIMATION
// ==========================================
function initCountUp() {
  const stats = document.querySelectorAll('.stat-value');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = parseInt(entry.target.dataset.count);
        animateCount(entry.target, 0, target, 1500);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  stats.forEach(stat => observer.observe(stat));
}

function animateCount(el, start, end, duration) {
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + (end - start) * eased);

    el.textContent = current.toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.textContent = end.toLocaleString() + '+';
    }
  }

  requestAnimationFrame(update);
}

// ==========================================
// FILM REEL (Draggable)
// ==========================================
function initFilmReel() {
  const track = document.getElementById('filmstrip-track');
  const wrapper = track?.closest('.filmstrip-wrapper');
  if (!track || !wrapper) return;

  let isDragging = false;
  let hasDragged = false;
  let startX;
  let scrollLeft;
  let velocity = 0;
  let lastX = 0;
  let lastTime = 0;
  let momentumId = null;

  function stopMomentum() {
    if (momentumId) {
      cancelAnimationFrame(momentumId);
      momentumId = null;
    }
  }

  function applyMomentum() {
    if (Math.abs(velocity) < 0.5) {
      momentumId = null;
      return;
    }
    wrapper.scrollLeft -= velocity;
    velocity *= 0.95; // friction
    momentumId = requestAnimationFrame(applyMomentum);
  }

  wrapper.addEventListener('mousedown', (e) => {
    isDragging = true;
    hasDragged = false;
    stopMomentum();
    wrapper.style.cursor = 'grabbing';
    startX = e.pageX - wrapper.offsetLeft;
    scrollLeft = wrapper.scrollLeft;
    lastX = e.pageX;
    lastTime = Date.now();
    velocity = 0;
    e.preventDefault();
  });

  wrapper.addEventListener('mouseleave', () => {
    if (isDragging) {
      isDragging = false;
      wrapper.style.cursor = 'grab';
      applyMomentum();
    }
  });

  wrapper.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      wrapper.style.cursor = 'grab';
      applyMomentum();
    }
  });

  wrapper.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    hasDragged = true;
    const x = e.pageX - wrapper.offsetLeft;
    const walk = (x - startX) * 2;
    wrapper.scrollLeft = scrollLeft - walk;

    // Track velocity for momentum
    const now = Date.now();
    const dt = now - lastTime;
    if (dt > 0) {
      velocity = (e.pageX - lastX) * 2 / Math.max(dt, 8) * 16; // normalize to ~60fps
      lastX = e.pageX;
      lastTime = now;
    }
  });

  // Prevent clicks on links/frames after a drag
  wrapper.addEventListener('click', (e) => {
    if (hasDragged) {
      e.preventDefault();
      e.stopPropagation();
      hasDragged = false;
    }
  }, true);

  // Touch support with momentum
  let touchVelocity = 0;
  let touchLastX = 0;
  let touchLastTime = 0;

  wrapper.addEventListener('touchstart', (e) => {
    stopMomentum();
    startX = e.touches[0].pageX - wrapper.offsetLeft;
    scrollLeft = wrapper.scrollLeft;
    touchLastX = e.touches[0].pageX;
    touchLastTime = Date.now();
    touchVelocity = 0;
  });

  wrapper.addEventListener('touchmove', (e) => {
    const x = e.touches[0].pageX - wrapper.offsetLeft;
    const walk = (x - startX) * 2;
    wrapper.scrollLeft = scrollLeft - walk;

    const now = Date.now();
    const dt = now - touchLastTime;
    if (dt > 0) {
      touchVelocity = (e.touches[0].pageX - touchLastX) * 2 / Math.max(dt, 8) * 16;
      touchLastX = e.touches[0].pageX;
      touchLastTime = now;
    }
  });

  wrapper.addEventListener('touchend', () => {
    velocity = touchVelocity;
    applyMomentum();
  });

  // Make wrapper scrollable
  wrapper.style.overflowX = 'auto';
  wrapper.style.scrollbarWidth = 'none';
  wrapper.style.msOverflowStyle = 'none';
}

// ==========================================
// SKILL TREE
// ==========================================
function initSkillTree() {
  const nodes = document.querySelectorAll('.skill-node');
  const detailPanel = document.getElementById('skill-detail');

  if (!nodes.length) return;

  const skillDescriptions = {
    'audio': 'Core audio production skills spanning recording, mixing, and mastering across multiple genres.',
    'fl-studio': 'Professional-level DAW proficiency. Deep knowledge of FL Studio\'s workflow, plugins, and automation.',
    'mixing': 'Balancing tracks, EQ, compression, and spatial effects to create polished mixes.',
    'mastering': 'Final stage polish — loudness, stereo imaging, and format preparation.',
    'instruments': 'Multi-instrumentalist skills bringing organic sound to digital productions.',
    'guitar': 'Electric and acoustic guitar — rhythm, lead, and fingerstyle across multiple genres.',
    'keys': 'Piano and synthesizer performance, from classical foundations to modern synth design.',
    'video': 'End-to-end video production from shooting to final delivery.',
    'premiere': 'Advanced editing workflows, multicam, proxy editing, and integration with Creative Cloud.',
    'after-effects': 'Motion graphics, compositing, and visual effects for film and web.',
    'color': 'Color science, LUT creation, and cinematic color grading.',
    'threed': '3D content creation from concept to final render.',
    'blender': 'Comprehensive Blender skills across all major modules.',
    'modeling': 'Hard-surface and organic modeling, retopology, and UV unwrapping.',
    'animation': 'Keyframe animation, rigging basics, and motion principles.',
    'rendering': 'Cycles and EEVEE rendering, lighting setups, and material creation.'
  };

  nodes.forEach(node => {
    node.addEventListener('mouseenter', () => {
      const skill = node.dataset.skill;
      const level = node.dataset.level;
      const label = node.querySelector('.node-name').textContent;
      const icon = node.querySelector('.node-icon').textContent;

      document.getElementById('skill-detail-icon').textContent = icon;
      document.getElementById('skill-detail-name').textContent = label;
      document.getElementById('skill-detail-fill').style.width = level + '%';
      document.getElementById('skill-detail-desc').textContent = skillDescriptions[skill] || 'A well-honed skill in the creative arsenal.';

      detailPanel.classList.add('visible');
    });

    node.addEventListener('mouseleave', () => {
      detailPanel.classList.remove('visible');
    });
  });
}

// ==========================================
// HEX GRID DECORATION
// ==========================================
function createHexGrid() {
  const grid = document.getElementById('hex-grid');
  if (!grid) return;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', '0 0 600 800');

  const hexSize = 30;
  const rows = 15;
  const cols = 10;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * hexSize * 1.8 + (row % 2 ? hexSize * 0.9 : 0);
      const y = row * hexSize * 1.6;

      const hex = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const points = [];

      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        points.push(`${x + hexSize * Math.cos(angle)},${y + hexSize * Math.sin(angle)}`);
      }

      hex.setAttribute('points', points.join(' '));
      hex.setAttribute('fill', 'none');
      hex.setAttribute('stroke', `rgba(8, 145, 178, ${Math.random() * 0.12 + 0.02})`);
      hex.setAttribute('stroke-width', '0.5');

      if (Math.random() < 0.1) {
        hex.setAttribute('fill', `rgba(8, 145, 178, ${Math.random() * 0.04})`);
      }

      svg.appendChild(hex);
    }
  }

  grid.appendChild(svg);
}

createHexGrid();

// ==========================================
// JOYSTICK ANIMATION (Contact section)
// ==========================================
function initJoystick() {
  const stick = document.querySelector('.joystick-stick');
  const base = document.querySelector('.joystick-base');
  if (!stick || !base) return;

  base.addEventListener('mousemove', (e) => {
    const rect = base.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 12;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 12;
    stick.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  });

  base.addEventListener('mouseleave', () => {
    stick.style.transform = 'translate(-50%, -50%)';
  });
}

// Initialize joystick after main content loads
setTimeout(initJoystick, 1000);

// ==========================================
// KONAMI CODE EASTER EGG
// ==========================================
const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiIndex = 0;

document.addEventListener('keydown', (e) => {
  if (e.key === konamiCode[konamiIndex]) {
    konamiIndex++;
    if (konamiIndex === konamiCode.length) {
      activateEasterEgg();
      konamiIndex = 0;
    }
  } else {
    konamiIndex = 0;
  }
});

function activateEasterEgg() {
  document.body.style.transition = 'filter 0.5s ease';
  document.body.style.filter = 'hue-rotate(180deg)';

  const msg = document.createElement('div');
  msg.textContent = 'NICE FIND';
  msg.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-family: var(--font-display);
    font-size: 3rem;
    font-weight: 900;
    color: #39ff14;
    text-shadow: 0 0 20px #39ff14, 0 0 60px #39ff14;
    z-index: 99999;
    animation: fadeUp 2s ease forwards;
    pointer-events: none;
  `;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeUp {
      0% { opacity: 1; transform: translate(-50%, -50%) scale(0.5); }
      50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
      100% { opacity: 0; transform: translate(-50%, -80%) scale(1); }
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(msg);

  setTimeout(() => {
    document.body.style.filter = 'none';
    msg.remove();
  }, 2500);
}
