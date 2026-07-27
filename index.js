require('dotenv').config();
const express = require('express');
const https = require('https');

// 🔒 Configuration SportSRC + Facebook
const SPORT_SRC_KEY = process.env.SPORT_SRC_KEY || '';
const FACEBOOK_TOKEN = process.env.FACEBOOK_TOKEN || '';
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID || '';

const app = express();
const PORT = process.env.PORT || 3001;

// 📂 État : évite doublons et suit les matchs terminés
const suivisMatchs = new Map();
const TERMINES = [];

// 🛡️ En-têtes SportSRC
const headersAPI = {
  'Authorization': `Bearer ${SPORT_SRC_KEY}`,
  'Content-Type': 'application/json'
};

// 📞 Fonction appel API
function appelAPI(url, customHeaders = {}, bodyData = null) {
  return new Promise((resoudre, rejeter) => {
    const urlObj = new URL(url);
    const estFacebook = urlObj.hostname.includes('facebook.com');

    const finalHeaders = estFacebook 
      ? { ...customHeaders } 
      : { ...headersAPI, ...customHeaders };

    const payload = bodyData ? JSON.stringify(bodyData) : null;
    if (payload && !finalHeaders['Content-Length']) {
      finalHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: bodyData ? 'POST' : 'GET',
      headers: finalHeaders
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          res.statusCode >= 400 
            ? rejeter(new Error(`Erreur ${res.statusCode}: ${parsed.message || ''}`))
            : resoudre(parsed);
        } catch (e) { rejeter(e); }
      });
    });
    req.on('error', rejeter);
    if (payload) req.write(payload);
    req.end();
  });
}

// 🚩 Drapeau par pays
function getDrapeau(pays) {
  if (!pays) return "🏳️";
  const nom = pays.toLowerCase();
  if (nom.includes("france")) return "🇫🇷";
  if (nom.includes("brazil")) return "🇧🇷";
  if (nom.includes("england")) return "🏴󠁧󠁢󠁥󠁮󠁧󠁿";
  if (nom.includes("spain")) return "🇪🇸";
  if (nom.includes("italy")) return "🇮🇹";
  if (nom.includes("australia")) return "🇦🇺";
  if (nom.includes("china")) return "🇨🇳";
  if (nom.includes("uk") || nom.includes("angleterre")) return "🇬🇧";
  if (nom.includes("congo")) return "🇨🇩";
  return "🏳️";
}

// 📊 Statistiques formatées
function formaterStats(match) {
  const stats = match.statistics || {};
  return {
    cornes: `${stats.home?.corners ?? 0}-${stats.away?.corners ?? 0}`,
    pos: `${stats.home?.possession ?? '50%'}-${stats.away?.possession ?? '50%'}`,
    tirsCadres: `${stats.home?.shots_on_target ?? 0}-${stats.away?.shots_on_target ?? 0}`,
    cartonJ: `${stats.home?.yellow_cards ?? 0}-${stats.away?.yellow_cards ?? 0}`,
    cartonR: `${stats.home?.red_cards ?? 0}-${stats.away?.red_cards ?? 0}`
  };
}

// 📝 Formatage match
function formaterMatch(match, estTermine = false) {
  const l = match.league;
  const h = match.teams.home;
  const a = match.teams.away;
  const butH = match.scores.home ?? 0;
  const butA = match.scores.away ?? 0;
  const ht = match.scores.halftime || { home: 0, away: 0 };
  const mt = Math.max(0, butH - ht.home);
  const at = Math.max(0, butA - ht.away);

  const drapeau = getDrapeau(l.country);
  const minute = match.status === 'live' ? `${match.minute ?? 0}'` : match.status === 'halftime' ? 'HT' : 'FT';
  const stats = formaterStats(match);

  let bloc = `${drapeau} ${l.name}\n`;
  bloc += `● ${minute} | ${h.name} ${butH}-${butA} ${a.name}\n`;
  bloc += `➡️ 1st Half: ${ht.home}-${ht.away} | 2nd Half: ${mt}-${at}\n`;
  bloc += `🚩 Corners: ${stats.cornes} | 🟨 Yellow: ${stats.cartonJ} | 🟥 Red: ${stats.cartonR}\n`;
  bloc += `🎯 Shots on: ${stats.tirsCadres} | 🅿️ Poss: ${stats.pos}\n`;

  return bloc;
}

// 📤 Publication Facebook
async function publier(message) {
  const heureGMT = new Date().toLocaleTimeString('fr-FR', { timeZone: 'GMT', hour: '2-digit', minute: '2-digit' });
  const entete = `⚽🚩 VOLTIXAI LIVE SCORE ⚽ ${heureGMT} - GMT\n`;
  const pied = `\n——————————————\n#VoltixaiLive #LiveScore #Football`;
  const msgFinal = entete + message + pied;

  try {
    const url = `https://graph.facebook.com/v21.0/${FACEBOOK_PAGE_ID}/feed`;
    await appelAPI(url, { Authorization: `Bearer ${FACEBOOK_TOKEN}`, 'Content-Type': 'application/json' }, { message: msgFinal });
    console.log("✅ Publié sur Facebook");
  } catch (err) {
    console.error("❌ Erreur publication :", err.message);
  }
}

// 🔄 Surveillance toutes les 14min
async function surveiller() {
  try {
    console.log("\n🔍 Vérification matchs SportSRC...");
    const res = await appelAPI("https://api.sportsrc.org/v2/matches/live");
    const matchsDirect = res.data || [];

    let sectionDirect = "";

    for (const match of matchsDirect) {
      const id = match.id;
      const statut = match.status;
      const cleEtat = `${statut}-${match.scores.home}-${match.scores.away}`;

      if (!suivisMatchs.has(id)) suivisMatchs.set(id, { dejaVu: new Set() });
      const suivi = suivisMatchs.get(id);

      if (["finished", "full-time"].includes(statut.toLowerCase()) && !suivi.estTermine) {
        suivi.estTermine = true;
        TERMINES.unshift(match);
        if (TERMINES.length > 20) TERMINES.pop();
        continue;
      }

      if (!suivi.dejaVu.has(cleEtat)) {
        suivi.dejaVu.add(cleEtat);
        sectionDirect += formaterMatch(match) + "\n";
      }
    }

    let messageComplet = "";
    if (sectionDirect) messageComplet += `——————————————\n🔴 EN DIRECT / MI-TEMPS\n${sectionDirect}`;
    if (TERMINES.length > 0) {
      messageComplet += `\n——————————————\n🏁 MATCHS TERMINÉS\n`;
      for (const m of TERMINES) messageComplet += formaterMatch(m, true) + "\n";
    }

    if (messageComplet) await publier(messageComplet);
    else console.log("ℹ️ Rien de nouveau");

  } catch (e) {
    console.error("❌ Erreur :", e.message);
  }
}

// 🛡️ Anti-sommeil Render
app.get('/', (req, res) => res.send("⚽ Voltixai SportSRC - Actif"));
app.listen(PORT, () => {
  console.log(`🚀 Port ${PORT} | Vérification toutes les 14min`);
  surveiller();
  setInterval(surveiller, 14 * 60 * 1000);
});
