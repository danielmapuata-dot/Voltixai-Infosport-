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
// FONCTION D'APPEL API
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
        catch (err) { rejeter(new Error(`Réponse illisible : ${donnees.slice(0,200)}`)); }
      });
    });
    requete.on('error', rejeter);
    if (corps) requete.write(JSON.stringify(corps));
    requete.end();
  });
}

// --------------------------
// FONCTION PRINCIPALE
// --------------------------
async function lancerRobot() {
  try {
    console.log('⚽ Démarrage Voltixai Infosport...');
    if (!ANYSPORT_API_KEY || !FACEBOOK_PAGE_ID || !FACEBOOK_TOKEN) throw new Error('Valeurs manquantes !');

    // Récupération des matchs
    const reponseAPI = await appelAPI('https://api.anysport.io/v1/livescore');
    const listeMatchs = reponseAPI.data || reponseAPI || [];
    console.log(`✅ ${listeMatchs.length} matchs récupérés`);

    // Heure locale
    const heure = new Date().toLocaleTimeString('fr-FR', {
      timeZone: 'Africa/Brazzaville', hour: '2-digit', minute: '2-digit'
    });

    // --------------------------
    // ENTÊTE IDENTIQUE AU MODÈLE
    // --------------------------
    let message = `⚽ 🚩 VOLTIXAI INFOSPORT LIVE ⚡ ${heure} - GMT+1
========================================

`;

    // --------------------------
    // REGROUPEMENT PAR PAYS + CHAMPIONNAT
    // --------------------------
    const parChampionnat = {};
    for (const match of listeMatchs) {
      const pays = match.country_name || "Pays inconnu";
      const championnat = match.league_name || "Compétition inconnue";
      const cleGroupe = `${pays} ⚫ ${championnat}`;
      if (!parChampionnat[cleGroupe]) parChampionnat[cleGroupe] = [];
      parChampionnat[cleGroupe].push(match);
    }

    // --------------------------
    // AFFICHAGE PAR GROUPE
    // --------------------------
    for (const [nomGroupe, matchs] of Object.entries(parChampionnat)) {
      // Titre du championnat
      message += `🏆 ${nomGroupe}\n`;
      message += `──────────────────────────────\n`;

      for (const match of matchs) {
        // Données du match
        const domicile = match.home || match.home_team || "Équipe domicile";
        const exterieur = match.away || match.away_team || "Équipe extérieur";
        const scoreFinal = match.score || "0-0";
        const miTemps = match.half_time ? match.half_time : null;
        const minute = match.minute || match.elapsed || "";

        // Statut comme sur l'exemple
        let statut = "";
        if (match.status === "finished") statut = "● FT | ";
        else if (match.status === "not_started") statut = "● À VENIR | ";
        else if (minute === "HT") statut = "● MI-TEMPS | ";
        else statut = `● ${minute}' | `;

        // Ligne principale : statut + équipes + score
        message += `${statut}${domicile} ${scoreFinal} ${exterieur}\n`;

        // Détail mi-temps si disponible
        if (miTemps) {
          message += `   ↳ 1ère mi-temps : ${miTemps}\n`;
        }
        message += "\n";
      }
      message += "\n";
    }

    // --------------------------
    // PIED DE PAGE
    // --------------------------
    message += `#VoltixaiInfosport #LiveScore #ScoresEnDirect`;
    const messageFinal = message.trim();
    console.log('✅ Formatage terminé sur le modèle demandé');

    // --------------------------
    // PUBLICATION SUR FACEBOOK
    // --------------------------
    const urlPublication = `https://graph.facebook.com/v25.0/${FACEBOOK_PAGE_ID}/feed?access_token=${FACEBOOK_TOKEN}`;
    const reponseFB = await appelAPI(urlPublication, 'POST', { message: messageFinal });

    if (reponseFB.id) console.log(`✅ Publié avec succès !`);
    else console.error('❌ Erreur publication :', reponseFB.error);

  } catch (erreur) {
    console.error('❌ ERREUR :', erreur.message);
    process.exit(1);
  }
}

lancerRobot();
        
