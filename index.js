// CONFIGURATION
const ANYSPORT_API_KEY = (process.env.ANYSPORT_API_KEY || '').trim();
const FACEBOOK_PAGE_ID = (process.env.FACEBOOK_PAGE_ID || '').trim();
const FACEBOOK_TOKEN = (process.env.FACEBOOK_TOKEN || '').trim();
const https = require('https');

// APPEL API SÉCURISÉ
function appelAPI(url, method = 'GET', corps = null) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const opt = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: method.toUpperCase(),
      headers: {
        'X-API-Key': ANYSPORT_API_KEY,
        'Accept': 'application/json'
      }
    };
    const req = https.request(opt, (resu) => {
      let d = '';
      resu.on('data', c => d += c);
      resu.on('end', () => {
        try { res(JSON.parse(d)); }
        catch { rej(new Error("Réponse API illisible")); }
      });
    });
    req.on('error', rej);
    if (corps) req.write(JSON.stringify(corps));
    req.end();
  });
}

// LANCEMENT PRINCIPAL
async function main() {
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

    // ENTÊTE
    let msg = `⚽ VOLTIXAI INFOSPORT LIVE ⚫ ${heure} GMT+1
─────────────────────────────────────\n\n`;

    // REGROUPEMENT PAR CHAMPIONNAT
    const groupes = {};
    for (const m of matchs) {
      const pays = m.country_name || "Monde";
      const ligue = m.league_name || "Matchs divers";
      const cle = `${pays} ⚫ ${ligue}`;
      if (!groupes[cle]) groupes[cle] = [];
      groupes[cle].push(m);
    }

    // AFFICHAGE FORMAT MODÈLE
    for (const [nom, liste] of Object.entries(groupes)) {
      msg += `🏆 ${nom}\n`;
      for (const m of liste) {
        const dom = m.home || m.home_team || "Équipe domicile";
        const ext = m.away || m.away_team || "Équipe extérieur";
        const score = m.score || "0-0";
        const min = String(m.minute || m.elapsed || "").toUpperCase();
        let statut = m.status === "finished" ? "FT" : m.status === "not_started" ? "À VENIR" : min || "EN DIRECT";

        msg += `● ${statut} | ${dom} ${score} ${ext}\n`;
      }
      msg += "\n";
    }

    // LÉGENDE
    msg += `─────────────────────────────────────
⚪ Corners / Coups de coin
⚠️ Fautes / Fautes
🔴 Hors-jeu / Hors-jeu
🎯 Tirs cadrés / Tirs cadrés
📊 Possession / Possession

#VoltixaiInfosport #ScoresLive`;

    // PUBLICATION
    const urlFB = `https://graph.facebook.com/v25.0/${FACEBOOK_PAGE_ID}/feed?access_token=${FACEBOOK_TOKEN}`;
    await appelAPI(urlFB, "POST", { message: msg.trim() });
    console.log("✅ Publié sur Facebook !");

  } catch (err) {
    console.error("❌ ERREUR :", err.message);
    process.exit(1);
  }
}

main();
           
