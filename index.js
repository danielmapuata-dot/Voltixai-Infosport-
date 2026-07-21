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

async function publierFinal(contenuTotal) {
  const heureGMT = new Date().toLocaleTimeString('fr-FR', {
    timeZone: 'GMT', hour: '2-digit', minute: '2-digit'
  });

  // 📌 MESSAGE EXACT COMME TU AS DEMANDÉ
  const message = `⚽🚩 voltixai live SCORE 🕒 ${heureGMT} - GMT

${contenuTotal}

🏳️ Corners
🟨 Cartons jaunes
🟥 Cartons rouges
⛔ Hors-jeu
🎯 Tirs cadrés
🅿️ Possession

#VoltixaiLive #LiveScore #Football`;

  try {
    const url = `https://graph.facebook.com/v21.0/${FACEBOOK_PAGE_ID}/feed`;
    await appelAPI(url, "POST", { message: message });
    console.log(`✅ PUBLICATION PARFAITE ENVOYÉE`);
  } catch (err) {
    console.error("❌ Erreur publication :", err.message);
  }
}

// 📌 FONCTION DE FORMATAGE EXACTE QUE TU AS FOURNIE
function formaterMatchExact(match) {
  const minute = match.minute ? `${match.minute}'` : "LIVE";
  const score = `${match.home_score || 0}-${match.away_score || 0}`;

  let texte = `⚫ ${minute} | ${match.home} ${score} ${match.away}\n`;

  // Première mi-temps / Deuxième mi-temps
  if (match.first_half_home !== undefined) {
    texte += `➡️ 1st Half : ${match.first_half_home}-${match.first_half_away} | 2nd Half : ${match.second_half_home}-${match.second_half_away}\n`;
  }

  // Corners
  if (match.corners_home != null) {
    texte += `🏳️ ${match.corners_home}-${match.corners_away} `;
  }

  // Cartons jaunes
  if (match.yellow_home != null) {
    texte += `🟨 ${match.yellow_home}-${match.yellow_away} `;
  }

  // Cartons rouges
  if (match.red_home != null) {
    texte += `🟥 ${match.red_home}-${match.red_away} `;
  }

  // Hors-jeu
  if (match.offside_home != null) {
    texte += `⛔ ${match.offside_home}-${match.offside_away} `;
  }

  // Possession
  if (match.possession_home != null) {
    texte += `🅿️ ${match.possession_home}%-${match.possession_away}% `;
  }

  // Tirs
  if (match.shots_home != null) {
    texte += `🎯 ${match.shots_home}-${match.shots_away}`;
  }

  // Fautes
  if (match.fouls_home != null) {
    texte += `\n⚠️ ${match.fouls_home}-${match.fouls_away}`;
  }

  return texte + "\n\n";
}

async function traiterPublication() {
  try {
    console.log("\n🔄 Vérification automatique Render...");
    const reponse = await appelAPI("https://api.anysport.io/v1/livescore");
    const tousLesMatchs = reponse.success ? reponse.data : [];

    // Filtre : seulement en direct / mi-temps / tirs au but
    const matchsEnDirect = tousLesMatchs.filter(match => 
      ["live", "ht", "penalties"].includes((match.status || "").toLowerCase())
    );
    console.log(`📊 ${matchsEnDirect.length} match(s) en direct`);

    // Regroupe par championnat
    const parChampionnat = new Map();
    for (const match of matchsEnDirect) {
      const championnat = match.league || "Matchs Amicaux";
      if (!parChampionnat.has(championnat)) parChampionnat.set(championnat, []);
      parChampionnat.get(championnat).push(match);
    }

    let contenuTotal = "";
    let aDesNouveautes = false;

    for (const [championnat, listeMatchs] of parChampionnat) {
      contenuTotal += `🏆 ${championnat}\n`;

      for (const match of listeMatchs) {
        const id = match.match_id;
        const signature = `${match.score}-${match.status}-${match.minute || "0"}`;
        
        if (etatMatchs.get(id) === signature) continue;
        aDesNouveautes = true;
        etatMatchs.set(id, signature);

        contenuTotal += formaterMatchExact(match);
      }
    }

    if (aDesNouveautes) {
      await publierFinal(contenuTotal.trim());
    } else {
      console.log("ℹ️ Rien de nouveau : pas de publication");
    }
  } catch (err) {
    console.error("❌ Erreur :", err.message);
  }
}

app.get('/', (req, res) => res.send("⚽ Voltixai Live Score - FORMAT EXACT"));

app.listen(PORT, () => {
  console.log("🚀 Démarré : Render toutes les 3min, format demandé");
  traiterPublication();
  setInterval(traiterPublication, TROIS_MINUTES);
  setInterval(() => { 
    https.get(`https://voltixai-infosport-4.onrender.com`);
  }, TROIS_MINUTES);
});
      
