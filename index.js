require('dotenv').config();
const express = require('express');
const https = require('https');

const SPORT_SRC_KEY = process.env.SPORT_SRC_KEY || '';
const FACEBOOK_TOKEN = process.env.FACEBOOK_TOKEN || '';
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID || '';

const app = express();
const PORT = process.env.PORT || 3001;
const etatMatchs = new Map();

// Authentification X-API-KEY selon la doc V2.5
const headersAPI = {
  'X-API-KEY': SPORT_SRC_KEY,
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0'
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
  if (!pays) return "🇷🇴";
  const nom = String(pays).toLowerCase();
  if (nom.includes("romania") || nom.includes("roumanie") || nom.includes("româniei")) return "🇷🇴";
  if (nom.includes("bulgaria")) return "🇧🇬";
  if (nom.includes("france")) return "🇫🇷";
  if (nom.includes("brazil") || nom.includes("brésil")) return "🇧🇷";
  if (nom.includes("congo")) return "🇨🇩";
  if (nom.includes("england") || nom.includes("angleterre")) return "🏴󠁧󠁢󠁥󠁮󠁧󠁿";
  if (nom.includes("spain") || nom.includes("espagne")) return "🇪🇸";
  return "🌍";
}

// Extraire le nom réel de l'équipe (en gérant tous les formats d'objets ou chaînes)
function extraireNom(objetEquipe, nomFallback) {
  if (!objetEquipe) return nomFallback;
  if (typeof objetEquipe === 'string') return objetEquipe.trim();
  if (typeof objetEquipe === 'object') {
    return objetEquipe.name || objetEquipe.title || objetEquipe.team_name || objetEquipe.name_en || nomFallback;
  }
  return nomFallback;
}

function formaterMatch(match) {
  // Championnat / Ligue
  const leagueName = match.league?.name || match.league || match.competition?.name || match.competition || "SUPERLIGA ROMÂNIEI";

  // Extraction intelligente des équipes
  let homeName = "Équipe Domicile";
  let awayName = "Équipe Extérieur";

  if (match.teams) {
    homeName = extraireNom(match.teams.home || match.teams[0], homeName);
    awayName = extraireNom(match.teams.away || match.teams[1], awayName);
  } else if (match.home || match.away) {
    homeName = extraireNom(match.home, homeName);
    awayName = extraireNom(match.away, awayName);
  } else if (match.home_team || match.away_team) {
    homeName = extraireNom(match.home_team, homeName);
    awayName = extraireNom(match.away_team, awayName);
  } else if (match.participants && Array.isArray(match.participants)) {
    homeName = extraireNom(match.participants[0], homeName);
    awayName = extraireNom(match.participants[1], awayName);
  } else if (match.title && match.title.includes(' vs ')) {
    const parts = match.title.split(' vs ');
    homeName = parts[0].trim();
    awayName = parts[1].trim();
  }

  // Scores
  const homeScore = match.scores?.home ?? match.home_score ?? 0;
  const awayScore = match.scores?.away ?? match.away_score ?? 0;

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
    console.log("🔍 Vérification SportSRC v2...");
    const response = await appelAPI("https://api.sportsrc.org/v2/?type=matches&sport=football&status=inprogress");

    const matchs = Array.isArray(response) ? response : (response.data || response.results || []);

    if (matchs.length > 0) {
      console.log("📦 Structure du 1er match :", JSON.stringify(matchs[0]));
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
      console.log("✅ Aucun changement de score.");
    }

  } catch (e) {
    console.error("❌ Erreur API SportSRC :", e);
  }
}

app.get('/', (req, res) => res.send("⚽ SERVICE ACTIF - VOLTIXAI LIVE"));

app.listen(PORT, () => {
  console.log(`🚀 Serveur actif sur le port ${PORT}`);
  surveillerDirect();
  setInterval(surveillerDirect, 3 * 60 * 1000);
});
