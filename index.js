// --------------------------
// CONFIGURATION SÉCURISÉE (depuis variables d'environnement)
// --------------------------
require('dotenv').config();

const ANYSPORT_API_KEY = (process.env.ANYSPORT_API_KEY || '').trim();
const FACEBOOK_PAGE_ID = (process.env.FACEBOOK_PAGE_ID || '').trim();
const FACEBOOK_TOKEN = (process.env.FACEBOOK_TOKEN || '').trim();

// --------------------------
// BIBLIOTHÈQUES ET SERVEUR WEB
// --------------------------
const https = require('https');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Route d'accueil / réveil par cron-job
app.get('/', (req, res) => {
  res.send("⚽ Voltixai Infosport : Serveur opérationnel !");
});

// Route API demandée : /api/voltixai-live (raccourci /api/voltixai-li)
app.get(['/api/voltixai-live', '/api/voltixai-li'], async (req, res) => {
  try {
    await lancerRobot();
    res.status(200).json({ statut: "succès", message: "Publication exécutée avec succès" });
  } catch (erreur) {
    res.status(500).json({ statut: "erreur", message: erreur.message });
  }
});

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`🔗 Points d'accès : /api/voltixai-live | /api/voltixai-li`);
});

// --------------------------
// FONCTION APPEL API ANYSPORT
// --------------------------
function appelAPI(url, method = 'GET', corps = null) {
  return new Promise((resoudre, rejeter) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: method.toUpperCase(),
      headers: {
        'X-API-Key': ANYSPORT_API_KEY,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    let donneesCorps = null;
    if (corps) {
      donneesCorps = JSON.stringify(corps);
      options.headers['Content-Length'] = Buffer.byteLength(donneesCorps);
    }

    const requete = https.request(options, (reponse) => {
      let donnees = '';
      reponse.on('data', morceau => donnees += morceau);
      reponse.on('end', () => {
        try { 
          resoudre(JSON.parse(donnees)); 
        } catch (err) { 
          rejeter(new Error(`Réponse illisible : ${err.message}`)); 
        }
      });
    });

    requete.on('error', rejeter);
    if (donneesCorps) requete.write(donneesCorps);
    requete.end();
  });
}

// --------------------------
// FONCTION PRINCIPALE DU ROBOT
// --------------------------
async function lancerRobot() {
  try {
    console.log("\n⚽ EXÉCUTION VOLTIXAI INFOSPORT ⚽");

    // Vérification des clés
    if (!ANYSPORT_API_KEY || !FACEBOOK_PAGE_ID || !FACEBOOK_TOKEN) {
      throw new Error("❌ Une ou plusieurs variables sont manquantes !");
    }

    // Récupération des matchs AnySport
    const data = await appelAPI("https://api.anysport.io/v1/livescore");
    let matchs = [];
    if (Array.isArray(data)) matchs = data;
    else if (Array.isArray(data?.data)) matchs = data.data;
    else if (Array.isArray(data?.matches)) matchs = data.matches;

    console.log(`✅ ${matchs.length} match(s) récupéré(s)`);

    // Heure locale Brazzaville
    const heure = new Date().toLocaleTimeString('fr-FR', {
      timeZone: 'Africa/Brazzaville', hour: '2-digit', minute: '2-digit'
    });

    // --------------------------
    // CONSTRUCTION DU MESSAGE
    // --------------------------
    let message = `⚽ 🚩 LIVE SCORE ❯ ${heure} - Heure de Brazzaville\n\n`;

    if (matchs.length === 0) {
      message += "ℹ️ Aucun match en direct pour le moment.\nRevenez plus tard !\n";
    } else {
      // Regroupement par championnat
      const parChampionnat = {};
      for (const match of matchs) {
        const pays = match.country_name || match.country || "Monde";
        const championnat = match.league_name || match.tournament_name || "Matchs divers";
        const cleUnique = `${pays} ❯ ${championnat}`;
        
        if (!parChampionnat[cleUnique]) parChampionnat[cleUnique] = [];
        parChampionnat[cleUnique].push(match);
      }

      // Affichage des matchs
      for (const [nomChampionnat, listeMatchs] of Object.entries(parChampionnat)) {
        message += `🚩 ${nomChampionnat}\n`;

        for (const m of listeMatchs) {
          const domicile = m.home || m.home_team_name || "Équipe A";
          const exterieur = m.away || m.away_team_name || "Équipe B";
          const scoreFinal = m.score || "0-0";
          const minute = String(m.minute || m.elapsed || "");
          const statut = m.status === "finished" ? "FT" : m.status === "not_started" ? "À VENIR" : minute ? `${minute}'` : "EN COURS";

          message += `🔘 ${statut} | ${domicile} ${scoreFinal} ${exterieur}\n`;

          // Scores mi-temps
          const htDom = m.home_ht !== undefined ? m.home_ht : (m.half_time_home || 0);
          const htExt = m.away_ht !== undefined ? m.away_ht : (m.half_time_away || 0);
          message += `   ➡️ Mi-temps : ${htDom}-${htExt}\n\n`;
        }
      }
    }

    // Pied de page
    message += `──────────────────────────────\n`;
    message += `#VoltixaiInfosport #FootballEnDirect #ScoresLive`;

    // Publication sur Facebook
    const urlFB = `https://graph.facebook.com/v25.0/${FACEBOOK_PAGE_ID}/feed`;
    const resultatFB = await appelAPI(urlFB, "POST", { message: message.trim() });

    if (resultatFB.id) console.log(`✅ PUBLIÉ ! Lien : https://facebook.com/${resultatFB.id}`);
    else throw new Error(`Erreur Facebook : ${JSON.stringify(resultatFB.error || resultatFB)}`);

  } catch (erreur) {
    console.error("❌ ERREUR :", erreur.message);
    throw erreur;
  }
}
