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

  const message = `⚽🚩 VOLTIXAI LIVE SCORE ❥ ${heureGMT} - GMT\n\n${contenuTotal}\n\n${hashtags}`;

  try {
    const url = `https://graph.facebook.com/v21.0/${FACEBOOK_PAGE_ID}/feed`;
    await appelAPI(url, "POST", { message: message });
    console.log(`✅ PUBLICATION CORRIGÉE ENVOYÉE`);
  } catch (err) {
    console.error("❌ Erreur publication :", err.message);
  }
}

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

function formaterMatchStyleExemple(match) {
  const statut = (match.status || "").toLowerCase().trim();
  const minute = match.minute ? `${match.minute}'` : 
                statut === "ht" ? "HT" : 
                statut === "penalties" ? "Tirs au but" : "LIVE";
  const score = match.score || `${match.home_score || 0}-${match.away_score || 0}`;

  let resultat = `🔘 ${minute} | ${match.home} ${score} ${match.away}`;

  // ✅ RÈGLE EXACTE : AFFICHE SEULEMENT SI CE N'EST PAS LA MI-TEMPS
  if (statut !== "ht" && statut !== "half time" && statut !== "mi-temps") {
    if (match.first_half_home !== undefined && match.second_half_home !== undefined) {
      resultat += `\n➡️ 1st HT ${match.first_half_home}-${match.first_half_away} | 2nd ${match.second_half_home}-${match.second_half_away}`;
    } else if (match.ht_score && match.ft_score) {
      resultat += `\n➡️ 1st HT ${match.ht_score} | 2nd ${match.ft_score}`;
    }
  }

  const corners = `⛳ ${match.corners_home ?? 0}-${match.corners_away ?? 0}`;
  const cartonsJaunes = `🟨 ${match.yellow_home ?? 0}-${match.yellow_away ?? 0}`;
  const cartonsRouges = `⛔ ${match.red_home ?? 0}-${match.red_away ?? 0}`;
  const tirs = `🏹 ${match.shots_home ?? 0}-${match.shots_away ?? 0}`;
  const tirsCadres = `🎯 ${match.shotsontarget_home ?? 0}-${match.shotsontarget_away ?? 0}`;
  const possession = `🅿️ ${match.possession_home ?? 50}%-${match.possession_away ?? 50}%`;

  resultat += `\n${corners} ${cartonsJaunes} ${cartonsRouges} ${tirs} ${tirsCadres} ${possession}`;

  return resultat;
}

async function traiterPublication() {
  try {
    console.log("\n🔄 Vérification des matchs en direct...");
    const reponse = await appelAPI("https://api.anysport.io/v1/livescore");
    const tousLesMatchs = reponse.success ? reponse.data : [];

    const statutsTermines = ["ft", "finished", "ended", "after et", "after pen", "aet", "ap", "postponed", "cancelled"];

    const matchsEnDirect = tousLesMatchs.filter(match => {
      const status = (match.status || "").toLowerCase().trim();
      const minuteRaw = String(match.minute || "");

      if (statutsTermines.includes(status)) return false;
      if (minuteRaw.includes("+")) return true;
      if (["et", "extra time", "extratime", "penalties", "pen", "p"].includes(status)) return true;

      const minuteNum = parseInt(minuteRaw) || 0;
      return ["live", "ht", "1st half", "2nd half", "inplay"].includes(status) || minuteNum > 0;
    });

    console.log(`📊 ${matchsEnDirect.length} match(s) réellement en direct`);

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
      console.log("ℹ️ Pas de mise à jour ou aucun match en direct : publication ignorée.");
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
