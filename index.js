require('dotenv').config();
const express = require('express');
const https = require('https');

const ANYSPORT_API_KEY = process.env.ANYSPORT_API_KEY || '';
const FACEBOOK_TOKEN = process.env.FACEBOOK_TOKEN || '';
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID || '';

const app = express();
const PORT = process.env.PORT || 3001;
const etatMatchs = new Map();
const TROIS_MINUTES = 180000;

function appelAPI(url, method = 'GET', corps = null) {
  return new Promise((resoudre, rejeter) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: method.toUpperCase(),
      headers: { 'Content-Type': 'application/json' }
    };
    if (urlObj.hostname.includes('anysport.io')) options.headers['X-API-Key'] = ANYSPORT_API_KEY;
    if (urlObj.hostname.includes('facebook.com')) options.headers['Authorization'] = `Bearer ${FACEBOOK_TOKEN}`;
    if (corps) options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(corps));
    
    const requete = https.request(options, (reponse) => {
      let donnees = '';
      reponse.on('data', m => donnees += m);
      reponse.on('end', () => {
        try {
          const resultat = JSON.parse(donnees);
          reponse.statusCode >= 400 ? rejeter(new Error(`Erreur ${reponse.statusCode}: ${resultat.error?.message || 'Inconnu'}`)) : resoudre(resultat);
        } catch (err) { rejeter(new Error(`Réponse illisible : ${err.message}`)); }
      });
    });
    requete.on('error', rejeter);
    if (corps) requete.write(JSON.stringify(corps));
    requete.end();
  });
}

async function publierStyleExact(contenuTotal, hashtags) {
  const heureGMT = new Date().toLocaleTimeString('fr-FR', {
    timeZone: 'GMT', hour: '2-digit', minute: '2-digit'
  });

  const message = `⚽🚩 LIVE SCORE ❥ ${heureGMT} - GMT\n\n${contenuTotal}\n\n${hashtags}`;

  try {
    const url = `https://graph.facebook.com/v21.0/${FACEBOOK_PAGE_ID}/feed`;
    await appelAPI(url, "POST", { message: message });
    console.log(`✅ PUBLICATION STYLE SCOREZONE ENVOYÉE`);
  } catch (err) {
    console.error("❌ Erreur publication :", err.message);
  }
}

// 🎨 Icône drapeau par pays
function getIconePays(championnat) {
  const nom = championnat.toLowerCase();
  if (nom.includes("china")) return "🇨🇳";
  if (nom.includes("europe")) return "🌍";
  if (nom.includes("uzbekistan")) return "🇺🇿";
  if (nom.includes("france")) return "🇫🇷";
  if (nom.includes("england")) return "🏴󠁧󠁢󠁥󠁮󠁧󠁿";
  if (nom.includes("spain")) return "🇪🇸";
  if (nom.includes("italy")) return "🇮🇹";
  if (nom.includes("brazil")) return "🇧🇷";
  return "🏆";
}

