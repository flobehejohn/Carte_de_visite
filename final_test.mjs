import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

// --- 1. CHARGEMENT MANUEL DU .ENV (Pour éviter les problèmes de dépendances) ---
function loadEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(/VITE_GOOGLE_API_KEY=(.*)/);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch (e) {
    console.error("Erreur lecture .env", e);
  }
  return null;
}

// --- 2. RÉCUPÉRATION DE LA CLÉ ---
// Priorité : Clé collée ci-dessous > Fichier .env > Variables système
const HARDCODED_KEY = ""; // 👈 COLLE TA CLÉ ICI SI LE .ENV NE MARCHE PAS
const ENV_KEY = loadEnv();
const apiKey = HARDCODED_KEY || ENV_KEY || process.env.VITE_GOOGLE_API_KEY;

console.log("---------------------------------------------------");
console.log("🔍 DIAGNOSTIC ULTIME GEMINI");
console.log("---------------------------------------------------");

if (!apiKey) {
  console.error("❌ ERREUR FATALE : Aucune clé API trouvée.");
  console.error("👉 Vérifie que le fichier .env contient bien : VITE_GOOGLE_API_KEY=AIza...");
  process.exit(1);
} else {
  console.log(`✅ Clé trouvée : ...${apiKey.slice(-6)}`);
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const main = async () => {
  console.log('📡 Tentative de contact avec Gemini 1.5 Flash...');
  
  try {
    const result = await model.generateContent('Réponds juste par le mot : CONNECTÉ');
    const response = await result.response;
    const text = response.text();
    
    console.log("\n✅ SUCCÈS ! LA CONNEXION FONCTIONNE.");
    console.log(`🤖 Réponse de l'IA : ${text}`);
    console.log("---------------------------------------------------");
    console.log("CONCLUSION : Ta clé est valide et l'API répond.");
    console.log("Si ton app React ne marche pas, le problème vient du cache Vite ou du composant React, pas de la clé.");

  } catch (error) {
    console.log("\n❌ ÉCHEC DE LA CONNEXION");
    console.error("---------------------------------------------------");
    
    if (error.message.includes("404")) {
      console.error("🔴 ERREUR 404 (Not Found)");
      console.error("Cela signifie que le PROJET Google Cloud lié à cette clé n'a pas accès à l'API.");
      console.error("SOLUTION : Crée une nouvelle clé dans un NOUVEAU PROJET Google AI Studio.");
    } else if (error.message.includes("400") || error.message.includes("403")) {
        console.error("🔴 ERREUR PERMISSION (400/403)");
        console.error("La clé est invalide ou mal copiée.");
    } else {
        console.error("Erreur brute :", error);
    }
  }
};

main();