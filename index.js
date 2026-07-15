// --------------------------
// CONFIGURATION SÉCURISÉE (NETTOIE LES VALEURS)
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
        try {
          const resultat = JSON.parse(donnees);
          resoudre(resultat);
        } catch (err) {
          rejeter(new Error(`Réponse illisible : ${donnees.slice(0, 150)}`));
        }
      });
    });

    requete.on('error', (erreurReseau) => {
      rejeter(new Error(`Erreur connexion : ${erreurReseau.message}`));
    });

    if (corps) {
      requete.write(JSON.stringify(corps));
    }
    requete.end();
  });
}

// --------------------------
// FONCTION DE FORMATAGE DU MESSAGE (STYLE DE L'IMAGE)
// --------------------------
function formaterPublication(listeMatchs) {
  // 1. Obtenir l'heure actuelle au format GMT (HH:MM)
  const maintenant = new Date();
  const optionsHeure = { hour: '2-digit', minute: '2-digit', timeZone: 'GMT', hour12: false };
  const heureGMT = maintenant.toLocaleTimeString('fr-FR', optionsHeure);

  // En-tête modifié : VOLTIXAI LIVE à la place de LIVE SCORE
  let texte = `⚽🚩 VOLTIXAI LIVE ➜ ${heureGMT} - GMT\n\n`;

  // 2. Regrouper les matchs par Pays et par Ligue
  const groupes = {};
  listeMatchs.forEach(match => {
    const pays = match.country || 'International';
    const drapeau = match.country_logo || '🌍'; 
    const competition = match.league_name || 'Coupe';

    const cleUnique = `${drapeau} ${pays} ➜ ${competition}`;
    if (!groupes[cleUnique]) {
      groupes[cleUnique] = [];
    }
    groupes[cleUnique].push(match);
  });

  // 3. Construire le contenu pour chaque groupe
  for (const [ligue, matchs] of Object.entries(groupes)) {
    texte += `${ligue}\n`;

    matchs.forEach(match => {
      // Temps du match
      const statut = match.status || 'FT';
      
      // Ligne principale du match
      texte += `⚫ ${statut} | ${match.home_name} ${match.score_home || 0}-${match.score_away || 0} ${match.away_name}\n`;

      // Mi-temps (si disponibles)
      const miTemps1 = match.score_first_half || '0-0';
      const miTemps2 = match.score_second_half || '0-0';
      texte += `  ➜ 1st Half : ${miTemps1} | 2nd Half : ${miTemps2}\n`;

      // Statistiques
      const stats = match.stats || {};
      const corners = stats.corners || '0-0';
      const jaunes = stats.yellow_cards || '0-0';
      const horsJeu = stats.offsides || '0-0';
      const changements = stats.substitutions || '0-0';
      const totalTirs = stats.total_shots || '0-0';
      const tirsCadres = stats.shots_on_target || '0-0';
      const fautes = stats.fouls || '0-0';
      const possession = stats.possession || null;

      // Affichage des statistiques
      texte += `  ⛳ ${corners}  🟨 ${jaunes}  ⛔ ${horsJeu}  🔄 ${changements}  🏹 ${totalTirs}\n`;
      texte += `  🎯 ${tirsCadres}  ⚠️ ${fautes}\n`;
      
      if (possession) {
        texte += `  🅿️ ${possession}\n`;
      }
    });

    texte += `\n`; 
  }

  // 4. Légende fixe
  texte += `────────────────────\n`;
  texte += `⛳ Corner kicks | Corners\n`;
  texte += `⚠️ Fouls | Fautes\n`;
  texte += `⛔ Offsides | Hors-jeu\n`;
  texte += `🎯 Shots on target | Tirs cadres\n`;
  texte += `🏹 Total shots | Total tirs\n`;

  return texte;
}

// --------------------------
// FONCTION PRINCIPALE
// --------------------------
async function lancerRobot() {
  try {
    console.log('⚽ Démarrage Voltixai Infosport...');

    // Vérification des variables d'environnement
    if (!ANYSPORT_API_KEY) throw new Error('Clé API AnySport manquante !');
    if (!FACEBOOK_PAGE_ID) throw new Error('ID Page Facebook manquant !');
    if (!FACEBOOK_TOKEN) throw new Error('Jeton Facebook manquant !');
    console.log('✅ Configuration environnement OK');

    // 1. Récupération des scores en direct
    const urlMatchs = 'https://api.anysport.io/v1/livescore';
    console.log('📡 Récupération des matchs en direct...');
    const reponseAPI = await appelAPI(urlMatchs);
    const listeMatchs = reponseAPI.data || reponseAPI || [];
    
    if (listeMatchs.length === 0) {
      console.log('⚠️ Aucun match en direct disponible actuellement.');
      return;
    }
    console.log(`✅ ${listeMatchs.length} matchs récupérés`);

    // 2. Formatage du texte
    const messageFacebook = formaterPublication(listeMatchs);
    console.log('📝 Message formaté prêt pour publication :\n');
    console.log(messageFacebook);

    // 3. Envoi sur Facebook
    console.log('🚀 Envoi vers Facebook...');
    const urlFacebook = `https://graph.facebook.com/v25.0/${FACEBOOK_PAGE_ID}/feed`;
    const corpsFB = {
      message: messageFacebook,
      access_token: FACEBOOK_TOKEN
    };

    const reponseFB = await appelAPI(urlFacebook, 'POST', corpsFB);

    if (reponseFB.id) {
      console.log(`🎯 Succès ! Post publié avec l'ID : ${reponseFB.id}`);
    } else {
      throw new Error(`Réponse inattendue de Facebook : ${JSON.stringify(reponseFB)}`);
    }

  } catch (erreur) {
    console.error('❌ ERREUR :', erreur.message);
    process.exit(1);
  }
}

lancerRobot();
                     
