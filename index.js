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
// FONCTION PRINCIPALE : TOUTES LES STATISTIQUES
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
    // REGROUPEMENT PAR CHAMPIONNAT
    // --------------------------
    const parChampionnat = {};
    for (const match of matchs) {
      const championnat = match.league_name || match.tournament_name || "Matchs divers";
      if (!parChampionnat[championnat]) parChampionnat[championnat] = [];
      parChampionnat[championnat].push(match);
    }

    // --------------------------
    // AFFICHAGE COMPLET PAR MATCH
    // --------------------------
    for (const [nomChampionnat, listeMatchs] of Object.entries(parChampionnat)) {
      // Titre du championnat
      message += `🏆 ${nomChampionnat}\n`;
      message += `──────────────────────────────\n`;

      for (const m of listeMatchs) {
        const domicile = m.home || m.home_team || "Équipe A";
        const exterieur = m.away || m.away_team || "Équipe B";
        const scoreFinal = m.score || "0-0";
        const minute = String(m.minute || m.elapsed || "");
        const statut = m.status === "finished" ? "FT" : m.status === "not_started" ? "À VENIR" : minute ? `${minute}'` : "EN DIRECT";

        // Ligne principale
        message += `● ${statut} | ${domicile} ${scoreFinal} ${exterieur}\n`;

        // Score mi-temps (si disponible)
        if (m.home_ht && m.away_ht) {
          const ht = `${m.home_ht}-${m.away_ht}`;
          const [dom, ext] = scoreFinal.split('-').map(Number);
          const [hDom, hExt] = ht.split('-').map(Number);
          const secondeMiTemps = `${dom - hDom}-${ext - hExt}`;
          message += `   ↳ 1ère mi-temps : ${ht} | 2nde mi-temps : ${secondeMiTemps}\n`;
        }

        // Statistiques détaillées
        let stats = [];
        if (m.corners_home || m.corners_away) stats.push(`⚪ Corners : ${m.corners_home || 0}-${m.corners_away || 0}`);
        if (m.possession) stats.push(`📊 Possession : ${m.possession}%`);
        if (m.fouls_home || m.fouls_away) stats.push(`⚠️ Fautes : ${m.fouls_home || 0}-${m.fouls_away || 0}`);
        if (m.offsides_home || m.offsides_away) stats.push(`🔴 Hors-jeu : ${m.offsides_home || 0}-${m.offsides_away || 0}`);
        if (m.shots_on_target_home || m.shots_on_target_away) stats.push(`🎯 Tirs cadrés : ${m.shots_on_target_home || 0}-${m.shots_on_target_away || 0}`);

        if (stats.length > 0) message += `   ${stats.join(' | ')}\n`;
        message += "\n";
      }
    }

    // --------------------------
    // PIED DE PAGE
    // --------------------------
    message += `─────────────────────────────────────
#VoltixaiInfosport #ScoresLive #StatistiquesFootball`;

    // --------------------------
    // PUBLICATION
    // --------------------------
    await appelAPI(
      `https://graph.facebook.com/v25.0/${FACEBOOK_PAGE_ID}/feed?access_token=${FACEBOOK_TOKEN}`,
      "POST",
      { message: message.trim() }
    );
    console.log("✅ Publication complète envoyée !");

  } catch (erreur) {
    console.error("❌ ERREUR :", erreur.message);
    process.exit(1);
  }
}

// --------------------------
// LANCEMENT FINAL
// --------------------------
lancerRobot();
    
