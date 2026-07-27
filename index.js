require('dotenv').config();
const express = require('express');
const https = require('https');

// 🔒 Configuration SportSRC (BONNE CLÉ + BON EN-TÊTE)
const SPORT_SRC_KEY = process.env.SPORT_SRC_KEY || '';
const FACEBOOK_TOKEN = process.env.FACEBOOK_TOKEN || '';
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID || '';

const app = express();
const PORT = process.env.PORT || 3001;

// 📂 État : évite doublons et suit les matchs terminés
const suivisMatchs = new Map();
const TERMINES = [];

// 🛡️ EN-TÊTES CORRIGÉS : X-API-KEY (PAS Bearer !)
const headersAPI = {
  'X-API-KEY': SPORT_SRC_KEY,
  'Accept': 'application/json'
};

// 📞 Fonction appel API robuste
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
            ? rejeter(new Error(`Erreur ${res.statusCode}: ${JSON.stringify(parsed)}`))
            : resoudre(parsed);
        } catch (e) {
          rejeter(new Error(`Réponse non JSON : ${data.substring(0,200)}`));
        }
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
  if (nom.includes("congo")) return "🇨🇩";
  return "🏳️";
}

// 📊 Statistiques de base
function formaterStats(match) {
  const stats = match.statistics || {};
  return {
    cornes: stats.corners ? `${stats.corners.home ?? 0}-${stats.corners.away ?? 0}` : "0-0",
    pos: stats.possession ? `${stats.possession.home ?? '50%'}-${stats.possession.away ?? '50%'}` : "50%-50%",
    cartonJ: stats.yellow_cards ? `${stats.yellow_cards.home ?? 0}-${stats.yellow_cards.away ?? 0}` : "0-0"
  };
}

// 📝 Formatage match
function formaterMatch(match, estTermine = false) {
  const l = match.league || { name: "Championnat", country: "" };
  const h = match.teams?.home || { name: "Domicile" };
  const a = match.teams?.away || { name: "Extérieur" };
  const scores = match.scores || {};
  const butH = scores.home ?? 0;
  const butA = scores.away ?? 0;
  const ht = scores.halftime || { home: 0, away: 0 };
  const mt = Math.max(0, butH - ht.home);
  const at = Math.max(0, butA - ht.away);

  const drapeau = getDrapeau(l.country);
  const minute = match.status === 'inprogress' ? `${match.minute ?? 0}'` : match.status === 'halftime' ? 'HT' : 'FT';
  const stats = formaterStats(match);

  let bloc = `${drapeau} ${l.name}\n`;
  bloc += `● ${minute} | ${h.name} ${butH}-${butA} ${a.name}\n`;
  bloc += `➡️ 1st Half: ${ht.home}-${ht.away} | 2nd Half: ${mt}-${at}\n`;
  bloc += `🚩 Corners: ${stats.cornes} | 🟨 Yellow: ${stats.cartonJ} | 🅿️ Poss: ${stats.pos}\n`;

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

// 🔄 Surveillance TOUTES LES 14 MINUTES
async function surveiller() {
  try {
    console.log("\n🔍 Vérification matchs SportSRC...");
    // ✅ URL EXACTE SELON LA DOC : type=matches, sport=football, status=inprogress
    const url = "https://api.sportsrc.org/v2/?type=matches&sport=football&status=inprogress";
    const res = await appelAPI(url);
    const matchsDirect = res.data || res || [];

    let sectionDirect = "";

    for (const match of matchsDirect) {
      if (!match.id) continue;
      const id = match.id;
      const statut = (match.status || "").toLowerCase();
      const cleEtat = `${statut}-${match.scores?.home}-${match.scores?.away}`;

      if (!suivisMatchs.has(id)) suivisMatchs.set(id, { dejaVu: new Set() });
      const suivi = suivisMatchs.get(id);

      if (["finished", "completed"].includes(statut) && !suivi.estTermine) {
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
app.get('/', (req, res) => res.send("⚽ Voltixai SportSRC - 1000 req/jour, actif"));
app.listen(PORT, () => {
  console.log(`🚀 Port ${PORT} | Vérification toutes les 14min`);
  surveiller();
  setInterval(surveiller, 14 * 60 * 1000);
});
