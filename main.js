const { app, BrowserWindow } = require('electron');
const path = require('path');
const Fastify = require('fastify');
const fs = require('fs');
const cheerio = require('cheerio');

// Server configuration
const fastify = Fastify({ logger: false });

fastify.register(require('@fastify/multipart'), {
  limits: { fileSize: 2000 * 1024 * 1024 } // 2000MB limit
});

const monthsMap = {
  'janv.': '01', 'févr.': '02', 'mars': '03', 'avr.': '04',
  'mai': '05', 'juin': '06', 'juil.': '07', 'août': '08',
  'sept.': '09', 'oct.': '10', 'nov.': '11', 'déc.': '12'
};

function parseDate(dateStr) {
  const regex = /(\d+)\s+([a-zéû.]+)\s+(\d{4})(?:,|\s+à)\s+(\d{1,2}:\d{2}:\d{2})\s+([A-Z0-9+-]+)/i;
  const match = dateStr.match(regex);
  if (match) {
    const day = match[1].padStart(2, '0');
    const monthStr = match[2].toLowerCase();
    const month = monthsMap[monthStr] || '01';
    const year = match[3];
    const time = match[4];
    const tz = match[5];

    let tzOffset = "Z";
    if (tz === "CET") tzOffset = "+01:00";
    else if (tz === "CEST") tzOffset = "+02:00";
    else if (tz.includes("UTC")) tzOffset = tz.replace("UTC", "").replace(" ", "");
    if (tzOffset === "") tzOffset = "Z";

    try {
      const d = new Date(`${year}-${month}-${day}T${time}${tzOffset}`);
      if (!isNaN(d.getTime())) return d.toISOString();
    } catch (e) { }
  }
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch (e) { }
  return dateStr;
}

function convertHtmlToJson(htmlStr) {
  const $ = cheerio.load(htmlStr);
  const cells = $('.content-cell.mdl-cell');
  const results = [];

  cells.each((i, el) => {
    const $el = $(el);
    const links = $el.find('a');
    if (links.length === 0) return;

    const titleEl = links.eq(0);
    const titleUrl = titleEl.attr('href');
    if (titleUrl === 'https://myaccount.google.com/activitycontrols') return;

    let prefix = 'Vous avez regardé ';
    const firstChild = $el.contents().first();
    if (firstChild && firstChild[0] && firstChild[0].type === 'text') {
      const t = firstChild.text().trim();
      const cleanT = t.replace(/\u00A0/g, ' ');
      if (cleanT.length > 0) prefix = cleanT + ' ';
    }

    const title = `${prefix}${titleEl.text()}`;
    const header = (titleUrl && titleUrl.includes('music.youtube.com')) ? 'YouTube Music' : 'YouTube';

    let subtitles = [];
    if (links.length > 1) {
      const channelEl = links.eq(1);
      subtitles = [{ name: channelEl.text(), url: channelEl.attr('href') }];
    }

    const contents = $el.contents();
    let dateStr = '';
    for (let j = contents.length - 1; j >= 0; j--) {
      if (contents[j].type === 'text') {
        const textContent = $(contents[j]).text().trim();
        if (textContent.length > 5) {
          dateStr = textContent;
          break;
        }
      }
    }
    const time = parseDate(dateStr);
    results.push({ header, title, titleUrl, subtitles, time });
  });

  return results;
}

function bucketizeByVolume(sortedArray, getCount) {
  if (sortedArray.length === 0) return [];
  const totalVolume = sortedArray.reduce((sum, item) => sum + getCount(item), 0);

  const tiers = [
    { label: 'tier1', data: [] },
    { label: 'tier2', data: [] },
    { label: 'tier3', data: [] },
    { label: 'tier4', data: [] }
  ];

  let cumulative = 0;
  for (const item of sortedArray) {
    const ratio = cumulative / totalVolume;
    if (ratio < 0.25) tiers[0].data.push(item);
    else if (ratio < 0.50) tiers[1].data.push(item);
    else if (ratio < 0.75) tiers[2].data.push(item);
    else tiers[3].data.push(item);
    cumulative += getCount(item);
  }
  return tiers.filter(tier => tier.data.length > 0);
}

