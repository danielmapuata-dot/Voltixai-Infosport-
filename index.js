require('dotenv').config();
const express = require('express');
const https = require('https');

// 🔒 Variables d'environnement
const SPORT_SRC_KEY = process.env.SPORT_SRC_KEY || '';
const FACEBOOK_TOKEN = process.env.FACEBOOK_TOKEN || '';
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID || '';

const app = express();
const PORT = process.env.PORT || 3001;

// 📂 Évite de publier 2 fois la même chose
const etatMatchs = new Map();

// 🛡️ En-têtes SportSRC
const headersAPI = {
  'X-API-KEY': SPORT_SRC_KEY,
  'Accept': 'application/json'
};

// 📞 Fonction appel API
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

// 📝 Formatage match EN DIRECT
function formaterMatch(match) {
  const l = match.league || { name: "Championnat", country: "" };
  const h = match.teams?.home || { name: "Domicile" };
  const a = match.teams?.away || { name: "Extérieur" };
  const s = match.scores || {};
  const ht = s.halftime || { home: 0, away: 0 };

  const drapeau = getDrapeau(l.country);
  const minute = match.status === 'halftime' ? "MI-TEMPS" : `${match.minute || 0}'`;

  // Stats
  const c = match.statistics?.corners || { home:0, away:0 };
  const t = match.statistics?.shots_on_target || { home:0, away:0 };

  return `
${drapeau} 🏆 ${l.name}
⏱️ ${minute} | ${h.name} ${s.home ?? 0} - ${s.away ?? 0} ${a.name}
🔹 Mi-temps : ${ht.home} - ${ht.away}
🚩 Corners : ${c.home}-${c.away} | 🎯 Tirs cadrés : ${t.home}-${t.away}
——————————————`;
}

// 📤 Publication Facebook
async function publier(message) {
  const heure = new Date().toLocaleTimeString('fr-FR', {timeZone:'GMT', hour:'2-digit', minute:'2-digit'});
  const entete = `⚽🚩 VOLTIXAI - MATCHS EN DIRECT 🕒 ${heure} GMT\n`;
  const pied = `\n#VoltixaiLive #Direct #Football`;
  const msg = entete + message + pied;

  try {
    await appelAPI(`https://graph.facebook.com/v21.0/${FACEBOOK_PAGE_ID}/feed`,
      { Authorization: `Bearer ${FACEBOOK_TOKEN}`, 'Content-Type': 'application/json' },
      { message: msg }
    );
    console.log("✅ Publié en direct");
  } catch (e) {
    console.error("❌ Erreur :", e.message);
  }
}

// 🔄 Vérification des matchs EN DIRECT
async function surveillerDirect() {
  try {
    console.log("\n🔍 Vérification matchs en direct...");
    const data = await appelAPI("https://api.sportsrc.org/v2/?type=matches&sport=football&status=inprogress");
    const matchs = data.data || [];

    let contenu = "";

    for (const m of matchs) {
      const cle = `${m.id}-${m.scores?.home}-${m.scores?.away}`;
      if (!etatMatchs.has(cle)) {
        etatMatchs.set(cle, true);
        contenu += formaterMatch(m);
      }
    }

    if (contenu) await publier(contenu);
    else console.log("Aucun changement en direct");

  } catch (e) {
    console.error("Erreur :", e);
  }
}

// 🛡️ Anti-sommeil Render
app.get('/', (req, res) => res.send("⚽ En direct - OK"));
app.listen(PORT, () => {
  console.log(`🚀 Port ${PORT} | Vérification toutes les 14min`);
  surveillerDirect();
  setInterval(surveillerDirect, 14 * 60 * 1000);
});
