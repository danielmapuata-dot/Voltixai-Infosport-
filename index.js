require('dotenv').config();
const express = require('express');
const https = require('https');

// --------------------------
// 🛡️ Variables d'environnement
// --------------------------
const SPORTSRC_API_KEY = process.env.SPORTSRC_API_KEY || '';
const FACEBOOK_TOKEN = process.env.FACEBOOK_TOKEN || '';
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID || '';

const app = express();
const PORT = process.env.PORT || 3000;
const etatMatchs = new Map(); // Évite doublons

// --------------------------
// 📡 URLs API
// --------------------------
const SPORTSRC_LIVE = 'https://api.sportsrc.io/v1/livescore';
const ESPN_STATS_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';

// --------------------------
// 🛠️ Fonction appel API (CORRIGÉE)
// --------------------------
function appelAPI(url, headers = {}) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const opt = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'X-API-Key': SPORTSRC_API_KEY, ...headers }
    };
    const req = https.get(opt, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          if (res.statusCode >= 400) throw new Error(`HTTP ${res.statusCode}: ${d}`);
          res(JSON.parse(d));
        } catch(e) { rej(d || e.message); }
      });
    });
    req.on('error', rej);
  });
}

// Ajout de fetch global pour ESPN
global.fetch = function(url, opts) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const req = https.get(u, (resFetch) => {
      let d = '';
      resFetch.on('data', c => d += c);
      resFetch.on('end', () => {
        res({ ok: resFetch.statusCode >= 200 && resFetch.statusCode < 300, json: () => JSON.parse(d) });
      });
    });
    req.on('error', rej);
  });
};

// --------------------------
// 🎨 Style d'affichage
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

function formaterMatch(match, statsESPN = {}) {
  const ligue = match.league?.name || "Championnat";
  const pays = match.league?.country || "";
  const dom = match.home?.name || "Domicile";
  const ext = match.away?.name || "Extérieur";
  const score = `${match.scores?.home ?? 0} - ${match.scores?.away ?? 0}`;
  const mt = match.scores?.halftime ? `${match.scores.halftime.home} - ${match.scores.halftime.away}` : "0 - 0";
  const minute = match.status === 'halftime' ? "⏸️ MI-TEMPS" : `⏱️ ${match.minute || 0}'`;

  const corners = statsESPN.corners || { home:0, away:0 };
  const tirs = statsESPN.shotsOnTarget || { home:0, away:0 };
  const pos = statsESPN.possession || { home:0, away:0 };
  const cartJ = statsESPN.yellowCards || { home:0, away:0 };
  const cartR = statsESPN.redCards || { home:0, away:0 };
  const horsJeu = statsESPN.offsides || { home:0, away:0 };
  const fautes = statsESPN.fouls || { home:0, away:0 };

  return `
${getDrapeau(pays)} 🏆 ${ligue.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━
⚽ ${dom}  vs  ${ext}
📊 SCORE : ${score}
${minute}
🔹 Mi-temps : ${mt}
📍 Corners : ${corners.home} - ${corners.away}
🎯 Tirs cadrés : ${tirs.home} - ${tirs.away}
🅿️ Possession : ${pos.home}% - ${pos.away}%
🟨 Jaunes : ${cartJ.home} - ${cartJ.away}
🟥 Rouges : ${cartR.home} - ${cartR.away}
⛔ Hors-jeu : ${horsJeu.home} - ${horsJeu.away}
❌ Fautes : ${fautes.home} - ${fautes.away}
━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

// --------------------------
// 📥 Récup stats ESPN
// --------------------------
async function getStatsESPN(match) {
  try {
    const lien = `${ESPN_STATS_BASE}${(match.league?.slug || '').toLowerCase()}/event/${match.espnId || ''}/statistics`;
    const res = await fetch(lien);
    if (!res.ok) return {};
    return await res.json();
  } catch (e) {
    return {};
  }
}

// --------------------------
// 📤 Publication Facebook
// --------------------------
async function publier(texte) {
  const heure = new Date().toLocaleTimeString('fr-FR', {timeZone:'GMT', hour:'2-digit', minute:'2-digit'});
  const entete = `⚡ VOLTIXAI LIVE SCORE ⚡ 🕒 ${heure} GMT\n`;
  const pied = `\n🔴 SUIVEZ TOUS LES MATCHS EN DIRECT !
#VoltixaiLiveScore #Football #MatchEnDirect`;

  const msg = entete + texte + pied;

  await appelAPI(`https://graph.facebook.com/v21.0/${FACEBOOK_PAGE_ID}/feed`,
    { Authorization: `Bearer ${FACEBOOK_TOKEN}`, 'Content-Type': 'application/json' },
    { method: 'POST', body: JSON.stringify({ message: msg }) }
  );
  console.log("✅ Publié");
}

// --------------------------
// 🔄 Routes et lancement
// --------------------------
app.get('/', (req, res) => res.send("⚡ VOLTIXAI - SERVICE ACTIF"));

// Endpoint SANS secret
app.post('/api/publish/trigger', express.json(), async (req, res) => {
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
    res.json({success:true, matchCount: matchs.length});
  } catch (e) {
    console.error(e);
    res.status(500).json({success:false, error:e.message});
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Port ${PORT} | Prêt /api/publish/trigger`);
});
