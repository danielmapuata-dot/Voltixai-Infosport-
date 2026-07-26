require('dotenv').config();
const express = require('express');
const https = require('https');

// 🔒 Configuration API-SPORTS
const API_KEY = process.env.API_KEY || 'df0b577a7727d5206ebe5185f5a619e9';
const API_BASE = 'https://v3.football.api-sports.io';
const FACEBOOK_TOKEN = process.env.FACEBOOK_TOKEN || '';
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID || '';

const app = express();
const PORT = process.env.PORT || 3001;

// 📂 Suivi des matchs
const suivisMatchs = new Map();
const TERMINES = [];

// 🛡️ En-têtes API
const headersAPI = {
  'X-Api-Key': API_KEY,
  'Content-Type': 'application/json'
};

// 📞 Appel API
function appelAPI(chemin, customHeaders = {}, corps = null) {
  return new Promise((resoudre, rejeter) => {
    const url = new URL(chemin, API_BASE);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { ...headersAPI, ...customHeaders }
    };

    if (url.hostname.includes('facebook.com')) {
      delete options.headers['X-Api-Key'];
      options.headers['Authorization'] = `Bearer ${FACEBOOK_TOKEN}`;
    }
    if (corps) options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(corps));

    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          res.statusCode >= 400 ? rejeter(parsed) : resoudre(parsed);
        } catch (e) { rejeter(e); }
      });
    });
    req.on('error', rejeter);
    if (corps) req.write(JSON.stringify(corps));
    req.end();
  });
}

// 🚩 Drapeaux
function getDrapeau(pays) {
  if (!pays) return "🏳️";
  const n = pays.toLowerCase();
  if (n.includes("france")) return "🇫🇷";
  if (n.includes("brazil")) return "🇧🇷";
  if (n.includes("england")) return "🏴󠁧󠁢󠁥󠁮󠁧󠁿";
  if (n.includes("spain")) return "🇪🇸";
  if (n.includes("italy")) return "🇮🇹";
  if (n.includes("australia")) return "🇦🇺";
  if (n.includes("china")) return "🇨🇳";
  if (n.includes("uk")) return "🇬🇧";
  if (n.includes("myanmar")) return "🇲🇲";
  if (n.includes("ukraine")) return "🇺🇦";
  return "🏳️";
}

// 📊 Stats complètes
function formaterStats(match) {
  const stats = match.statistics || [];
  const dom = stats.find(s => s.team.name === match.teams.home.name) || { statistics: {} };
  const ext = stats.find(s => s.team.name === match.teams.away.name) || { statistics: {} };
  const g = (t, c) => t.statistics[c]?.value || '0';

  return {
    cornes: `${g(dom, 'Corner Kicks')}-${g(ext, 'Corner Kicks')}`,
    pos: `${g(dom, 'Ball Possession') || '50%'}-${g(ext, 'Ball Possession') || '50%'}`,
    tirsCadres: `${g(dom, 'Shots on Goal')}-${g(ext, 'Shots on Goal')}`,
    tirsTotal: `${g(dom, 'Total Shots')}-${g(ext, 'Total Shots')}`,
    fautes: `${g(dom, 'Fouls')}-${g(ext, 'Fouls')}`,
    horsJeu: `${g(dom, 'Offsides')}-${g(ext, 'Offsides')}`,
    cartonJ: `${g(dom, 'Yellow Cards')}-${g(ext, 'Yellow Cards')}`,
    cartonR: `${g(dom, 'Red Cards')}-${g(ext, 'Red Cards')}`,
    remplac: `${g(dom, 'Substitutions')}-${g(ext, 'Substitutions')}`
  };
}

// 📝 Formatage identique à ScoreZone
function formaterMatch(match, estTermine = false) {
  const d = match.fixture, l = match.league, h = match.teams.home, a = match.teams.away;
  const butH = match.goals.home ?? 0, butA = match.goals.away ?? 0;
  const ht = match.score.halftime || { home: 0, away: 0 };
  const mt = match.score.fulltime ? Math.max(0, butH - ht.home) : 0;
  const at = match.score.fulltime ? Math.max(0, butA - ht.away) : 0;

  const drapeau = getDrapeau(l.country);
  const minute = d.status.short === 'HT' ? 'HT' : `${d.status.elapsed ?? 0}'`;
  const statut = estTermine ? 'FT' : minute;
  const s = formaterStats(match);

  return `${drapeau} ${l.name}
● ${statut} | ${h.name} ${butH}-${butA} ${a.name}
➡️ 1st Half: ${ht.home}-${ht.away} | 2nd Half: ${mt}-${at}
🚩 Corners: ${s.cornes} | 🟨 Yellow: ${s.cartonJ} | 🔄 Subs: ${s.remplac}
🟥 Red: ${s.cartonR} | ⛔ Offsides: ${s.horsJeu} | ⚠️ Fouls: ${s.fautes}
🎯 Shots on: ${s.tirsCadres} | 🎯 Total: ${s.tirsTotal} | 🅿️ Poss: ${s.pos}
`;
}

// 📤 Publication Facebook
async function publier(message) {
  const heureGMT = new Date().toLocaleTimeString('fr-FR', { timeZone: 'GMT', hour: '2-digit', minute: '2-digit' });
  const msg = `⚽🚩 LIVE SCORE ⚽ ${heureGMT} - GMT\n\n${message}\n——————————————\n#VoltixaiLive #ScoreZone #Football`;
  try {
    await appelAPI(`https://graph.facebook.com/v21.0/${FACEBOOK_PAGE_ID}/feed`, {}, { message: msg });
    console.log("✅ Publié");
  } catch (e) { console.error("❌", e); }
}

// 🔄 Surveillance toutes les 14min
async function surveiller() {
  try {
    console.log("\n🔍 Vérification...");
    const res = await appelAPI("/fixtures?live=all");
    const matchs = res.response || [];

    let direct = "";
    for (const m of matchs) {
      const id = m.fixture.id, st = m.fixture.status.short;
      const cle = `${st}-${m.goals.home}-${m.goals.away}`;
      if (!suivisMatchs.has(id)) suivisMatchs.set(id, { dejaVu: new Set() });
      const suivi = suivisMatchs.get(id);

      if (["FT","AET","PEN"].includes(st) && !suivi.estTermine) {
        suivi.estTermine = true;
        TERMINES.unshift(m);
        if (TERMINES.length > 20) TERMINES.pop();
        continue;
      }
      if (!suivi.dejaVu.has(cle)) { suivi.dejaVu.add(cle); direct += formaterMatch(m) + "\n"; }
    }

    let message = "";
    if (direct) message += `——————————————\n🔴 EN DIRECT / MI-TEMPS\n${direct}`;
    if (TERMINES.length) {
      message += `\n——————————————\n🏁 FINAL SCORES\n`;
      TERMINES.forEach(m => message += formaterMatch(m, true) + "\n");
    }
    if (message) await publier(message);
  } catch (e) { console.error("❌", e); }
}

// 🛡️ Anti-sommeil Render
app.get('/', (req, res) => res.send("⚽ Actif"));
app.listen(PORT, () => {
  console.log("🚀 Démarré | 14min");
  surveiller();
  setInterval(surveiller, 14 * 60 * 1000);
});
