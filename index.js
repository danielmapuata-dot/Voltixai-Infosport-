// --------------------------
// CONFIGURATION
// --------------------------
const ANYSPORT_API_KEY = process.env.ANYSPORT_API_KEY;
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const FACEBOOK_TOKEN = process.env.FACEBOOK_TOKEN;

// --------------------------
// BIBLIOTHÈQUES
// --------------------------
const https = require('https');
const fs = require('fs');

const FICHIER_MEMOIRE = './memoire.json';

// --------------------------
// MÉMOIRE DES MATCHS
// --------------------------
function chargerMemoire() {
  try {
    return JSON.parse(fs.readFileSync(FICHIER_MEMOIRE, 'utf8'));
  } catch {
    return {};
  }
}

function sauvegarderMemoire(memoire) {
  fs.writeFileSync(
    FICHIER_MEMOIRE,
    JSON.stringify(memoire, null, 2)
  );
}

// --------------------------
// APPEL API
// --------------------------
function appelAPI(url, method = 'GET', corps = null) {
  return new Promise((resoudre, rejeter) => {

    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'X-API-Key': ANYSPORT_API_KEY,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    const requete = https.request(options, reponse => {

      let donnees = '';

      reponse.on('data', morceau => donnees += morceau);

      reponse.on('end', () => {
        try {
          resoudre(JSON.parse(donnees));
        } catch {
          rejeter(new Error(donnees));
        }
      });

    });

    requete.on('error', rejeter);

    if (corps) {
      requete.write(JSON.stringify(corps));
    }

    requete.end();
  });
}


// --------------------------
// ROBOT PRINCIPAL
// --------------------------
async function lancerRobot() {

try {

console.log("⚽ Démarrage Voltixai Live Foot");


const urlMatchs =
'https://api.anysport.io/v1/livescore';


const reponseAPI =
await appelAPI(urlMatchs);


// Voir la réponse API dans GitHub Actions
console.log(JSON.stringify(reponseAPI,null,2));


const listeMatchs =
reponseAPI.data || [];


console.log(`✅ ${listeMatchs.length} matchs trouvés`);


const heure =
new Date().toLocaleTimeString('fr-FR',{
timeZone:'Africa/Brazzaville',
hour:'2-digit',
minute:'2-digit'
});


let message =
`⚽ 🚩 VOLTIXAI LIVE FOOT ⚡
🕒 ${heure} GMT+1

========================

`;


let changement=false;


let memoire = chargerMemoire();



// --------------------------
// TRAITEMENT DES MATCHS
// --------------------------

for(const match of listeMatchs){


const id =
match.match_id ||
match.id ||
Date.now();


const ancien =
memoire[id] ||
{
statut:"",
score:""
};



const domicile =
match.home ||
match.home_team?.name ||
"Équipe 1";


const exterieur =
match.away ||
match.away_team?.name ||
"Équipe 2";


const score =
match.score ||
`${match.home_score || 0}-${match.away_score || 0}`;



// MATCH À VENIR

if(
match.status === "not_started" &&
ancien.statut !== "a_venir"
){

message +=
`📅 MATCH À VENIR

🏟️ ${domicile} 🆚 ${exterieur}

⏰ ${match.time || "À confirmer"}

🏆 ${match.league_name || "Football"}

\n`;

memoire[id]={
statut:"a_venir",
score:""
};

changement=true;

}



// DIRECT

if(
match.status==="live" &&
score!==ancien.score
){

message +=
`⚡ EN DIRECT ⚡

🏟️ ${domicile} 🆚 ${exterieur}

📊 Score : ${score}

⏱️ ${match.minute || "En cours"}

🏆 ${match.league_name || "Football"}

`;


if(ancien.score){
message += "🥳 GOOOOAL ! 🥳\n\n";
}


memoire[id]={
statut:"live",
score
};


changement=true;

}



// FINI

if(
match.status==="finished" &&
ancien.statut!=="termine"
){

message +=
`✅ RESULTAT FINAL

🏟️ ${domicile} 🆚 ${exterieur}

📊 ${score}

🏆 ${match.league_name || "Football"}

\n`;


memoire[id]={
statut:"termine",
score
};


changement=true;

}


}


// Sauvegarde mémoire

sauvegarderMemoire(memoire);



// Aucun changement

if(!changement){

message +=
"Aucune nouvelle mise à jour pour l'instant.\n";

}



message +=
"\n#VoltixaiLiveFoot #FootEnDirect";



const messageFinal =
message.trim();


// Protection message vide

if(messageFinal.length < 20){

console.log(
"⚠️ Publication annulée : message trop court"
);

return;

}



// --------------------------
// FACEBOOK
// --------------------------

const urlPublication =
`https://graph.facebook.com/v25.0/${FACEBOOK_PAGE_ID}/feed`;


const resultat =
await appelAPI(
`${urlPublication}?access_token=${FACEBOOK_TOKEN}`,
"POST",
{
message:messageFinal
}
);



if(resultat.id){

console.log(
"✅ Publication réussie :",
resultat.id
);

}else{

console.log(
"❌ Facebook erreur :",
resultat.error
);

}


}

catch(e){

console.error(
"❌ Erreur robot :",
e.message
);

process.exit(1);

}

}



lancerRobot();
