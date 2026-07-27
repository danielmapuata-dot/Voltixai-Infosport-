Require('dotenv').config();
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
  if (nom.includes("romania") || nom.includes("roumanie")) return "🇷🇴";
  if (nom.includes("china")) return "🇨🇳";
  if (nom.includes("intl")) return "🌍";
  if (nom.includes("france")) return "🇫🇷";
  if (nom.includes("brazil")) return "🇧🇷";
  if (nom.includes("congo")) return "🇨🇩";
  return "🏳️";
}

// ✅ EXTRACTION DES NOMS DES ÉQUIPES (Gère tous les formats SportSRC)
function extractTeamName(teamObj, fallbackName) {
  if (!teamObj) return fallbackName;
  if (typeof teamObj === 'string') return teamObj;
  return teamObj.name || teamObj.title || teamObj.team_name || fallbackName;
}

function formaterMatch(match) {
  // Nom de la ligue
  const leagueName = match.league?.name || match.league || match.competition || "CHAMPIONNAT";
  
  // Extraction robuste des noms d'équipes
  const homeName = extractTeamName(match.teams?.home || match.home_team || match.home_name || match.home, "Équipe A");
  const awayName = extractTeamName(match.teams?.away || match.away_team || match.away_name || match.away, "Équipe B");

  // Scores
  const homeScore = match.scores?.home ?? match.home_score ?? 0;
  const awayScore = match.scores?.away ?? match.away_score ?? 0;
  
  const htHome = match.scores?.halftime?.home ?? match.halftime_score?.home ?? 0;
  const htAway = match.scores?.halftime?.away ?? match.halftime_score?.away ?? 0;

  const drapeau = getDrapeau(match.country || match.league?.country);
  const minute = match.status === 'halftime' ? "⏸️ MI-TEMPS" : `⏱️ ${match.minute || 0}'`;

  // Statistiques
  const cornersHome = match.statistics?.corners?.home ?? match.corners?.home ?? 0;
  const cornersAway = match.statistics?.corners?.away ?? match.corners?.away ?? 0;
  
  const shotsHome = match.statistics?.shots_on_target?.home ?? match.shots_on_target?.home ?? 0;
  const shotsAway = match.statistics?.shots_on_target?.away ?? match.shots_on_target?.away ?? 0;

  return `
${drapeau} 🏆 ${leagueName.toString().toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━
⚽ ${homeName}  vs  ${awayName}
📊 SCORE : ${homeScore} - ${awayScore}
${minute}
🔹 Mi-temps : ${htHome} - ${htAway}
📍 Corners : ${cornersHome} - ${cornersAway}
🎯 Tirs cadrés : ${shotsHome} - ${shotsAway}
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
    console.log("✅ Publication Facebook réussie !");
  } catch (e) {
    console.error("❌ Erreur FB :", e.message);
  }
}

async function surveillerDirect() {
  try {
    console.log("\n🔍 Vérification SportSRC...");
    const data = await appelAPI("https://api.sportsrc.org/v2/?type=matches&sport=football&status=inprogress");
    
    // Supporte data.data ou data directement
    const matchs = Array.isArray(data) ? data : (data.data || []);

    let contenu = "";

    for (const m of matchs) {
      const homeScore = m.scores?.home ?? m.home_score ?? 0;
      const awayScore = m.scores?.away ?? m.away_score ?? 0;
      
      const cle = `${m.id}-${homeScore}-${awayScore}-${m.minute}`;
      if (!etatMatchs.has(cle)) {
        etatMatchs.set(cle, true);
        contenu += formaterMatch(m) + "\n\n";
      }
    }

    if (contenu.trim()) {
      await publier(contenu);
    } else {
      console.log("✅ Pas de changement dans les matchs en cours.");
    }

  } catch (e) {
    console.error("❌ Erreur lors de la récupération des données :", e);
  }
}

app.get('/', (req, res) => res.send("⚽ SERVICE ACTIF - VOLTIXAI LIVE"));
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  surveillerDirect();
  setInterval(surveillerDirect, 3 * 60 * 1000);
});