function getMusicStats(history) {
  const musicVideoIds = new Set();
  history.forEach(item => {
    if ((item.header && item.header.includes('YouTube Music')) || (item.titleUrl && item.titleUrl.includes('music.'))) {
      if (item.titleUrl) {
        const match = item.titleUrl.match(/v=([a-zA-Z0-9_-]{11})/);
        if (match) musicVideoIds.add(match[1]);
      }
    }
  });

  const musicEntries = history.filter(item => {
    const isMusicApp = (item.header && item.header.includes('YouTube Music')) || (item.titleUrl && item.titleUrl.includes('music.'));
    const isTopic = item.subtitles && item.subtitles.length > 0 && item.subtitles[0].name.includes(' - Topic');
    let isKnownMusicVideo = false;
    if (item.titleUrl) {
      const match = item.titleUrl.match(/v=([a-zA-Z0-9_-]{11})/);
      if (match && musicVideoIds.has(match[1])) isKnownMusicVideo = true;
    }
    return isMusicApp || isTopic || isKnownMusicVideo;
  });

  musicEntries.sort((a, b) => {
    const timeA = a.time ? new Date(a.time).getTime() : 0;
    const timeB = b.time ? new Date(b.time).getTime() : 0;
    return timeA - timeB;
  });

  const artists = {};
  const tracks = {};
  const artistDetails = {};
  let totalListens = 0;

  const evolutionByMonth = {};
  const activityByDay = {};
  const habitsByHour = new Array(24).fill(0);
  const habitsByWeekDay = new Array(7).fill(0);

  const monthlyArtistCounts = {};
  const monthlyTrackCounts = {};
  const trackDates = {};
  const morningTracks = {};
  const eveningTracks = {};

  let baselineEndTime = 0;
  const knownArtists = new Set();
  const monthlyStats = {};

  if (musicEntries.length > 0 && musicEntries[0].time) {
    baselineEndTime = new Date(musicEntries[0].time).getTime() + (30 * 24 * 60 * 60 * 1000);
  }

  musicEntries.forEach(entry => {
    if (!entry.title) return;
    totalListens++;

    let trackName = entry.title.replace(/^(Vous avez regardé|Watched|A regardé|a regardé)\s+/i, '').trim();
    let artistName = 'Artiste inconnu';
    if (entry.subtitles && entry.subtitles.length > 0) {
      artistName = entry.subtitles[0].name.replace(/ - Topic$/i, '').trim();
    }

    let videoId = null;
    let thumbnailUrl = '';
    if (entry.titleUrl) {
      const match = entry.titleUrl.match(/v=([a-zA-Z0-9_-]{11})/);
      if (match) {
        videoId = match[1];
        thumbnailUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
      }
    }

    let fallbackKey = `${trackName}_${artistName}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    const trackKey = videoId ? videoId : fallbackKey;

    if (!artists[artistName]) artists[artistName] = { count: 0, thumb: thumbnailUrl };
    artists[artistName].count++;
    if (!artists[artistName].thumb && thumbnailUrl) artists[artistName].thumb = thumbnailUrl;

    if (!tracks[trackKey]) tracks[trackKey] = { count: 0, thumb: thumbnailUrl, name: trackName, artist: artistName, lastPlayed: 0 };
    tracks[trackKey].count++;
    if (entry.header && entry.header.includes('Music')) tracks[trackKey].name = trackName;

    if (!artistDetails[artistName]) artistDetails[artistName] = { count: 0, thumb: thumbnailUrl, tracks: {} };
    artistDetails[artistName].count++;
    if (!artistDetails[artistName].thumb && thumbnailUrl) artistDetails[artistName].thumb = thumbnailUrl;

    if (!artistDetails[artistName].tracks[trackKey]) artistDetails[artistName].tracks[trackKey] = { count: 0, thumb: thumbnailUrl, name: trackName };
    artistDetails[artistName].tracks[trackKey].count++;
    if (entry.header && entry.header.includes('Music')) artistDetails[artistName].tracks[trackKey].name = trackName;

    if (entry.time) {
      const actualDateObj = new Date(entry.time);
      if (!isNaN(actualDateObj)) {
        const time = actualDateObj.getTime();
        if (time > tracks[trackKey].lastPlayed) tracks[trackKey].lastPlayed = time;

        const hour = actualDateObj.getHours();
        habitsByHour[hour]++;
        const weekDay = actualDateObj.getDay();
        habitsByWeekDay[weekDay]++;

        if (hour >= 6 && hour < 10) {
          if (!morningTracks[trackKey]) morningTracks[trackKey] = { count: 0, name: tracks[trackKey].name, artist: artistName, thumb: thumbnailUrl };
          morningTracks[trackKey].count++;
        }
        if (hour >= 22 || hour < 2) {
          if (!eveningTracks[trackKey]) eveningTracks[trackKey] = { count: 0, name: tracks[trackKey].name, artist: artistName, thumb: thumbnailUrl };
          eveningTracks[trackKey].count++;
        }

        const offsetDateObj = new Date(actualDateObj);
        offsetDateObj.setHours(offsetDateObj.getHours() - 4);
        const yyyy = offsetDateObj.getFullYear();
        const mm = String(offsetDateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(offsetDateObj.getDate()).padStart(2, '0');

        const monthKey = `${yyyy}-${mm}`;
        const dayKey = `${yyyy}-${mm}-${dd}`;

        evolutionByMonth[monthKey] = (evolutionByMonth[monthKey] || 0) + 1;
        activityByDay[dayKey] = (activityByDay[dayKey] || 0) + 1;

        if (!monthlyArtistCounts[monthKey]) monthlyArtistCounts[monthKey] = {};
        if (!monthlyArtistCounts[monthKey][artistName]) monthlyArtistCounts[monthKey][artistName] = 0;
        monthlyArtistCounts[monthKey][artistName]++;

        if (!monthlyTrackCounts[monthKey]) monthlyTrackCounts[monthKey] = {};
        monthlyTrackCounts[monthKey][trackKey] = (monthlyTrackCounts[monthKey][trackKey] || 0) + 1;

        if (!trackDates[trackKey]) trackDates[trackKey] = new Set();
        trackDates[trackKey].add(dayKey);

        if (time < baselineEndTime) {
          knownArtists.add(artistName);
        } else {
          const monthActual = `${actualDateObj.getFullYear()}-${String(actualDateObj.getMonth() + 1).padStart(2, '0')}`;
          if (!monthlyStats[monthActual]) monthlyStats[monthActual] = { totalListens: 0, newArtistsListens: 0 };
          monthlyStats[monthActual].totalListens++;
          if (!knownArtists.has(artistName)) {
            knownArtists.add(artistName);
            monthlyStats[monthActual].newArtistsListens++;
          }
        }
      }
    }
  });

  // --- ANALYSE SUR LES 12 DERNIERS MOIS ---
  const allMonthsSorted = Object.keys(monthlyArtistCounts).sort();
  const last12Months = allMonthsSorted.slice(-12);
  const monthlyTops = [];
  const topArtistsOfEachMonth = new Set();

  last12Months.forEach(month => {
    let topArtist = { name: '', count: 0, thumb: '' };

    if (monthlyArtistCounts[month]) {
      const sortedArtists = Object.entries(monthlyArtistCounts[month]).sort((a, b) => b[1] - a[1]);
      // Garde les 4 premiers de chaque mois
      sortedArtists.slice(0, 4).forEach(x => topArtistsOfEachMonth.add(x[0]));

      for (const [art, count] of sortedArtists) {
        if (count > topArtist.count) {
          topArtist = { name: art, count, thumb: artists[art]?.thumb || '' };
        }
      }
    }

    let topTrack = { name: '', artist: '', count: 0, thumb: '' };
    if (monthlyTrackCounts[month]) {
      for (const [tKey, count] of Object.entries(monthlyTrackCounts[month])) {
        if (count > topTrack.count) {
          topTrack = { name: tracks[tKey]?.name || 'Inconnu', artist: tracks[tKey]?.artist || 'Inconnu', count, thumb: tracks[tKey]?.thumb || '' };
        }
      }
    }
    monthlyTops.push({ month, topArtist, topTrack });
  });

  const artistsInH2H = Array.from(topArtistsOfEachMonth);
  artistsInH2H.sort((a, b) => {
    const volA = last12Months.reduce((sum, m) => sum + (monthlyArtistCounts[m]?.[a] || 0), 0);
    const volB = last12Months.reduce((sum, m) => sum + (monthlyArtistCounts[m]?.[b] || 0), 0);
    return volB - volA; // Décroissant
  });

  const headToHeadData = artistsInH2H.map(artistName => {
    return {
      name: artistName,
      data: last12Months.map(month => monthlyArtistCounts[month]?.[artistName] || 0)
    };
  });

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const threeMonthsAgoTs = threeMonthsAgo.getTime();

  const forgottenGems = Object.values(tracks)
    .filter(t => t.count >= 15 && t.lastPlayed > 0 && t.lastPlayed < threeMonthsAgoTs)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const discoveryRate = Object.keys(monthlyStats).sort().map(month => ({
    month, totalListens: monthlyStats[month].totalListens, newArtistsListens: monthlyStats[month].newArtistsListens,
    ratio: monthlyStats[month].totalListens > 0 ? (monthlyStats[month].newArtistsListens / monthlyStats[month].totalListens) : 0
  }));

  const getTopHymn = (tracksMap) => {
    let top = { count: 0, name: '', artist: '', thumb: '' };
    for (const key in tracksMap) if (tracksMap[key].count > top.count) top = tracksMap[key];
    return top.count > 0 ? top : null;
  };

  const artistProfiles = [];
  for (const [artistName, data] of Object.entries(artistDetails)) {
    if (data.count >= 15) {
      const tracksArray = Object.values(data.tracks);
      let topTrack = tracksArray[0];
      for (let i = 1; i < tracksArray.length; i++) if (tracksArray[i].count > topTrack.count) topTrack = tracksArray[i];
      artistProfiles.push({ name: artistName, totalListens: data.count, uniqueTracks: tracksArray.length, topTrackName: topTrack.name, ratio: topTrack.count / data.count, thumb: data.thumb });
    }
  }

  const oneHitWonders = artistProfiles.filter(a => a.ratio >= 0.85).sort((a, b) => b.totalListens - a.totalListens).slice(0, 15);

  let bestTrackStreak = { count: 0, name: '', artist: '', thumb: '' };
  for (const [tKey, datesSet] of Object.entries(trackDates)) {
    if (datesSet.size <= bestTrackStreak.count) continue;
    const sortedDates = Array.from(datesSet).sort();
    let currentStreak = 1; let maxLocalStreak = 1; let prevDate = new Date(sortedDates[0]);

    for (let i = 1; i < sortedDates.length; i++) {
      const currDate = new Date(sortedDates[i]);
      const diffDays = Math.round(Math.abs(currDate - prevDate) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) currentStreak++; else currentStreak = 1;
      if (currentStreak > maxLocalStreak) maxLocalStreak = currentStreak;
      prevDate = currDate;
    }
    if (maxLocalStreak > bestTrackStreak.count) bestTrackStreak = { count: maxLocalStreak, name: tracks[tKey]?.name || 'Inconnu', artist: tracks[tKey]?.artist || 'Inconnu', thumb: tracks[tKey]?.thumb || '' };
  }

  const obsessionsTimeline = Object.entries(monthlyArtistCounts).map(([month, artistsMap]) => {
    let topArtist = { name: '', count: 0 };
    for (const [artName, count] of Object.entries(artistsMap)) if (count > topArtist.count) topArtist = { name: artName, count: count };
    return { month: month, artist: topArtist.name, count: topArtist.count, thumb: artists[topArtist.name]?.thumb || '' };
  }).sort((a, b) => b.month.localeCompare(a.month));

  let recordDay = { date: null, count: 0 };
  for (const [day, count] of Object.entries(activityByDay)) {
    if (count > recordDay.count) recordDay = { date: day, count };
  }

  const sortData = (obj) => Object.entries(obj).sort((a, b) => b[1].count - a[1].count).slice(0, 15);
  const allArtistsSorted = Object.entries(artistDetails).sort((a, b) => b[1].count - a[1].count).map(([name, data]) => ({ name, count: data.count, thumb: data.thumb, trackTiers: bucketizeByVolume(Object.entries(data.tracks).sort((a, b) => b[1].count - a[1].count), track => track[1].count) }));

  return {
    totalListens,
    uniqueArtists: Object.keys(artists).length,
    uniqueTracks: Object.keys(tracks).length,
    bestTrackStreak,
    topArtists: sortData(artists),
    topTracks: sortData(tracks),
    tieredArtistsTree: bucketizeByVolume(allArtistsSorted, artist => artist.count),
    evolution: Object.keys(evolutionByMonth).sort().map(key => ({ date: key, count: evolutionByMonth[key] })),
    activityByDay,
    habitsByHour,
    habitsByWeekDay,
    recordDay,
    obsessionsTimeline,
    forgottenGems,
    discoveryRate,
    morningHymn: getTopHymn(morningTracks),
    eveningHymn: getTopHymn(eveningTracks),
    oneHitWonders,
    last12Months,
    headToHeadData,
    monthlyTops
  };
}

// Routes
fastify.get('/api/stats', async (request, reply) => {
  // Never load history from disk automatically per user request.
  reply.status(200).send({ needUpload: true });
});

fastify.post('/api/upload', async (request, reply) => {
  try {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: "Aucun fichier fourni" });
    const buffer = await data.toBuffer();
    const filename = data.filename.toLowerCase();
    let history;
    if (filename.endsWith('.json')) history = JSON.parse(buffer.toString('utf8'));
    else if (filename.endsWith('.html')) history = convertHtmlToJson(buffer.toString('utf8'));
    else return reply.code(400).send({ error: "Format non supporté." });
    return getMusicStats(history);
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ error: "Erreur lors de l'analyse du fichier." });
  }
});

fastify.get('/', async (request, reply) => {
  const htmlPath = path.join(__dirname, 'index.html');
  reply.type('text/html').send(fs.readFileSync(htmlPath, 'utf8'));
});

// Electron window creation
function createWindow(port) {
  const win = new BrowserWindow({
    width: 1210,
    height: 800,
    minWidth: 1210,
    useContentSize: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.setMenu(null);

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if (input.key === 'F12') {
        win.webContents.toggleDevTools();
        event.preventDefault();
      } else if (input.key === 'F5') {
        win.reload();
        event.preventDefault();
      }
    }
  });

  win.loadURL(`http://localhost:${port}/`);
}

// Start app
app.whenReady().then(async () => {
  try {
    const address = await fastify.listen({ port: 0 }); // 0 means random available port
    const port = fastify.server.address().port;
    console.log(`Serveur Fastify en cours d'exécution sur le port ${port}`);
    createWindow(port);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(port);
      }
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
