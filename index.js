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

  const message = `⚽🚩 VOLTIXAI LIVE SCORE ⚫ ${heureGMT} - GMT

${contenuTotal}

${hashtags}`;

  try {
    const url = `https://graph.facebook.com/v21.0/${FACEBOOK_PAGE_ID}/feed`;
    await appelAPI(url, "POST", { message: message });
    console.log(`✅ PUBLICATION STYLE EXACT ENVOYÉE`);
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

// 🎨 Format identique à ton exemple
function formaterMatchStyleExemple(match) {
  const minute = match.minute ? `${match.minute}'` : 
                match.status === "ht" ? "HT" : 
                match.status === "penalties" ? "Tirs au but" : "LIVE";
  const score = match.score || `${match.home_score || 0}-${match.away_score || 0}`;

  let ligne = `● ${minute} | ${match.home} ${score} ${match.away}`;

  // Statistiques avec icônes comme l'exemple
  let stats = "";
  if (match.corners_home != null) stats += ` 🚩${match.corners_home}-${match.corners_away}`;
  if (match.yellow_home != null) stats += ` 🟨${match.yellow_home}-${match.yellow_away}`;
  if (match.shots_home != null) stats += ` 🏹${match.shots_home}-${match.shots_away}`;
  if (match.shotsontarget_home != null) stats += ` 🎯${match.shotsontarget_home}-${match.shotsontarget_away}`;
  if (match.possession_home != null) stats += ` 🅿️ ${match.possession_home}%-${match.possession_away}%`;
  if (match.offside_home != null) stats += ` 🔄${match.offside_home}-${match.offside_away}`;

  return `${ligne}\n${stats.trim()}\n\n`;
}

async function traiterPublication() {
  try {
    console.log("\n🔄 Vérification...");
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

    let contenuTotal = "";
    let listeHashtags = [];
    let aDesNouveautes = false;

    for (const [championnat, listeMatchs] of parChampionnat) {
      const icone = getIconePays(championnat);
      contenuTotal += `${icone} ${championnat}\n`;

      // Hashtag spécifique par championnat
      const hashtagChamp = "#" + championnat.replace(/[^a-zA-Z0-9]/g, "");
      listeHashtags.push(hashtagChamp);

      for (const match of listeMatchs) {
        const id = match.match_id;
        const signature = `${match.score}-${match.status}-${match.minute || "0"}`;
        
        if (etatMatchs.get(id) === signature) continue;
        aDesNouveautes = true;
        etatMatchs.set(id, signature);

        contenuTotal += formaterMatchStyleExemple(match);
      }
    }

    // Hashtags généraux
    listeHashtags.push("#VoltixaiLive", "#LiveScore", "#Football");
    const hashtagsFinaux = listeHashtags.join(" ");

    if (aDesNouveautes) {
      await publierStyleExact(contenuTotal.trim(), hashtagsFinaux);
    } else {
      console.log("ℹ️ Rien de nouveau : pas de publication");
    }
  } catch (err) {
    console.error("❌ Erreur :", err.message);
  }
}

app.get('/', (req, res) => res.send("⚽ Voltixai Live Score - STYLE EXEMPLE"));

app.listen(PORT, () => {
  console.log("🚀 Démarré : Render toutes les 3min, format identique à ton exemple");
  traiterPublication();
  setInterval(traiterPublication, TROIS_MINUTES);
  setInterval(() => { 
    https.get(`https://voltixai-infosport-4.onrender.com`);
  }, TROIS_MINUTES);
});
  
