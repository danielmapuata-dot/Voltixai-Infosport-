require('dotenv').config();
const express = require('express');
const https = require('https');

// 🔒 Configuration (API-Sports direct)
const API_SPORTS_KEY = process.env.API_SPORTS_KEY || 'df0b577a7727d5206ebe5185f5a619e';
const FACEBOOK_TOKEN = process.env.FACEBOOK_TOKEN || '';
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID || '';

const app = express();
const PORT = process.env.PORT || 3001;

// 📂 État : suivi des matchs pour éviter doublons et suivre leur vie
const suivisMatchs = new Map(); // id -> toutes les infos (état, score, stats)
const TERMINES = [];             // Stocke les matchs qui étaient en direct puis terminés

// 🛡️ En-têtes API-Sports
const headersAPI = {
  'Content-Type': 'application/json',
  'x-apisports-key': API_SPORTS_KEY
};

// 📞 Fonction appel API
function appelAPI(url, customHeaders = {}, bodyData = null) {
  return new Promise((resoudre, rejeter) => {
    const urlObj = new URL(url);
    const estFacebook = urlObj.hostname.includes('facebook.com');

    // On combine les en-têtes (si c'est Facebook, on ne met pas la clé API-Sports)
    const finalHeaders = estFacebook 
      ? { ...customHeaders } 
      : { ...headersAPI, ...customHeaders };

    const payload = bodyData ? JSON.stringify(bodyData) : null;
    if (payload && !finalHeaders['Content-Length']) {
      finalHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: bodyData ? 'POST' : 'GET',
      headers: finalHeaders
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          res.statusCode >= 400 
            ? rejeter(new Error(`Erreur ${res.statusCode}: ${parsed.error ? parsed.error.message : parsed.message || ''}`))
            : resoudre(parsed);
        } catch (e) { rejeter(e); }
      });
    });
    req.on('error', rejeter);
    if (payload) req.write(payload);
    req.end();
  });
}

// 🚩 Drapeau par pays
function getDrapeau(pays) {
  if (!pays) return "🏳️";
  const nom = pays.toLowerCase();
  if (nom.includes("france")) return "🇫🇷";
  if (nom.includes("brazil")) return "🇧🇷";
  if (nom.includes("england")) return "🏴󠁧󠁢󠁥󠁮󠁧󠁿";
  if (nom.includes("spain")) return "🇪🇸";
  if (nom.includes("italy")) return "🇮🇹";
  if (nom.includes("australia")) return "🇦🇺";
  if (nom.includes("china")) return "🇨🇳";
  if (nom.includes("uk") || nom.includes("angleterre")) return "🇬🇧";
  if (nom.includes("myanmar")) return "🇲🇲";
  if (nom.includes("ukraine")) return "🇺🇦";
  return "🏳️";
}

// 📊 Statistiques formatées avec icônes
function formaterStats(match) {
  const stats = match.statistics || [];
  const domicile = stats.find(s => s.team.name === match.teams.home.name) || { statistics: {} };
  const exterieur = stats.find(s => s.team.name === match.teams.away.name) || { statistics: {} };

  const get = (team, cle) => team.statistics[cle]?.value || '0';

  const cornes = `${get(domicile, 'Corner Kicks')}-${get(exterieur, 'Corner Kicks')}`;
  const pos = `${get(domicile, 'Ball Possession') || '50%'}-${get(exterieur, 'Ball Possession') || '50%'}`;
  const tirsCadres = `${get(domicile, 'Shots on Goal')}-${get(exterieur, 'Shots on Goal')}`;
  const tirsTotal = `${get(domicile, 'Total Shots')}-${get(exterieur, 'Total Shots')}`;
  const fautes = `${get(domicile, 'Fouls')}-${get(exterieur, 'Fouls')}`;
  const horsJeu = `${get(domicile, 'Offsides')}-${get(exterieur, 'Offsides')}`;
  const cartonJ = `${get(domicile, 'Yellow Cards')}-${get(exterieur, 'Yellow Cards')}`;
  const cartonR = `${get(domicile, 'Red Cards')}-${get(exterieur, 'Red Cards')}`;
  const remplac = `${get(domicile, 'Substitutions')}-${get(exterieur, 'Substitutions')}`;

  return { cornes, pos, tirsCadres, tirsTotal, fautes, horsJeu, cartonJ, cartonR, remplac };
}

