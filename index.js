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
  if (nom.includes("england")) return "🏴";
  if (nom.includes("spain")) return "🇪🇸";
  if (nom.includes("italy")) return "🇮🇹";
  if (nom.includes("brazil")) return "🇧🇷";
  return "🏆";
}

function formaterMatchStyleExemple(match) {
  const statut = (match.status || "").toLowerCase().trim();
  const minuteRaw = String(match.minute || "");
  const minuteNum = parseInt(minuteRaw) || 0;

  const minute = match.minute ? `${match.minute}'` : 
                statut === "ht" ? "HT" : 
                statut === "penalties" ? "Tirs au but" : "LIVE";

  // ✅ ERREUR 1 CORRIGÉE : Récupère LE SCORE TOTAL AFFICHÉ directement
  let scoreTotal = match.score;
  if (!scoreTotal) {
    const h = match.home_score ?? 0;
    const a = match.away_score ?? 0;
    scoreTotal = `${h}-${a}`;
  }

  let resultat = `🔘 ${minute} | ${match.home} ${scoreTotal} ${match.away}`;

  const estPauseHT = ["ht", "half time", "mi-temps"].includes(statut);
  const aScore1reMi = (match.home_ht !== undefined && match.away_ht !== undefined) 
                   || (match.first_half_home !== undefined && match.first_half_away !== undefined)
                   || match.ht_score;

  if (!estPauseHT && aScore1reMi) {
    let htHome, htAway;
    if (match.home_ht !== undefined) {
      htHome = match.home_ht;
      htAway = match.away_ht;
    } else if (match.first_half_home !== undefined) {
      htHome = match.first_half_home;
      htAway = match.first_half_away;
    } else if (match.ht_score) {
      const parts = String(match.ht_score).split("-").map(Number);
      htHome = parts[0] ?? 0;
      htAway = parts[1] ?? 0;
    }

    const totalHome = match.home_score ?? 0;
    const totalAway = match.away_score ?? 0;

    // ✅ PAS DE SCORE NÉGATIF : si calcul invalide, affiche le total
    const ftHome = Math.max(0, totalHome - htHome);
    const ftAway = Math.max(0, totalAway - htAway);

    resultat += `\n➡️ 1st Half : ${htHome}-${htAway} | 2nd Half : ${ftHome}-${ftAway}`;
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
    console.log("\n🔄 Vérification des matchs...");
    const reponse = await appelAPI("https://api.anysport.io/v1/livescore");
    const tousLesMatchs = reponse.success ? reponse.data : [];

    // ✅ ERREUR 2 CORRIGÉE : EXCLUT TOUS LES MATCHS TERMINÉS
    const statutsTermines = ["ft", "finished", "ended", "postponed", "cancelled", "full time", "terminé"];
    const matchsEnDirect = tousLesMatchs.filter(match => {
      const status = (match.status || "").toLowerCase().trim();
      const minuteRaw = String(match.minute || "");

      // Exclut si statut terminé
      if (statutsTermines.includes(status)) return false;
      // Exclut si minute = 90' ET statut pas en prolongation
      if (minuteRaw === "90" && !["et", "penalties", "extra time"].includes(status)) return false;

      return true;
    });
    console.log(`📊 ${matchsEnDirect.length} match(s) EN COURS uniquement`);

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
      console.log("ℹ️ Pas de mise à jour : publication ignorée.");
    }
  } catch (err) {
    console.error("❌ Erreur :", err.message);
  }
}

app.get('/', (req, res) => res.send("⚽ Voltixai Live Score - Erreurs corrigées"));

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  traiterPublication();
  setInterval(traiterPublication, TROIS_MINUTES);
  
  setInterval(() => { 
    https.get(`https://voltixai-infosport-4.onrender.com`).on('error', () => {});
  }, TROIS_MINUTES);
});
    
