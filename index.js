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
// FONCTION PRINCIPALE SANS DONNÉES Fausses
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
    console.log(`✅ ${matchs.length} match(s) récupéré(s)`);

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
    // REGROUPEMENT PAR CHAMPIONNAT
    // --------------------------
    const parChampionnat = {};
    for (const match of matchs) {
      const championnat = match.league_name || match.tournament_name || "Matchs divers";
      if (!parChampionnat[championnat]) parChampionnat[championnat] = [];
      parChampionnat[championnat].push(match);
    }

    // --------------------------
    // AFFICHAGE SEULEMENT DES DONNÉES EXISTANTES
    // --------------------------
    for (const [nomChampionnat, listeMatchs] of Object.entries(parChampionnat)) {
      message += `🏆 ${nomChampionnat}\n`;
      message += `──────────────────────────────\n`;

      for (const m of listeMatchs) {
        const domicile = m.home || m.home_team || "Équipe A";
        const exterieur = m.away || m.away_team || "Équipe B";
        const scoreFinal = m.score;
        const minute = String(m.minute || m.elapsed || "");
        const statut = m.status === "finished" ? "FT" : m.status === "not_started" ? "À VENIR" : minute ? `${minute}'` : "EN DIRECT";

        // Ligne principale : seulement si score existe
        if (scoreFinal) {
          message += `● ${statut} | ${domicile} ${scoreFinal} ${exterieur}\n`;
        } else {
          message += `● ${statut} | ${domicile} vs ${exterieur}\n`;
        }

        // Score mi-temps : seulement si les deux valeurs existent
        const htDom = m.home_ht;
        const htExt = m.away_ht;
        if (htDom !== undefined && htExt !== undefined) {
          message += `   ↳ Mi-temps : ${htDom}-${htExt}\n`;
        }

        // Statistiques : seulement si elles existent
        let stats = [];
        if (m.corners_home != null && m.corners_away != null) stats.push(`⚪ Corners : ${m.corners_home}-${m.corners_away}`);
        if (m.possession != null) stats.push(`📊 Possession : ${m.possession}%`);
        if (m.fouls_home != null && m.fouls_away != null) stats.push(`⚠️ Fautes : ${m.fouls_home}-${m.fouls_away}`);
        if (m.shots_on_target_home != null && m.shots_on_target_away != null) stats.push(`🎯 Tirs cadrés : ${m.shots_on_target_home}-${m.shots_on_target_away}`);

        if (stats.length > 0) message += `   ${stats.join(' • ')}\n`;
        message += "\n";
      }
    }

    // --------------------------
    // PIED DE PAGE
    // --------------------------
    message += `─────────────────────────────────────
#VoltixaiInfosport #ScoresEnDirect`;

    // --------------------------
    // PUBLICATION
    // --------------------------
    await appelAPI(
      `https://graph.facebook.com/v25.0/${FACEBOOK_PAGE_ID}/feed?access_token=${FACEBOOK_TOKEN}`,
      "POST",
      { message: message.trim() }
    );
    console.log("✅ Publié sans données inventées !");

  } catch (erreur) {
    console.error("❌ ERREUR :", erreur.message);
    process.exit(1);
  }
}

lancerRobot();
