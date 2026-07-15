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
        catch (err) { rejeter(new Error(`Erreur lecture API : ${err.message}`)); }
      });
    });
    requete.on('error', rejeter);
    if (corps) requete.write(JSON.stringify(corps));
    requete.end();
  });
}

// --------------------------
// FONCTION PRINCIPALE : MODÈLE EXACT
// --------------------------
async function lancerRobot() {
  try {
    console.log('⚽ Démarrage Voltixai Infosport...');
    if (!ANYSPORT_API_KEY || !FACEBOOK_PAGE_ID || !FACEBOOK_TOKEN) throw new Error('Valeurs de configuration manquantes !');

    // Récupérer les matchs
    const reponseAPI = await appelAPI('https://api.anysport.io/v1/livescore');
    const listeMatchs = reponseAPI.data || reponseAPI || [];
    console.log(`✅ ${listeMatchs.length} matchs récupérés`);

    // Heure locale
    const heure = new Date().toLocaleTimeString('fr-FR', {
      timeZone: 'Africa/Brazzaville', hour: '2-digit', minute: '2-digit'
    });

    // --------------------------
    // ENTÊTE IDENTIQUE
    // --------------------------
    let message = `⚽ 🚩 VOLTIXAI INFOSPORT LIVE ⚫ ${heure} - GMT+1
========================================

`;

    // --------------------------
    // REGROUPEMENT PAR PAYS + CHAMPIONNAT
    // --------------------------
    const parChampionnat = {};
    for (const match of listeMatchs) {
      const pays = match.country_name || "Pays inconnu";
      const championnat = match.league_name || "Compétition inconnue";
      const cle = `${pays} ⚫ ${championnat}`;
      if (!parChampionnat[cle]) parChampionnat[cle] = [];
      parChampionnat[cle].push(match);
    }

    // --------------------------
    // AFFICHAGE PAR CHAMPIONNAT
    // --------------------------
    for (const [nomGroupe, matchs] of Object.entries(parChampionnat)) {
      message += `🏆 ${nomGroupe}\n`;

      for (const match of matchs) {
        const domicile = match.home || match.home_team || "Équipe A";
        const exterieur = match.away || match.away_team || "Équipe B";
        const score = match.score || "0-0";
        const miTemps1 = match.home_ht ? `${match.home_ht}-${match.away_ht}` : null;
        const minute = match.minute || match.elapsed || "";

        // Statut exact comme sur l'exemple
        let statut = "";
        if (match.status === "finished") statut = "FT";
        else if (match.status === "not_started") statut = "À VENIR";
        else if (minute === "HT") statut = "MI-TEMPS";
        else statut = `${minute}'`;

        // LIGNE PRINCIPALE
        message += `● ${statut} | ${domicile} ${score} ${exterieur}\n`;

        // DÉTAIL MI-TEMPS SI DISPONIBLE
        if (miTemps1) {
          message += `   ↳ 1ère mi-temps : ${miTemps1.split('-')[0]}-${miTemps1.split('-')[1]} | 2nde mi-temps : ${Number(score.split('-')[0]) - Number(miTemps1.split('-')[0])}-${Number(score.split('-')[1]) - Number(miTemps1.split('-')[1])}\n`;
        }
        message += "\n";
      }
    }

    // --------------------------
    // LÉGENDE DES ICÔNES (COMME SUR LE MODÈLE)
    // --------------------------
    message += `─────────────────────────────────────────
⚪ Corners / Coups de pied de coin
⚠️ Fautes / Fautes
🔴 Hors-jeu / Hors-jeu
🎯 Tirs cadrés / Tirs cadrés
📊 Possession / Possession
`;

    // --------------------------
    // PUBLICATION
    // --------------------------
    const url = `https://graph.facebook.com/v25.0/${FACEBOOK_PAGE_ID}/feed?access_token=${FACEBOOK_TOKEN}`;
    await appelAPI(url, 'POST', { message: message.trim() });
    console.log('✅ Publication envoyée avec succès !');

  } catch (erreur) {
    console.error('❌ ERREUR :', erreur.message);
    process.exit(1);
  }
}

lancerRobot();
    