// 📝 Formatage d'un match en texte (style ScoreZone)
function formaterMatch(match, estTermine = false) {
  const d = match.fixture;
  const l = match.league;
  const h = match.teams.home;
  const a = match.teams.away;
  const butH = match.goals.home ?? 0;
  const butA = match.goals.away ?? 0;
  const ht = match.score.halftime || { home: 0, away: 0 };
  const mt = match.score.fulltime ? Math.max(0, butH - ht.home) : 0;
  const at = match.score.fulltime ? Math.max(0, butA - ht.away) : 0;

  const drapeau = getDrapeau(l.country);
  const minute = d.status.short === 'HT' ? 'HT' : `${d.status.elapsed ?? 0}'`;
  const statut = estTermine ? 'FT' : minute;
  const stats = formaterStats(match);

  let bloc = `${drapeau} ${l.name}\n`;
  bloc += `● ${statut} | ${h.name} ${butH}-${butA} ${a.name}\n`;
  bloc += `➡️ 1st Half: ${ht.home}-${ht.away} | 2nd Half: ${mt}-${at}\n`;
  bloc += `🚩 Corners: ${stats.cornes} | 🟨 Yellow: ${stats.cartonJ} | 🔄 Subs: ${stats.remplac}\n`;
  bloc += `🟥 Red: ${stats.cartonR} | ⛔ Offsides: ${stats.horsJeu} | ⚠️ Fouls: ${stats.fautes}\n`;
  bloc += `🎯 Shots on: ${stats.tirsCadres} | 🎯 Total: ${stats.tirsTotal} | 🅿️ Poss: ${stats.pos}\n`;

  return bloc;
}

// 📤 Publication Facebook
async function publier(message) {
  const heureGMT = new Date().toLocaleTimeString('fr-FR', { timeZone: 'GMT', hour: '2-digit', minute: '2-digit' });
  const entete = `⚽🚩 LIVE SCORE ⚽ ${heureGMT} - GMT\n`;
  const pied = `\n——————————————\n#VoltixaiLive #ScoreZone #Football`;
  const msgFinal = entete + message + pied;

  try {
    const url = `https://graph.facebook.com/v21.0/${FACEBOOK_PAGE_ID}/feed`;
    await appelAPI(url, { Authorization: `Bearer ${FACEBOOK_TOKEN}`, 'Content-Type': 'application/json' }, { message: msgFinal });
    console.log("✅ Publié avec succès");
  } catch (err) {
    console.error("❌ Erreur publication :", err.message);
  }
}

// 🔄 Coeur du robot : vérification toutes les 14min
async function surveiller() {
  try {
    console.log("\n🔍 Vérification des matchs...");
    const res = await appelAPI("https://v3.football.api-sports.io/fixtures?live=all");
    const matchsDirect = res.response || [];

    let sectionDirect = "";

    for (const match of matchsDirect) {
      const id = match.fixture.id;
      const statut = match.fixture.status.short;
      const cleEtat = `${statut}-${match.goals.home}-${match.goals.away}`;

      // Ajouter au suivi si nouveau
      if (!suivisMatchs.has(id)) suivisMatchs.set(id, { dejaVu: new Set() });
      const suivi = suivisMatchs.get(id);

      // Si match terminé et pas encore transféré
      if (["FT", "AET", "PEN"].includes(statut) && !suivi.estTermine) {
        suivi.estTermine = true;
        TERMINES.unshift(match); // Ajoute en haut des terminés
        if (TERMINES.length > 20) TERMINES.pop(); // Limite taille
        continue;
      }

      // Si en direct/mi-temps et pas déjà publié dans cet état
      if (!suivi.dejaVu.has(cleEtat)) {
        suivi.dejaVu.add(cleEtat);
        sectionDirect += formaterMatch(match) + "\n";
      }
    }

    // Construire message final
    let messageComplet = "";
    if (sectionDirect) messageComplet += `——————————————\n🔴 EN DIRECT / MI-TEMPS\n${sectionDirect}`;

    // Ajouter les terminés (ceux qu'on a suivis)
    if (TERMINES.length > 0) {
      messageComplet += `\n——————————————\n🏁 FINAL SCORES\n`;
      for (const m of TERMINES) {
        messageComplet += formaterMatch(m, true) + "\n";
      }
    }

    if (messageComplet) await publier(messageComplet);
    else console.log("ℹ️ Aucune nouvelle à publier");

  } catch (e) {
    console.error("❌ Erreur surveillance :", e.message);
  }
}

// 🛡️ Anti-sommeil Render
app.get('/', (req, res) => res.send("⚽ Voltixai ScoreZone - Actif 24h/24"));
app.listen(PORT, () => {
  console.log(`🚀 Serveur actif sur le port ${PORT} | Vérification toutes les 14min`);
  surveiller();
  setInterval(surveiller, 14 * 60 * 1000); // ✅ TOUTES LES 14 MINUTES
});
