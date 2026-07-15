// --------------------------
// CONFIGURATION SÉCURISÉE
// --------------------------
const ANYSPORT_API_KEY = (process.env.ANYSPORT_API_KEY || '').trim();
const FACEBOOK_PAGE_ID = (process.env.FACEBOOK_PAGE_ID || '').trim();
const FACEBOOK_TOKEN = (process.env.FACEBOOK_TOKEN || '').trim();

// --------------------------
// BIBLIOTHÈQUE
// --------------------------
const https = require('https');

// --------------------------
// APPEL API
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
    const requete = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resoudre(JSON.parse(data)); } catch (e) { rejeter(e); } });
    });
    requete.on('error', rejeter);
    if (corps) requete.write(JSON.stringify(corps));
    requete.end();
  });
}

// --------------------------
// FONCTION PRINCIPALE COMPACTE
// --------------------------
async function lancerRobot() {
  try {
    console.log('⚽ Démarrage...');
    if (!ANYSPORT_API_KEY || !FACEBOOK_PAGE_ID || !FACEBOOK_TOKEN) throw new Error('Valeurs manquantes');

    const data = await appelAPI('https://api.anysport.io/v1/livescore');
    const matchs = data.data || data || [];
    const heure = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Africa/Brazzaville', hour: '2-digit', minute: '2-digit' });

    // ENTÊTE COURTE
    let msg = `⚽ VOLTIXAI INFOSPORT • ${heure} GMT+1
────────────────────────────\n`;

    // REGROUPEMENT PAR CHAMPIONNAT
    const groupes = {};
    for (const m of matchs) {
      const cle = `${m.country_name || "Monde"} • ${m.league_name || "Matchs"}`;
      if (!groupes[cle]) groupes[cle] = [];
      groupes[cle].push(m);
    }

    // AFFICHAGE COMPACT
    for (const [nom, liste] of Object.entries(groupes)) {
      msg += `\n🏆 ${nom}\n`;
      for (const m of liste) {
        const stat = m.status === 'finished' ? 'FT' : m.status === 'not_started' ? 'À VENIR' : `${m.minute || m.elapsed || "HT"}'`;
        const score = m.score || '0-0';
        msg += `● ${stat} | ${m.home || "?"} ${score} ${m.away || "?"}\n`;
      }
    }

    msg += `\n#VoltixaiInfosport #ScoresLive`;
    console.log('✅ Message généré compact');

    // PUBLICATION
    await appelAPI(
      `https://graph.facebook.com/v25.0/${FACEBOOK_PAGE_ID}/feed?access_token=${FACEBOOK_TOKEN}`,
      'POST',
      { message: msg.trim() }
    );
    console.log('✅ Publié');

  } catch (err) {
    console.error('❌ Erreur :', err.message);
    process.exit(1);
  }
}

lancerRobot();
      
