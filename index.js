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

async function publierStyleExact(contenuTotal) {
  const heureGMT = new Date().toLocaleTimeString('fr-FR', {
    timeZone: 'GMT', hour: '2-digit', minute: '2-digit'
  });

  const message = `⚽ 🚩 VOLTIXAI LIVE SCORE ⚽ ${heureGMT} - GMT

${contenuTotal}

#VoltixaiLiveScore #ResultatsFoot #EnDirect #Football`;

  try {
    const url = `https://graph.facebook.com/v21.0/${FACEBOOK_PAGE_ID}/feed`;
    await appelAPI(url, "POST", { message: message });
    console.log(`✅ PUBLICATION STYLE EXACT ENVOYÉE`);
  } catch (err) {
    console.error("❌ Erreur publication :", err.message);
  }
}

// 🎨 Format IDENTIQUE à la deuxième image
function formaterMatchStyleExact(match) {
  // Symbole début de ligne
  const symboleDebut = "●";

  // Statut / minute
  let statut = match.minute ? `${match.minute}'` : 
              match.status === "ht" ? "HT" : 
              match.status === "penalties" ? "Tirs au but" : 
              match.status === "ft" ? "TERMINÉ" : "En cours";

  // Score principal
  const score = match.score || `${match.home_score || 0}-${match.away_score || 0}`;

  // Ligne de base
  let ligne = `${symboleDebut} ${statut} | ${match.home} ${score} ${match.away}`;

  // Détail mi-temps si présent
  if (match.half_score || match.home_ht !== undefined) {
    const mt = match.half_score || `${match.home_ht || 0}-${match.away_ht || 0}`;
    ligne += `\n➡️ 1st Half : ${mt} | 2nd Half : ${score}`;
  }

  // Statistiques avec icônes comme l'exemple : drapeau, carré, flèche, arc, cible, pourcentage...
  let statsLigne = "";
  if (match.stats && Array.isArray(match.stats)) {
    const iconesExactes = {
      "goals": "🏁",
      "corners": "🟨",
      "redcards": "🔴",
      "shots": "🏹",
      "shotsontarget": "🎯",
      "possession": "🅿️",
      "yellowcards": "⚠️",
      "fouls": "⚖️",
      "offsides": "🔄"
    };
    match.stats.forEach(stat => {
      const icone = iconesExactes[stat.type?.toLowerCase()] || "🔹";
      statsLigne += ` ${icone}${stat.home}-${stat.away}`;
    });
  }

  return `${ligne}\n${statsLigne.trim()}\n`;
}

async function traiterPublication() {
  try {
    console.log("\n🔄 Vérification automatique Render...");
    const reponse = await appelAPI("https://api.anysport.io/v1/livescore");
    const tousLesMatchs = reponse.success ? reponse.data : [];

    // Filtre : en direct / mi-temps / tirs au but
    const matchsEnDirect = tousLesMatchs.filter(match => 
      ["live", "ht", "penalties"].includes((match.status || "").toLowerCase())
    );
    console.log(`📊 ${matchsEnDirect.length} match(s) en direct`);

    // Regroupe par championnat avec icône adaptée
    const parChampionnat = new Map();
    for (const match of matchsEnDirect) {
      const championnat = match.league || "Matchs Amicaux";
      if (!parChampionnat.has(championnat)) parChampionnat.set(championnat, []);
      parChampionnat.get(championnat).push(match);
    }

    let contenuTotal = "";
    let aDesNouveautes = false;

    for (const [championnat, listeMatchs] of parChampionnat) {
      // Icône championnat comme l'exemple
      let iconeChamp = "🏆";
      if (championnat.includes("Europe") || championnat.includes("Friendlies")) iconeChamp = "🌍";
      if (championnat.includes("Uzbekistan")) iconeChamp = "🇺🇿";
      if (championnat.includes("Mexico")) iconeChamp = "🇲🇽";
      if (championnat.includes("U19") || championnat.includes("U21")) iconeChamp = "🏅";

      contenuTotal += `${iconeChamp} ${championnat}\n`;

      for (const match of listeMatchs) {
        const id = match.match_id;
        const signature = `${match.score}-${match.status}-${match.minute || "0"}`;
        
        if (etatMatchs.get(id) === signature) continue;
        aDesNouveautes = true;
        etatMatchs.set(id, signature);

        contenuTotal += formaterMatchStyleExact(match);
      }
      contenuTotal += "\n";
    }

    if (aDesNouveautes) {
      await publierStyleExact(contenuTotal.trim());
    } else {
      console.log("ℹ️ Rien de nouveau : pas de publication");
    }
  } catch (err) {
    console.error("❌ Erreur :", err.message);
  }
}

app.get('/', (req, res) => res.send("⚽ Voltixai Live Score - STYLE EXACT + AUTONOME"));

app.listen(PORT, () => {
  console.log("🚀 Démarré : Render toutes les 3min, format identique à ton exemple");
  traiterPublication();
  setInterval(traiterPublication, TROIS_MINUTES);
  setInterval(() => { 
    https.get(`https://voltixai-infosport-7.onrender.com`);
  }, TROIS_MINUTES);
});
      
