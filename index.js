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
    // ENTÊTE OBLIGATOIRE (STYLE SCORE ZONE)
    // --------------------------
    let message = `⚽ 🚩 LIVE SCORE ❯ ${heure} - GMT\n\n`;

    // --------------------------
    // SI AUCUN MATCH, ON AFFICHE QUAND MÊME UN MESSAGE
    // --------------------------
    if (matchs.length === 0) {
      message += "ℹ️ Aucun match en direct pour le moment.\nRevenez plus tard pour suivre les compétitions !\n";
    } else {
      // --------------------------
      // REGROUPEMENT PAR PAYS ET CHAMPIONNAT
      // --------------------------
      const parChampionnat = {};
      for (const match of matchs) {
        const pays = match.country_name || match.country || "World";
        const championnat = match.league_name || match.tournament_name || "Matchs divers";
        const cleUnique = `${pays} ❯ ${championnat}`;
        
        if (!parChampionnat[cleUnique]) parChampionnat[cleUnique] = [];
        parChampionnat[cleUnique].push(match);
      }

      // --------------------------
      // AFFICHAGE DES MATCHS
      // --------------------------
      for (const [nomChampionnat, listeMatchs] of Object.entries(parChampionnat)) {
        message += `🚩 ${nomChampionnat}\n`;

        for (const m of listeMatchs) {
          const domicile = m.home || m.home_team_name || "Équipe A";
          const exterieur = m.away || m.away_team_name || "Équipe B";
          const scoreFinal = m.score || "0-0";
          const minute = String(m.minute || m.elapsed || "");
          const statut = m.status === "finished" ? "FT" : m.status === "not_started" ? "À VENIR" : minute ? `${minute}'` : "LIVE";

          // Ligne principale du match (ex: 🔘 FT | Guangzhou Dandelion 2-3 Hubei Istar)
          message += `🔘 ${statut} | ${domicile} ${scoreFinal} ${exterieur}\n`;

          // --- EXTRACTION MI-TEMPS SÉCURISÉE ---
          let htDom = null;
          let htExt = null;

          // Recherche des valeurs dans tous les formats d'API AnySport possibles
          if (m.home_ht !== undefined && m.home_ht !== null && m.home_ht !== '') {
            htDom = parseInt(m.home_ht, 10);
            htExt = parseInt(m.away_ht, 10);
          } else if (m.half_time_home !== undefined && m.half_time_home !== null && m.half_time_home !== '') {
            htDom = parseInt(m.half_time_home, 10);
            htExt = parseInt(m.half_time_away, 10);
          } else if (m.score_halftime) {
            const parts = String(m.score_halftime).split('-');
            if (parts.length === 2) {
              htDom = parseInt(parts[0], 10);
              htExt = parseInt(parts[1], 10);
            }
          } else if (m.scores && m.scores.halftime) {
            htDom = parseInt(m.scores.halftime.home, 10);
            htExt = parseInt(m.scores.halftime.away, 10);
          }

          let firstHalfStr = "-";
          let secondHalfStr = "-";

          // Si on a des scores de mi-temps valides
          if (htDom !== null && !isNaN(htDom) && htExt !== null && !isNaN(htExt)) {
            firstHalfStr = `${htDom}-${htExt}`;

            // Calcul du score de la 2ème mi-temps (Total - Mi-temps)
            if (scoreFinal && scoreFinal.includes("-")) {
              const scoresTotal = scoreFinal.split("-").map(Number);
              if (scoresTotal.length === 2) {
                const totalDom = scoresTotal[0];
                const totalExt = scoresTotal[1];
                const dom2nd = Math.max(0, totalDom - htDom);
                const ext2nd = Math.max(0, totalExt - htExt);
                secondHalfStr = `${dom2nd}-${ext2nd}`;
              }
            }
          }

          // Ligne des scores par mi-temps
          message += `   ➡️ 1st Half : ${firstHalfStr} | 2nd Half : ${secondHalfStr}\n`;

          // --- SECTION STATISTIQUES ---
          const stats = m.stats || m.statistics;
          if (stats) {
            const cornersDom = stats.corners?.home || 0;
            const cornersExt = stats.corners?.away || 0;
            const jaunesDom = stats.yellow_cards?.home || 0;
            const jaunesExt = stats.yellow_cards?.away || 0;
            const rougesDom = stats.red_cards?.home || 0;
            const rougesExt = stats.red_cards?.away || 0;
            const tirsCadresDom = stats.shots_on_target?.home || 0;
            const tirsCadresExt = stats.shots_on_target?.away || 0;
            const possessionDom = stats.possession?.home || "50%";
            const possessionExt = stats.possession?.away || "50%";

            message += `   ⛳ ${cornersDom}-${cornersExt}  🟨 ${jaunesDom}-${jaunesExt}  🟥 ${rougesDom}-${rougesExt}  🎯 ${tirsCadresDom}-${tirsCadresExt}\n`;
            message += `   🅿️ ${possessionDom}-${possessionExt}\n`;
          }
          
          message += "\n";
        }
      }
    }

    // --------------------------
    // LÉGENDE DE PIED DE PAGE ET HASHTAGS
    // --------------------------
    message += `──────────────────────────────\n`;
    message += `⛳ Corner kicks | Corners\n`;
    message += `🟨 Yellow cards | Cartons jaunes\n`;
    message += `🟥 Red cards | Cartons rouges\n`;
    message += `🎯 Shots on target | Tirs cadres\n`;
    message += `🅿️ Possession | Possession de balle\n`;
    message += `========================================\n#VoltixaiInfosport #FootballLive #ScoresEnDirect`;

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
    else throw new Error(`Erreur Facebook : ${JSON.stringify(resultatFB.error || resultatFB)}`);

  } catch (erreur) {
    console.error("❌ ERREUR :", erreur.message);
    process.exit(1);
  }
}

lancerRobot();
                     
