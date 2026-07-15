// --------------------------
// CONFIGURATION SÉCURISÉE
// --------------------------
const ANYSPORT_API_KEY = (process.env.ANYSPORT_API_KEY || '').trim();
const FACEBOOK_PAGE_ID = (process.env.FACEBOOK_PAGE_ID || '').trim();
const FACEBOOK_TOKEN = (process.env.FACEBOOK_TOKEN || '').trim();

// --------------------------
// BIBLIOTHÈQUE NATIVE
// --------------------------
const https = require('https');

// --------------------------
// FONCTION APPEL API
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
    const requete = https.request(options, (reponse) => {
      let donnees = '';
      reponse.on('data', morceau => donnees += morceau);
      reponse.on('end', () => {
        try { resoudre(JSON.parse(donnees)); }
        catch (err) { rejeter(new Error(`Réponse illisible : ${err.message}`)); }
      });
    });
    requete.on('error', rejeter);
    if (corps) requete.write(JSON.stringify(corps));
    requete.end();
  });
}

// --------------------------
// FONCTION PRINCIPALE SÉCURISÉE
// --------------------------
async function lancerRobot() {
  try {
    console.log("⚽ Démarrage Voltixai Infosport...");
    if (!ANYSPORT_API_KEY || !FACEBOOK_PAGE_ID || !FACEBOOK_TOKEN) throw new Error("Clés manquantes !");

    // Récupération des matchs
    const data = await appelAPI("https://api.anysport.io/v1/livescore");
    let matchs = [];
    if (Array.isArray(data)) matchs = data;
    else if (Array.isArray(data?.data)) matchs = data.data;
    else if (Array.isArray(data?.matches)) matchs = data.matches;

    console.log(`✅ ${matchs.length} match(s) récupéré(s)`);

    // Heure locale
    const heure = new Date().toLocaleTimeString('fr-FR', {
      timeZone: 'Africa/Brazzaville', hour: '2-digit', minute: '2-digit'
    });

    // --------------------------
    // ENTÊTE OBLIGATOIRE (GARANTIT UN MESSAGE NON VIDE)
    // --------------------------
    let message = `⚽ VOLTIXAI INFOSPORT - SCORES EN DIRECT
⏰ Mise à jour : ${heure} (GMT+1)
========================================

`;

    // --------------------------
    // SI AUCUN MATCH, ON AFFICHE QUAND MÊME UN MESSAGE
    // --------------------------
    if (matchs.length === 0) {
      message += "ℹ️ Aucun match en direct pour le moment.\nRevenez plus tard pour suivre les compétitions !\n";
    } else {
      // --------------------------
      // REGROUPEMENT PAR CHAMPIONNAT
      // --------------------------
      const parChampionnat = {};
      for (const match of matchs) {
        const championnat = match.league_name || match.tournament_name || "Matchs divers";
        if (!parChampionnat[championnat]) parChampionnat[championnat] = [];
        parChampionnat[championnat].push(match);
      }

      // --------------------------
      // AFFICHAGE DES MATCHS
      // --------------------------
      for (const [nomChampionnat, listeMatchs] of Object.entries(parChampionnat)) {
        message += `🏆 ${nomChampionnat}\n`;
        message += `──────────────────────────────\n`;

        for (const m of listeMatchs) {
          const domicile = m.home || m.home_team_name || "Équipe A";
          const exterieur = m.away || m.away_team_name || "Équipe B";
          const scoreFinal = m.score || "0-0";
          const minute = String(m.minute || m.elapsed || "");
          const statut = m.status === "finished" ? "FT" : m.status === "not_started" ? "À VENIR" : minute ? `${minute}'` : "EN DIRECT";

          message += `● ${statut} | ${domicile} ${scoreFinal} ${exterieur}\n`;

          // Mi-temps
          const htDom = m.home_ht || m.half_time_home;
          const htExt = m.away_ht || m.half_time_away;
          if (htDom !== undefined && htExt !== undefined) {
            message += `   ↳ Score mi-temps : ${htDom}-${htExt}\n`;
          }
          message += "\n";
        }
      }
    }

    // --------------------------
    // PIED DE PAGE (GARANTIT DU TEXTE EN PLUS)
    // --------------------------
    message += `========================================
#VoltixaiInfosport #FootballLive #ScoresEnDirect`;

    // Nettoyage final et vérification
    const messageFinal = message.trim();
    console.log(`📝 Message final : ${messageFinal.length} caractères`);
    if (messageFinal.length < 10) throw new Error("Le message généré est trop court !");

    // --------------------------
    // PUBLICATION
    // --------------------------
    const urlFB = `https://graph.facebook.com/v25.0/${FACEBOOK_PAGE_ID}/feed?access_token=${FACEBOOK_TOKEN}`;
    const resultatFB = await appelAPI(urlFB, "POST", { message: messageFinal });

    if (resultatFB.id) console.log(`✅ PUBLIÉ AVEC SUCCÈS ! Lien : https://facebook.com/${resultatFB.id}`);
    else throw new Error(`Erreur Facebook : ${JSON.stringify(resultatFB.error || resultatFB)}`;

  } catch (erreur) {
    console.error("❌ ERREUR :", erreur.message);
    process.exit(1);
  }
}

lancerRobot();
      
