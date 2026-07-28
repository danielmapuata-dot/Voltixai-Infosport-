require('dotenv').config();
const express = require('express');
const https = require('https');

// --------------------------
// 🛡️ Variables d'environnement (à mettre sur Render)
// --------------------------
const SPORTSRC_API_KEY = process.env.SPORTSRC_API_KEY || '';
const FACEBOOK_TOKEN = process.env.FACEBOOK_TOKEN || '';
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID || '';

const app = express();
const PORT = process.env.PORT || 10000; // Port standard Render
const etatMatchs = new Map(); // Évite doublons

// --------------------------
// 📡 URLs API
// --------------------------
const SPORTSRC_LIVE = 'https://api.sportsrc.io/v1/livescore';
const ESPN_STATS_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';

// --------------------------
// 🛠️ Fonctions API
// --------------------------
function appelAPI(url, headers = {}) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const opt = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'X-API-Key': SPORTSRC_API_KEY, ...headers }
    };
    const req = https.get(opt, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          if (res.statusCode >= 400) throw new Error(`HTTP ${res.statusCode}`);
          res(JSON.parse(d));
        } catch(e) { rej(e.message); }
      });
    });
    req.on('error', rej);
  });
}

// Fetch pour ESPN (natif dans Node)
global.fetch = (url) => new Promise((res) => {
  const u = new URL(url);
  https.get(u, (r) => {
    let b = '';
    r.on('data', c => b += c);
    r.on('end', () => res({ ok: r.statusCode < 400, json: () => JSON.parse(b) }));
  }).on('error', () => res({ ok: false }));
});

// --------------------------
// 🎨 Format d'affichage
// --------------------------
function getDrapeau(pays) {
  if (!pays) return "🏳️";
  const p = pays.toLowerCase();
  if (p.includes("bulgaria")) return "🇧🇬";
  if (p.includes("china")) return "🇨🇳";
  if (p.includes("france")) return "🇫🇷";
  if (p.includes("brazil")) return "🇧🇷";
  if (p.includes("congo")) return "🇨🇩";
  return "🏳️";
}

function formaterMatch(match, stats = {}) {
  const l = match.league?.name || "Championnat";
  const dom = match.home?.name || "Domicile";
  const ext = match.away?.name || "Extérieur";
  const s = match.scores || {};
  const mt = s.halftime || { home:0, away:0 };
  const min = match.status === 'halftime' ? "⏸️ MI-TEMPS" : `⏱️ ${match.minute || 0}'`;

  const c = stats.corners || { home:0, away:0 };
  const t = stats.shotsOnTarget || { home:0, away:0 };
  const pos = stats.possession || { home:0, away:0 };
  const jn = stats.yellowCards || { home:0, away:0 };
  const r = stats.redCards || { home:0, away:0 };
  const off = stats.offsides || { home:0, away:0 };
  const f = stats.fouls || { home:0, away:0 };

  return `
${getDrapeau(match.league?.country)} 🏆 ${l.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━
⚽ ${dom}  vs  ${ext}
📊 SCORE : ${s.home ?? 0} - ${s.away ?? 0}
${min}
🔹 Mi-temps : ${mt.home} - ${mt.away}
📍 Corners : ${c.home} - ${c.away}
🎯 Tirs cadrés : ${t.home} - ${t.away}
🅿️ Possession : ${pos.home}% - ${pos.away}%
🟨 Jaunes : ${jn.home} - ${jn.away}
🟥 Rouges : ${r.home} - ${r.away}
⛔ Hors-jeu : ${off.home} - ${off.away}
❌ Fautes : ${f.home} - ${f.away}
━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

// --------------------------
// 📥 Stats ESPN
// --------------------------
async function getStatsESPN(m) {
  try {
    const url = `${ESPN_STATS_BASE}${(m.league?.slug || '')}/event/${m.espnId || ''}/statistics`;
    const res = await fetch(url);
    return res.ok ? await res.json() : {};
  } catch { return {}; }
}

// --------------------------
// 📤 Publication Facebook
// --------------------------
async function publier(texte) {
  const h = new Date().toLocaleTimeString('fr-FR', {timeZone:'GMT', hour:'2-digit', minute:'2-digit'});
  const msg = `⚡ VOLTIXAI LIVE SCORE ⚡ 🕒 ${h} GMT
${texte}

🔴 SUIVEZ TOUS LES MATCHS EN DIRECT !
#VoltixaiLiveScore #Football #MatchEnDirect`;

  await appelAPI(`https://graph.facebook.com/v21.0/${FACEBOOK_PAGE_ID}/feed`,
    { Authorization: `Bearer ${FACEBOOK_TOKEN}`, 'Content-Type': 'application/json' },
    { method: 'POST', body: JSON.stringify({ message: msg }) }
  );
  console.log("✅ Publié");
}

// --------------------------
// 🔄 SURVEILLANCE TOUTES LES 3 MINUTES (SUR RENDER)
// --------------------------
async function surveiller() {
  try {
    const data = await appelAPI(SPORTSRC_LIVE);
    const matchs = data.data || [];
    let contenu = "";

    for (const m of matchs) {
      const cle = `${m.id}-${m.scores?.home}-${m.scores?.away}-${m.minute}`;
      if (!etatMatchs.has(cle)) {
        etatMatchs.set(cle, true);
        const stats = await getStatsESPN(m);
        contenu += formaterMatch(m, stats) + "\n\n";
      }
    }

    if (contenu) await publier(contenu);
    else console.log("⏳ Rien de nouveau");

  } catch (e) {
    console.error("❌ Erreur :", e);
  }
}

// 🛡️ Anti-sommeil Render
app.get('/', (req, res) => res.send("✅ VOLTIXAI ACTIF | Vérif toutes les 3min"));

// 🚀 Démarrage
app.listen(PORT, () => {
  console.log(`🚀 Render sur port ${PORT}`);
  surveiller(); // Exécute tout de suite
  setInterval(surveiller, 3 * 60 * 1000); // Puis toutes les 3min
});
