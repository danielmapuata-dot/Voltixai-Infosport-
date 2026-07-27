require('dotenv').config();
const express = require('express');
const https = require('https');

// 🔒 Variables d'environnement
const SPORT_SRC_KEY = process.env.SPORT_SRC_KEY || '';
const FACEBOOK_TOKEN = process.env.FACEBOOK_TOKEN || '';
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID || '';

const app = express();
const PORT = process.env.PORT || 3001;

// 📂 Évite doublons (clé précise)
const etatMatchs = new Map();

// 🛡️ En-têtes SportSRC
const headersAPI = {
  'X-API-KEY': SPORT_SRC_KEY,
  'Accept': 'application/json'
};

// 📞 Appel API
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

// 🚩 Drapeaux par pays
function getDrapeau(pays) {
  if (!pays) return "🏳️";
  const nom = pays.toLowerCase();
  if (nom.includes("china")) return "🇨🇳";
  if (nom.includes("intl")) return "🌍";
  if (nom.includes("france")) return "🇫🇷";
  if (nom.includes("brazil")) return "🇧🇷";
  if (nom.includes("congo")) return "🇨🇩";
  return "🏳️";
}

// 📝 FORMAT EXACT STYLE "SCORE ZONE LIVE"
function formaterMatch(match) {
  const l = match.league || { name: "Championnat" };
  const h = match.teams?.home || { name: "DOMICILE" };
  const a = match.teams?.away || { name: "EXTÉRIEUR" };
  const s = match.scores || { home: 0, away: 0 };
  const ht = s.halftime || { home: 0, away: 0 };

  const drapeau = getDrapeau(match.country);
  const minute = match.status === 'halftime' ? "⏸️ MI-TEMPS" : `⏱️ ${match.minute || 0}'`;

  // Stats propres
  const corners = match.statistics?.corners || { home: 0, away: 0 };
  const tirs = match.statistics?.shots_on_target || { home: 0, away: 0 };

  return `
${drapeau} 🏆 ${l.name.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━
⚽ ${h.name}  vs  ${a.name}
📊 SCORE : ${s.home} - ${s.away}
${minute}
🔹 Mi-temps : ${ht.home} - ${ht.away}
📍 Corners : ${corners.home} - ${corners.away}
🎯 Tirs cadrés : ${tirs.home} - ${tirs.away}
━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

// 📤 Publication FACEBOOK
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
    console.log("✅ Publication parfaite (sans doublon)");
  } catch (e) {
    console.error("❌ Erreur FB :", e.message);
  }
}

// 🔄 SURVEILLANCE
async function surveillerDirect() {
  try {
    console.log("\n🔍 Vérification SportSRC...");
    const data = await appelAPI("https://api.sportsrc.org/v2/?type=matches&sport=football&status=inprogress");
    const matchs = data.data || [];

    let contenu = "";

    for (const m of matchs) {
      // Clé UNIQUE : ID + score + minute → JAMAIS DE DOUBLON
      const cle = `${m.id}-${m.scores?.home}-${m.scores?.away}-${m.minute}`;
      if (!etatMatchs.has(cle)) {
        etatMatchs.set(cle, true);
        contenu += formaterMatch(m) + "\n\n";
      }
    }

    if (contenu) await publier(contenu);
    else console.log("✅ Aucun changement, pas de doublon");

  } catch (e) {
    console.error("❌ Erreur :", e);
  }
}

// 🛡️ Anti-sommeil Render
app.get('/', (req, res) => res.send("⚽ VOLTIXAI LIVE - SERVICE ACTIF"));
app.listen(PORT, () => {
  console.log(`🚀 Serveur sur le port ${PORT} | Vérification toutes les 3 minutes`);
  surveillerDirect();
  setInterval(surveillerDirect, 3 * 60 * 1000); // ⚡ Toutes les 3 min
});
