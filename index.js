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
        'Accept': 'application/json'
      }
    };
    const requete = https.request(options, (reponse) => {
      let donnees = '';
      reponse.on('data', morceau => donnees += morceau);
      reponse.on('end', () => {
        try { resoudre(JSON.parse(donnees)); }
        catch { rejeter(new Error("Réponse API invalide")); }
      });
    });
    requete.on('error', rejeter);
    if (corps) requete.write(JSON.stringify(corps));
    requete.end();
  });
}

// --------------------------
// FONCTION PRINCIPALE : AFFICHAGE PAR COMPÉTITION SEULEMENT
// --------------------------
async function lancerRobot() {
  try {
    console.log("⚽ Démarrage Voltixai Infosport...");
    if (!ANYSPORT_API_KEY || !FACEBOOK_PAGE_ID || !FACEBOOK_TOKEN) throw new Error("Clés manquantes !");

    // Récupération des matchs
    const data = await appelAPI("https://api.anysport.io/v1/livescore");
    const matchs = Array.isArray(data) ? data : (data.data || []);
    console.log(`✅ ${matchs.length} matchs récupérés`);

    // Heure locale
    const heure = new Date().toLocaleTimeString('fr-FR', {
      timeZone: 'Africa/Brazzaville', hour: '2-digit', minute: '2-digit'
    });

    // --------------------------
    // ENTÊTE
    // --------------------------
    let message = `⚽ VOLTIXAI INFOSPORT LIVE ⚫ ${heure} GMT+1
─────────────────────────────────────\n\n`;

    // --------------------------
    // REGROUPEMENT PAR COMPÉTITION (SANS LE PAYS EN TÊTE)
    // --------------------------
    const parCompetition = {};
    for (const match of matchs) {
      // On prend directement le nom de la compétition
      const competition = match.league_name || match.tournament_name || "Matchs divers";
      if (!parCompetition[competition]) parCompetition[competition] = [];
      parCompetition[competition].push(match);
    }

    // --------------------------
    // AFFICHAGE PAR COMPÉTITION
    // --------------------------
    for (const [nomCompetition, listeMatchs] of Object.entries(parCompetition)) {
      // Affiche DIRECTEMENT la compétition
      message += `🏆 ${nomCompetition}\n`;
      message += `──────────────────────────────\n`;

      for (const m of listeMatchs) {
        const domicile = m.home || m.home_team || "Équipe A";
        const exterieur = m.away || m.away_team || "Équipe B";
        const score = m.score || "0-0";
        const minute = String(m.minute || m.elapsed || "");
        const statut = m.status === "finished" ? "FT" : m.status === "not_started" ? "À VENIR" : minute ? `${minute}'` : "EN DIRECT";

        message += `● ${statut} | ${domicile} ${score} ${exterieur}\n`;
      }
      message += "\n";
    }

    // --------------------------
    // LÉGENDE
    // --------------------------
    message += `─────────────────────────────────────
⚪ Corners / Coups de pied de coin
⚠️ Fautes / Fautes
🔴 Hors-jeu / Hors-jeu
🎯 Tirs cadrés / Tirs cadrés

#VoltixaiInfosport #ScoresEnDirect`;

    // --------------------------
    // PUBLICATION
    // --------------------------
    await appelAPI(
      `https://graph.facebook.com/v25.0/${FACEBOOK_PAGE_ID}/feed?access_token=${FACEBOOK_TOKEN}`,
      "POST",
      { message: message.trim() }
    );
    console.log("✅ Publié avec succès !");

  } catch (erreur) {
    console.error("❌ ERREUR :", erreur.message);
    process.exit(1);
  }
}

// --------------------------
// LANCEMENT FINAL
// --------------------------
lancerRobot();
          
