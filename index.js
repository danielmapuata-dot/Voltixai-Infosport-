require('dotenv').config();
const express = require('express');
const https = require('https');

const SPORT_SRC_KEY = process.env.SPORT_SRC_KEY || '';
const FACEBOOK_TOKEN = process.env.FACEBOOK_TOKEN || '';
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID || '';

const app = express();
const PORT = process.env.PORT || 3001;
const etatMatchs = new Map();

const headersAPI = {
  'X-API-KEY': SPORT_SRC_KEY,
  'Accept': 'application/json'
};

function appelAPI(url, customHeaders = {}, body = null) {
  return new Promise((resoudre, rejeter) => {
    const urlObj = new URL(url);
    const estFacebook = urlObj.hostname.includes('facebook.com');
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: body ? 'POST' : 'GET',
      headers: estFacebook ? customHeaders : { ...headersAPI, ...customHeaders }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resoudre(JSON.parse(data)); }
        catch (e) { rejeter("Erreur JSON : " + data.substring(0,150)); }
      });
    });
    req.on('error', rejeter);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function getDrapeau(pays) {
  if (!pays) return "🏳️";
  const nom = pays.toLowerCase();
  if (nom.includes("bulgaria") || nom.includes("bulgare")) return "🇧🇬";
  if (nom.includes("china")) return "🇨🇳";
  if (nom.includes("intl")) return "🌍";
  if (nom.includes("france")) return "🇫🇷";
  if (nom.includes("brazil")) return "🇧🇷";
  if (nom.includes("congo")) return "🇨🇩";
  return "🏳️";
}

// ✅ CORRECTION : récupération des vrais noms (selon structure SportSRC)
function formaterMatch(match) {
  const l = match.league || { name: "Championnat" };
  // Ici on prend les bons champs : home_name / away_name (ou home/away)
  const homeName = match.home_name || match.home || "Équipe Domicile";
  const awayName = match.away_name || match.away || "Équipe Extérieur";
  const s = match.scores || { home: 0, away: 0 };
  const ht = s.halftime || { home: 0, away: 0 };

  const drapeau = getDrapeau(match.country);
  const minute = match.status === 'halftime' ? "⏸️ MI-TEMPS" : `⏱️ ${match.minute || 0}'`;

  const corners = match.statistics?.corners || { home: 0, away: 0 };
  const tirs = match.statistics?.shots_on_target || { home: 0, away: 0 };

  return `
${drapeau} 🏆 ${l.name.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━
⚽ ${homeName}  vs  ${awayName}
📊 SCORE : ${s.home} - ${s.away}
${minute}
🔹 Mi-temps : ${ht.home} - ${ht.away}
📍 Corners : ${corners.home} - ${corners.away}
🎯 Tirs cadrés : ${tirs.home} - ${tirs.away}
━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

async function publier(message) {
  const heure = new Date().toLocaleTimeString('fr-FR', {timeZone:'GMT', hour:'2-digit', minute:'2-digit'});
  const entete = `⚡ VOLTIXAI LIVE SCORE ⚡ 🕒 ${heure} GMT\n`;
  const pied = `\n🔴 SUIVEZ TOUS LES MATCHS EN DIRECT !
#Voltixai #LiveScore #Football #MatchEnDirect`;

  const msg = entete + message + pied;

  try {
    await appelAPI(`https://graph.facebook.com/v21.0/${FACEBOOK_PAGE_ID}/feed`,
      { Authorization: `Bearer ${FACEBOOK_TOKEN}`, 'Content-Type': 'application/json' },
      { message: msg }
    );
    console.log("✅ Publié avec vrais noms");
  } catch (e) {
    console.error("❌ Erreur FB :", e.message);
  }
}

async function surveillerDirect() {
  try {
    console.log("\n🔍 Vérification SportSRC...");
    const data = await appelAPI("https://api.sportsrc.org/v2/?type=matches&sport=football&status=inprogress");
    const matchs = data.data || [];

    let contenu = "";

    for (const m of matchs) {
      const cle = `${m.id}-${m.scores?.home}-${m.scores?.away}-${m.minute}`;
      if (!etatMatchs.has(cle)) {
        etatMatchs.set(cle, true);
        contenu += formaterMatch(m) + "\n\n";
      }
    }

    if (contenu) await publier(contenu);
    else console.log("✅ Rien de nouveau");

  } catch (e) {
    console.error("❌ Erreur :", e);
  }
}

app.get('/', (req, res) => res.send("⚽ SERVICE ACTIF - VRAIS NOMS"));
app.listen(PORT, () => {
  console.log(`🚀 Port ${PORT} | Toutes les 3min`);
  surveillerDirect();
  setInterval(surveillerDirect, 3 * 60 * 1000);
});
