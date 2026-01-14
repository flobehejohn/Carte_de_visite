import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

// Lecture manuelle du fichier .env pour récupérer la clé
const envPath = path.resolve(process.cwd(), '.env');
let apiKey = '';

try {
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        const match = content.match(/VITE_GOOGLE_API_KEY=(.*)/);
        if (match && match[1]) apiKey = match[1].trim();
    }
} catch (e) { console.error('Erreur lecture .env'); }

console.log('------------------------------------------------');
console.log('🔍 DIAGNOSTIC ZARATHOUSTRA');
console.log('------------------------------------------------');

if (!apiKey) {
    console.error('❌ ERREUR : Clé API introuvable dans le fichier .env');
    console.error('Vérifie que VITE_GOOGLE_API_KEY est bien défini.');
    process.exit(1);
}

console.log('🔑 Clé détectée (fin) : ...' + apiKey.slice(-6));
console.log('📡 Tentative de connexion au modèle gemini-1.5-flash...');

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

async function run() {
    try {
        const result = await model.generateContent('Es-tu là, Zarathoustra ? Réponds simplement par OUI.');
        const response = await result.response;
        const text = response.text();
        
        console.log('\n✅ SUCCÈS TOTAL !');
        console.log('🤖 Réponse reçue : ' + text.trim());
        console.log('------------------------------------------------');
        console.log('👉 Conclusion : Ton compte Billing est ACTIF et ta clé fonctionne.');
        console.log('👉 Action : Relance ton app React (npm run dev) et ça marchera.');
    } catch (error) {
        console.log('\n❌ ÉCHEC DU TEST');
        console.error('Erreur brute :', error.message);
        
        if (error.message.includes('404')) {
            console.log('\n⚠️ ANALYSE : Erreur 404 persistante.');
            console.log('La liaison Facturation <-> Projet prend du temps.');
            console.log('Attends encore 5 minutes et relance ce test.');
        }
    }
}

run();
