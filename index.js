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

async function publierParfait(contenuTotal) {
  const heureGMT = new Date().toLocaleTimeString('fr-FR', {
    timeZone: 'GMT', hour: '2-digit', minute: '2-digit'
  });

  const message = `⚽ 🚩 VOLTIXAI LIVE SCORE ⚽ ${heureGMT} - GMT

${contenuTotal}

#VoltixaiLiveScore #ResultatsFoot #EnDirect #Football`;

  try {
    const url = `https://graph.facebook.com/v21.0/${FACEBOOK_PAGE_ID}/feed`;
    await appelAPI(url, "POST", { message: message });
    console.log(`✅ PUBLICATION PARFAITE ENVOYÉE`);
  } catch (err) {
    console.error("❌ Erreur publication :", err.message);
  }
}

// 🎨 FORMAT EXACTEMENT COMME TA PUBLICATION
function formaterMatchExact(match) {
  // Statut / minute
  let statut = match.minute ? `${match.minute}'` : 
              match.status === "ht" ? "HT" : 
              match.status === "penalties" ? "Tirs au but" : 
              match.status === "ft" ? "TERMINÉ" : "En cours";

  // Score principal
  const score = match.score || `${match.home_score || 0}-${match.away_score || 0}`;

  // Ligne du match
  let ligne = `● ${statut} | ${match.home} ${score} ${match.away}`;

  // 🎯 Statistiques avec icônes EXACTES : 🟨 puis 🟦 comme tu veux
  let stats = "";
  if (match.stats && Array.isArray(match.stats)) {
    // Carré jaune en premier, puis tous les losanges bleus
    match.stats.forEach((stat, index) => {
      const valeur = `${stat.home}-${stat.away}`;
      stats += index === 0 ? ` 🟨${valeur}` : ` 🟦${valeur}`;
    });
  }

  return `${ligne}\n${stats.trim()}\n`;
}

async function traiterPublication() {
  try {
    console.log("\n🔄 Vérification...");
    const reponse = await appelAPI("https://api.anysport.io/v1/livescore");
    const tousLesMatchs = reponse.success ? reponse.data : [];

    // Filtre : seulement en direct / mi-temps / tirs au but
    const matchsEnDirect = tousLesMatchs.filter(match => 
      ["live", "ht", "penalties"].includes((match.status || "").toLowerCase())
    );
    console.log(`📊 ${matchsEnDirect.length} match(s) actifs`);

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
      // Icône championnat comme sur ta publication
      let icone = "🏆";
      if (championnat.includes("Friendlies")) icone = "🌍";
      if (championnat.includes("U19") || championnat.includes("U21")) icone = "🏅";
      if (championnat.includes("Champions League")) icone = "🏆";

      contenuTotal += `${icone} ${championnat}\n`;

      for (const match of listeMatchs) {
        const id = match.match_id;
        const signature = `${match.score}-${match.status}-${match.minute || "0"}`;
        
        if (etatMatchs.get(id) === signature) continue;
        aDesNouveautes = true;
        etatMatchs.set(id, signature);

        contenuTotal += formaterMatchExact(match);
      }
      contenuTotal += "\n";
    }

    if (aDesNouveautes) {
      await publierParfait(contenuTotal.trim());
    } else {
      console.log("ℹ️ Rien de nouveau : pas de publication");
    }
  } catch (err) {
    console.error("❌ Erreur :", err.message);
  }
}

app.get('/', (req, res) => res.send("⚽ Voltixai Live Score - FORMAT EXACT"));

app.listen(PORT, () => {
  console.log("🚀 Démarré : format identique à ta publication + toutes les 3min sur Render");
  traiterPublication();
  setInterval(traiterPublication, TROIS_MINUTES);
  setInterval(() => { 
    https.get(`https://voltixai-infosport-4.onrender.com`);
  }, TROIS_MINUTES);
});
                                  
