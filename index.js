const ANYSPORT_API_KEY = (process.env.ANYSPORT_API_KEY || '').trim();
const FACEBOOK_PAGE_ID = (process.env.FACEBOOK_PAGE_ID || '').trim();
const FACEBOOK_TOKEN = (process.env.FACEBOOK_TOKEN || '').trim();
const https = require('https');

function appelAPI(url, method = 'GET', corps = null) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const opt = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: method.toUpperCase(),
      headers: { 'X-API-Key': ANYSPORT_API_KEY, 'Accept': 'application/json' }
    };
    const req = https.request(opt, (resu) => {
      let d = '';
      resu.on('data', c => d += c);
      resu.on('end', () => { try { res(JSON.parse(d)); } catch { rej(new Error("Réponse API invalide")); } });
    });
    req.on('error', rej);
    if (corps) req.write(JSON.stringify(corps));
    req.end();
  });
}

async function lancerRobot() {
  try {
    console.log("⚽ Démarrage Voltixai Infosport...");
    if (!ANYSPORT_API_KEY || !FACEBOOK_PAGE_ID || !FACEBOOK_TOKEN) throw new Error("Clés manquantes !");

    const data = await appelAPI("https://api.anysport.io/v1/livescore");
    const matchs = Array.isArray(data) ? data : (data.data || []);
    console.log(`✅ ${matchs.length} matchs récupérés`);

    const heure = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Africa/Brazzaville', hour: '2-digit', minute: '2-digit' });
    let msg = `⚽ VOLTIXAI INFOSPORT LIVE ⚫ ${heure} GMT+1
─────────────────────────────────────\n\n`;

    const groupes = {};
    for (const m of matchs) {
      const cle = `${m.country_name || "Monde"} ⚫ ${m.league_name || "Matchs"}`;
      if (!groupes[cle]) groupes[cle] = [];
      groupes[cle].push(m);
    }

    for (const [nom, liste] of Object.entries(groupes)) {
      msg += `🏆 ${nom}\n`;
      for (const m of liste) {
        const dom = m.home || m.home_team || "Équipe A";
        const ext = m.away || m.away_team || "Équipe B";
        const score = m.score || "0-0";
        const min = String(m.minute || m.elapsed || "");
        const statut = m.status === "finished" ? "FT" : m.status === "not_started" ? "À VENIR" : min ? `${min}'` : "EN DIRECT";
        msg += `● ${statut} | ${dom} ${score} ${ext}\n`;
      }
      msg += "\n";
    }

    msg += `─────────────────────────────────────
⚪ Corners / Coups de coin
⚠️ Fautes / Fautes
🔴 Hors-jeu / Hors-jeu
🎯 Tirs cadrés / Tirs cadrés

#VoltixaiInfosport #ScoresLive`;

    await appelAPI(`https://graph.facebook.com/v25.0/${FACEBOOK_PAGE_ID}/feed?access_token=${FACEBOOK_TOKEN}`, "POST", { message: msg.trim() });
    console.log("✅ Publié !");
  } catch (err) {
    console.error("❌ ERREUR :", err.message);
    process.exit(1);
  }
}

lancerRobot();
      
