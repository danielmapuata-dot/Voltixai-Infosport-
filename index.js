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
    try {
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
          catch (e) { rejeter("Erreur JSON : " + data.substring(0, 150)); }
        });
      });
      req.on('error', (e) => rejeter(e));
      if (body) req.write(JSON.stringify(body));
      req.end();
    } catch (e) {
      rejeter(e);
    }
  });
}

function getDrapeau(pays) {
  if (!pays) return "🇷🇴"; // Drapeau Roumanie par défaut selon la capture
  const nom = String(pays).toLowerCase();
  if (nom.includes("romania") || nom.includes("roumanie") || nom.includes("româniei")) return "🇷🇴";
  if (nom.includes("bulgaria") || nom.includes("bulgare")) return "🇧🇬";
  if (nom.includes("france")) return "🇫🇷";
  if (nom.includes("brazil") || nom.includes("brésil")) return "🇧🇷";
  if (nom.includes("congo")) return "🇨🇩";
  if (nom.includes("england") || nom.includes("angleterre")) return "🏴󠁧󠁢󠁥󠁮󠁧󠁿";
  if (nom.includes("spain") || nom.includes("espagne")) return "🇪🇸";
  return "🌍";
}

// 🔍 Détecteur universel pour extraire le nom d'une équipe
function trouverNomEquipe(match, type) {
  const isHome = type === 'home';

  // 1. Recherche dans les objets imbriqués courants
  const candidats = isHome ? [
    match.homeTeam?.name, match.homeTeam,
    match.home_team?.name, match.home_team,
    match.teams?.home?.name, match.teams?.home,
    match.teams?.[0]?.name, match.teams?.[0],
    match.participants?.[0]?.name, match.participants?.[0],
    match.home_name, match.home, match.team1, match.team_home
  ] : [
    match.awayTeam?.name, match.awayTeam,
    match.away_team?.name, match.away_team,
    match.teams?.away?.name, match.teams?.away,
    match.teams?.[1]?.name, match.teams?.[1],
    match.participants?.[1]?.name, match.participants?.[1],
    match.away_name, match.away, match.team2, match.team_away
  ];

  for (const c of candidats) {
    if (typeof c === 'string' && c.trim().length > 0) return c.trim();
    if (c && typeof c === 'object') {
      const name = c.name || c.title || c.team_name || c.name_en;
      if (name && typeof name === 'string') return name.trim();
    }
  }

  return isHome ? "Équipe A" : "Équipe B";
}

function formaterMatch(match) {
  // Nom de la ligue / championnat
  const leagueName = match.league?.name || match.league || match.competition?.name || match.competition || "SUPERLIGA ROMÂNIEI";
  
  // Extraction des vrais noms
  const homeName = trouverNomEquipe(match, 'home');
  const awayName = trouverNomEquipe(match, 'away');

  // Scores
  const homeScore = match.scores?.home ?? match.home_score ?? match.ss?.split('-')?.[0] ?? 0;
  const awayScore = match.scores?.away ?? match.away_score ?? match.ss?.split('-')?.[1] ?? 0;
  
  const htHome = match.scores?.halftime?.home ?? match.halftime_score?.home ?? 0;
  const htAway = match.scores?.halftime?.away ?? match.halftime_score?.away ?? 0;

  const drapeau = getDrapeau(match.country || match.league?.country || leagueName);
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
    console.log("✅ Publication Facebook envoyée !");
  } catch (e) {
    console.error("❌ Erreur FB :", e);
  }
}

async function surveillerDirect() {
  try {
    console.log("🔍 Vérification SportSRC...");
    const response = await appelAPI("https://api.sportsrc.org/v2/?type=matches&sport=football&status=inprogress");
    
    const matchs = Array.isArray(response) ? response : (response.data || response.results || []);

    if (matchs.length > 0) {
      // 📌 INSPECTION DANS LES LOGS RENDER : Affiche la structure exacte du 1er match
      console.log("📦 Structure du premier match reçu :", JSON.stringify(matchs[0]));
    }

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
      console.log("✅ Pas de nouveaux changements.");
    }

  } catch (e) {
    console.error("❌ Erreur API SportSRC :", e);
  }
}

app.get('/', (req, res) => res.send("⚽ SERVICE ACTIF - VOLTIXAI LIVE"));

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  surveillerDirect();
  setInterval(surveillerDirect, 3 * 60 * 1000);
});
