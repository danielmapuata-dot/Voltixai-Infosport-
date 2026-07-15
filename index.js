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
// FONCTION APPEL API SÉCURISÉE
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
        try {
          const resultat = JSON.parse(donnees);
          console.log("📦 Réponse API reçue :", typeof resultat, Array.isArray(resultat) ? `(${resultat.length} éléments)` : "objet");
          resoudre(resultat);
        }
        catch (err) { rejeter(new Error(`Réponse illisible : ${donnees.slice(0, 300)}`)); }
      });
    });
    requete.on('error', rejeter);
    if (corps) requete.write(JSON.stringify(corps));
    requete.end();
  });
}

// --------------------------
// FONCTION PRINCIPALE ROBUSTE
// --------------------------
async function lancerRobot() {
  try {
    console.log("⚽ Démarrage Voltixai Infosport...");
    if (!ANYSPORT_API_KEY || !FACEBOOK_PAGE_ID || !FACEBOOK_TOKEN) throw new Error("Clés manquantes !");

    // Récupération et extraction des matchs
    const data = await appelAPI("https://api.anysport.io/v1/livescore");
    let matchs = [];
    if (Array.isArray(data)) matchs = data;
    else if (Array.isArray(data?.data)) matchs = data.data;
    else if (Array.isArray(data?.matches)) matchs = data.matches;
    else if (Array.isArray(data?.response)) matchs = data.response;

    console.log(`✅ ${matchs.length} matchs trouvés au total`);
    if (matchs.length === 0) throw new Error("Aucun match récupéré depuis l'API !");

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
      const championnat = match.league_name || match.tournament_name || match.competition_name || "Matchs divers";
      if (!parChampionnat[championnat]) parChampionnat[championnat] = [];
      parChampionnat[championnat].push(match);
    }

    // --------------------------
    // AFFICHAGE COMPLET
    // --------------------------
    for (const [nomChampionnat, listeMatchs] of Object.entries(parChampionnat)) {
      message += `🏆 ${nomChampionnat}\n`;
      message += `──────────────────────────────\n`;

      for (const m of listeMatchs) {
        const domicile = m.home || m.home_team_name || m.home_team || "Équipe A";
        const exterieur = m.away || m.away_team_name || m.away_team || "Équipe B";
        const scoreFinal = m.score || m.fulltime_score || "0-0";
        const minute = String(m.minute || m.elapsed || m.time || "");
        const statut = m.status === "finished" ? "FT" : m.status === "not_started" ? "À VENIR" : minute ? `${minute}'` : "EN DIRECT";

        message += `● ${statut} | ${domicile} ${scoreFinal} ${exterieur}\n`;

        // Score mi-temps
        const htDom = m.home_ht || m.half_time_home;
        const htExt = m.away_ht || m.half_time_away;
        if (htDom !== undefined && htExt !== undefined) {
          const ht = `${htDom}-${htExt}`;
          const [dom, ext] = String(scoreFinal).split('-').map(Number);
          const [hD, hE] = String(ht).split('-').map(Number);
          const seconde = `${Math.max(0, dom - hD)}-${Math.max(0, ext - hE)}`;
          message += `   ↳ Mi-temps : ${ht} | 2nde période : ${seconde}\n`;
        }

        // Statistiques
        let stats = [];
        if (m.corners_home != null || m.corners_away != null) stats.push(`⚪ Corners : ${m.corners_home||0}-${m.corners_away||0}`);
        if (m.possession != null) stats.push(`📊 Possession : ${m.possession}%`);
        if (m.fouls_home != null || m.fouls_away != null) stats.push(`⚠️ Fautes : ${m.fouls_home||0}-${m.fouls_away||0}`);
        if (m.shots_on_target_home != null || m.shots_on_target_away != null) stats.push(`🎯 Cadrés : ${m.shots_on_target_home||0}-${m.shots_on_target_away||0}`);

        if (stats.length) message += `   ${stats.join(' • ')}\n`;
        message += "\n";
      }
    }

    message += `─────────────────────────────────────
#VoltixaiInfosport #ScoresEnDirect`;
    const messageFinal = message.trim();
    console.log(`📝 Message généré (${messageFinal.length} caractères)`);

    // --------------------------
    // PUBLICATION
    // --------------------------
    const urlFB = `https://graph.facebook.com/v25.0/${FACEBOOK_PAGE_ID}/feed?access_token=${FACEBOOK_TOKEN}`;
    const resultatFB = await appelAPI(urlFB, "POST", { message: messageFinal });

    if (resultatFB.id) console.log(`✅ PUBLIÉ ! Lien : https://facebook.com/${resultatFB.id}`);
    else throw new Error(`Erreur Facebook : ${JSON.stringify(resultatFB.error || resultatFB)}`);

  } catch (erreur) {
    console.error("❌ ERREUR FINALE :", erreur.message);
    process.exit(1);
  }
}

lancerRobot();
                     