// 🎨 Formate les matchs dynamiquement (affiche SEULEMENT les stats existantes)
function formaterMatchStyleExemple(match) {
  const minute = match.minute ? `${match.minute}'` : 
                match.status === "ht" ? "HT" : 
                match.status === "penalties" ? "Tirs au but" : "LIVE";
  const score = match.score || `${match.home_score || 0}-${match.away_score || 0}`;

  // Ligne du match
  let ligneMatch = `🔘 ${minute} | ${match.home} ${score} ${match.away}`;

  // Détails par mi-temps si disponible (ex: ➡️ 1st Half : 1-3 | 2nd Half : 0-0)
  let ligneMiTemps = "";
  if (match.ht_score) {
    ligneMiTemps = `\n➡️ 1st Half : ${match.ht_score} | 2nd Half : ${match.ft_score || "0-0"}`;
  }

  // Collection dynamique des statistiques
  let statsArr = [];

  if (match.corners_home != null || match.corners_away != null) {
    statsArr.push(`⛳ ${match.corners_home || 0}-${match.corners_away || 0}`);
  }
  if (match.yellow_home || match.yellow_away) {
    statsArr.push(`🟨 ${match.yellow_home || 0}-${match.yellow_away || 0}`);
  }
  if (match.red_home || match.red_away) {
    statsArr.push(`⛔ ${match.red_home || 0}-${match.red_away || 0}`);
  }
  if (match.offside_home || match.offside_away) {
    statsArr.push(`🔄 ${match.offside_home || 0}-${match.offside_away || 0}`);
  }
  if (match.shots_home || match.shots_away) {
    statsArr.push(`🏹 ${match.shots_home || 0}-${match.shots_away || 0}`);
  }
  if (match.shotsontarget_home || match.shotsontarget_away) {
    statsArr.push(`🎯 ${match.shotsontarget_home || 0}-${match.shotsontarget_away || 0}`);
  }
  if (match.fouls_home || match.fouls_away) {
    statsArr.push(`⚠️ ${match.fouls_home || 0}-${match.fouls_away || 0}`);
  }
  if (match.possession_home != null && match.possession_away != null) {
    statsArr.push(`🅿️ ${match.possession_home}%-${match.possession_away}%`);
  }

  let ligneStats = statsArr.length > 0 ? `\n${statsArr.join(" ")}` : "";

  return `${ligneMatch}${ligneMiTemps}${ligneStats}`;
}

async function traiterPublication() {
  try {
    console.log("\n🔄 Vérification des matchs en direct...");
    const reponse = await appelAPI("https://api.anysport.io/v1/livescore");
    const tousLesMatchs = reponse.success ? reponse.data : [];

    const matchsEnDirect = tousLesMatchs.filter(match => 
      ["live", "ht", "penalties"].includes((match.status || "").toLowerCase())
    );
    console.log(`📊 ${matchsEnDirect.length} match(s) en direct`);

    const parChampionnat = new Map();
    for (const match of matchsEnDirect) {
      const championnat = match.league || "Matchs Amicaux";
      if (!parChampionnat.has(championnat)) parChampionnat.set(championnat, []);
      parChampionnat.get(championnat).push(match);
    }

    let blocsChampionnat = [];
    let listeHashtags = new Set();
    let aDesNouveautes = false;

    for (const [championnat, listeMatchs] of parChampionnat) {
      const icone = getIconePays(championnat);
      let bloc = `${icone} ${championnat} ❥\n`;

      const hashtagChamp = "#" + championnat.replace(/[^a-zA-Z0-9]/g, "");
      if (hashtagChamp.length > 2) listeHashtags.add(hashtagChamp);

      let listeMatchsText = [];
      for (const match of listeMatchs) {
        const id = match.match_id;
        const signature = `${match.score}-${match.status}-${match.minute || "0"}`;
        
        if (etatMatchs.get(id) !== signature) {
          aDesNouveautes = true;
          etatMatchs.set(id, signature);
        }

        listeMatchsText.push(formaterMatchStyleExemple(match));
      }

      bloc += listeMatchsText.join("\n");
      blocsChampionnat.push(bloc);
    }

    listeHashtags.add("#VoltixaiLive");
    listeHashtags.add("#LiveScore");
    listeHashtags.add("#Football");

    const contenuTotal = blocsChampionnat.join("\n\n");
    const hashtagsFinaux = Array.from(listeHashtags).join(" ");

    if (aDesNouveautes && contenuTotal.length > 0) {
      await publierStyleExact(contenuTotal, hashtagsFinaux);
    } else {
      console.log("ℹ️ Pas de mise à jour détectée : publication ignorée.");
    }
  } catch (err) {
    console.error("❌ Erreur lors du traitement :", err.message);
  }
}

app.get('/', (req, res) => res.send("⚽ Voltixai Live Score - En cours d'exécution"));

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  traiterPublication();
  setInterval(traiterPublication, TROIS_MINUTES);
  
  setInterval(() => { 
    https.get(`https://voltixai-infosport-4.onrender.com`).on('error', () => {});
  }, TROIS_MINUTES);
});
    
