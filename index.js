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
// FONCTION D'APPEL API CORRIGÉE
// --------------------------
function appelAPI(url, method = 'GET', corps = null) {
  return new Promise((resoudre, rejeter) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: method.toUpperCase(),
      headers: {
        'X-API-Key': ANYSPORT_API_KEY, // Plus d'espace invisible
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

    // Vérification des valeurs
    if (!ANYSPORT_API_KEY) throw new Error('Clé API AnySport manquante !');
    if (!FACEBOOK_PAGE_ID) throw new Error('ID Page Facebook manquant !');
    if (!FACEBOOK_TOKEN) throw new Error('Jeton Facebook manquant !');
    console.log('✅ Toutes les valeurs sont chargées et valides');

    // 1. Récupérer les matchs
    const urlMatchs = 'https://api.anysport.io/v1/livescore';
    const reponseAPI = await appelAPI(urlMatchs);
    const listeMatchs = reponseAPI.data || reponseAPI || [];
    console.log(`✅ ${listeMatchs.length} matchs récupérés`);

    // ... reste du code de formatage et publication inchangé ...

  } catch (erreur) {
    console.error('❌ ERREUR :', erreur.message);
    process.exit(1);
  }
}

lancerRobot();
      
