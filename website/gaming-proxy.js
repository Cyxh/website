/**
 * Local gaming proxy for development.
 * Run: node gaming-proxy.js
 * Serves on http://localhost:3004/api/gaming
 */

const http = require('http');
const https = require('https');

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_ID = process.env.STEAM_ID;

const RIOT_API_KEY = process.env.RIOT_API_KEY;
const RIOT_NAME = process.env.RIOT_NAME;
const RIOT_TAG = process.env.RIOT_TAG;

if (!STEAM_API_KEY || !STEAM_ID || !RIOT_API_KEY || !RIOT_NAME || !RIOT_TAG) {
  console.error('Missing required env vars: STEAM_API_KEY, STEAM_ID, RIOT_API_KEY, RIOT_NAME, RIOT_TAG');
  process.exit(1);
}

function fetchJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (!data || res.statusCode === 204) {
          resolve({ status: res.statusCode, body: null });
        } else {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function getRiotData() {
  const riotHeaders = { 'X-Riot-Token': RIOT_API_KEY };
  const result = { lol: null, valorant: null, account: null };

  try {
    // 1. Get PUUID from Riot ID
    const accountRes = await fetchJSON(
      `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(RIOT_NAME)}/${encodeURIComponent(RIOT_TAG)}`,
      riotHeaders
    );
    if (accountRes.status !== 200 || !accountRes.body) return result;
    const puuid = accountRes.body.puuid;
    result.account = { gameName: accountRes.body.gameName, tagLine: accountRes.body.tagLine };

    // 2. League of Legends
    try {
      // Get summoner info
      const summonerRes = await fetchJSON(
        `https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
        riotHeaders
      );

      if (summonerRes.status === 200 && summonerRes.body) {
        const summonerId = summonerRes.body.id;
        const summonerLevel = summonerRes.body.summonerLevel;

        // Get ranked stats + top champions + mastery score in parallel
        const [rankedRes, masteryRes, matchIdsRes, masteryScoreRes, allMasteryRes] = await Promise.all([
          fetchJSON(
            `https://na1.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`,
            riotHeaders
          ),
          fetchJSON(
            `https://na1.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=5`,
            riotHeaders
          ),
          fetchJSON(
            `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?count=8`,
            riotHeaders
          ),
          fetchJSON(
            `https://na1.api.riotgames.com/lol/champion-mastery/v4/scores/by-puuid/${puuid}`,
            riotHeaders
          ),
          fetchJSON(
            `https://na1.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}`,
            riotHeaders
          ),
        ]);

        // Parse ranked data
        const ranked = {};
        if (rankedRes.status === 200 && Array.isArray(rankedRes.body)) {
          rankedRes.body.forEach(q => {
            ranked[q.queueType] = {
              tier: q.tier,
              rank: q.rank,
              lp: q.leaguePoints,
              wins: q.wins,
              losses: q.losses,
            };
          });
        }

        // Parse champion mastery
        const topChampions = [];
        if (masteryRes.status === 200 && Array.isArray(masteryRes.body)) {
          masteryRes.body.forEach(c => {
            topChampions.push({
              championId: c.championId,
              level: c.championLevel,
              points: c.championPoints,
            });
          });
        }

        // Fetch recent match details
        const recentMatches = [];
        if (matchIdsRes.status === 200 && Array.isArray(matchIdsRes.body)) {
          // Fetch up to 5 match details
          const matchDetailPromises = matchIdsRes.body.slice(0, 5).map(matchId =>
            fetchJSON(
              `https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`,
              riotHeaders
            )
          );
          const matchDetails = await Promise.all(matchDetailPromises);
          matchDetails.forEach(md => {
            if (md.status === 200 && md.body && md.body.info) {
              const participant = md.body.info.participants.find(p => p.puuid === puuid);
              if (participant) {
                recentMatches.push({
                  champion: participant.championName,
                  kills: participant.kills,
                  deaths: participant.deaths,
                  assists: participant.assists,
                  win: participant.win,
                  cs: participant.totalMinionsKilled + (participant.neutralMinionsKilled || 0),
                  gold: participant.goldEarned,
                  damage: participant.totalDamageDealtToChampions,
                  vision: participant.visionScore,
                  gameMode: md.body.info.gameMode,
                  gameDuration: md.body.info.gameDuration,
                });
              }
            }
          });
        }

        // Mastery score + champion count
        const masteryScore = (masteryScoreRes.status === 200 && masteryScoreRes.body) ? masteryScoreRes.body : 0;
        const championsPlayed = (allMasteryRes.status === 200 && Array.isArray(allMasteryRes.body)) ? allMasteryRes.body.length : 0;
        const totalMasteryPoints = (allMasteryRes.status === 200 && Array.isArray(allMasteryRes.body))
          ? allMasteryRes.body.reduce((sum, c) => sum + c.championPoints, 0) : 0;

        result.lol = {
          summonerLevel,
          ranked,
          topChampions,
          recentMatches,
          masteryScore,
          championsPlayed,
          totalMasteryPoints,
        };
      }
    } catch (e) {
      console.warn('LoL fetch error:', e.message);
    }

  } catch (e) {
    console.warn('Riot API error:', e.message);
  }

  return result;
}

async function getSteamData() {
  const result = { profile: null, recentGames: null, ownedCount: 0 };

  try {
    const [profileRes, recentRes, ownedRes] = await Promise.all([
      fetchJSON(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${STEAM_ID}`
      ),
      fetchJSON(
        `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${STEAM_API_KEY}&steamid=${STEAM_ID}&format=json&count=10`
      ),
      fetchJSON(
        `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${STEAM_ID}&include_appinfo=1&format=json`
      ),
    ]);

    if (profileRes.status === 200 && profileRes.body?.response?.players?.[0]) {
      const p = profileRes.body.response.players[0];
      result.profile = {
        name: p.personaname,
        avatar: p.avatarfull,
        profileUrl: p.profileurl,
        status: ['Offline', 'Online', 'Busy', 'Away', 'Snooze', 'Looking to trade', 'Looking to play'][p.personastate] || 'Offline',
      };
    }

    if (recentRes.status === 200 && recentRes.body?.response?.games) {
      result.recentGames = recentRes.body.response.games.map(g => ({
        appid: g.appid,
        name: g.name,
        playtime2Weeks: g.playtime_2weeks,
        playtimeForever: g.playtime_forever,
        icon: `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`,
        header: `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
      }));
    }

    if (ownedRes.status === 200 && ownedRes.body?.response) {
      result.ownedCount = ownedRes.body.response.game_count || 0;
      // Total playtime across all games
      if (ownedRes.body.response.games) {
        result.totalPlaytime = ownedRes.body.response.games.reduce((sum, g) => sum + (g.playtime_forever || 0), 0);
      }
      // Top games by total playtime
      if (ownedRes.body.response.games) {
        result.topGames = ownedRes.body.response.games
          .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0))
          .slice(0, 8)
          .map(g => ({
            appid: g.appid,
            name: g.name,
            playtimeForever: g.playtime_forever,
            icon: `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`,
            header: `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
          }));
      }
    }

  } catch (e) {
    console.warn('Steam API error:', e.message);
  }

  return result;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  if (req.url !== '/api/gaming') {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  try {
    const [riot, steam] = await Promise.all([getRiotData(), getSteamData()]);
    res.writeHead(200);
    res.end(JSON.stringify({ riot, steam }));
  } catch (err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(3004, () => {
  console.log('Gaming proxy running at http://localhost:3004/api/gaming');
});
