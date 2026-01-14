# LLM_BLUEPRINT

## 1) AUTOPSIE DU DASHBOARD

- Stack detectee : Next.js (client) + Node.js (server Apollo) + Socket.io. LLM cote serveur via `@dexaai/dexter` (ChatModel + createAIRunner).
- Fichiers critiques :
  - `C:\ATLAS\INBOX\dev\R_D\financial_dashboard\version_finale_github\Dashboard_demo-main\dashboard-main\server\chat\chat-processor.ts` (selection du modele + createAIRunner)
  - `C:\ATLAS\INBOX\dev\R_D\financial_dashboard\version_finale_github\Dashboard_demo-main\dashboard-main\server\chat\chat.ts` (canal Socket.io "chat")
  - `C:\ATLAS\INBOX\dev\R_D\financial_dashboard\version_finale_github\Dashboard_demo-main\dashboard-main\client\src\Organisms\ChatChannel.ts` (client -> socket)
- Mecanisme : le client envoie un message via Socket.io, le serveur appelle `handleChatRequest` qui instancie `ChatModel` et `createAIRunner` puis renvoie le dernier message assistant.
- Modele actif : `openai:gpt-4o-mini` (hardcode dans `chat-processor.ts`). Note : `chat-helpers.ts` contient un appel direct OpenAI sur `o1-mini`, mais il n'est pas utilise par le flux Socket principal.

## 2) LE FICHIER .ENV "MAGIQUE"

Constat : aucun `.env` LLM dans le repo source. Le seul fichier d'env fourni est `client/env.docker` avec `NEXT_PUBLIC_GRAPHQL_ENDPOINT=/graphql`.

Dans le dashboard, l'auth LLM est implicite via le SDK OpenAI (variable standard `OPENAI_API_KEY`).

A mettre dans `C:\ATLAS\INBOX\dev\R_D\carte_de_visite\test_unitaire\app_llmed\.env` :

```
OPENAI_API_KEY=sk-xxxx
# Optionnel (si tu veux activer le fallback local Ollama)
OLLAMA_HOST=http://localhost:11434
```

## 3) LE CODE DE TRANSPLANTATION

Le dashboard ne fait PAS d'appel LLM cote navigateur : il passe par un serveur et un canal Socket.io. Pour cloner ce pattern, `zarathustraService.ts` doit appeler un endpoint backend (ou Socket) qui execute `createAIRunner`.

Version adaptee (serveur Node) :

```ts
// server/zarathustra/zarathustra-processor.ts
import { ChatModel, createAIRunner } from '@dexaai/dexter';
import type { OracleResult, RitualInput } from '../src/domain/types';

const SYSTEM_PROMPT = `You are Zarathustra. Context: A user asks a question via a digital ritual.
Your Task:
1. Select a philosophical theme based on their input.
2. Generate/Select a citation that sounds exactly like Nietzsche's "Thus Spoke Zarathustra".
3. Write a mystical, intense interpretation addressing the user directly.
Output JSON format: { "quote": "...", "interpretation": "...", "keywords": [...] }`;

const chatModel = new ChatModel({
  params: {
    model: 'gpt-4o-mini',
    temperature: 0.7,
  },
  debug: true,
});

const runner = createAIRunner({
  chatModel,
  functions: [],
  maxIterations: 5,
  systemMessage: SYSTEM_PROMPT,
});

export async function consultOracleServer(ritual: RitualInput): Promise<OracleResult> {
  const result = await runner({
    messages: [{ role: 'user', content: JSON.stringify(ritual) }],
  });

  const last = result.messages[result.messages.length - 1]?.content || '{}';
  const payload = JSON.parse(last);

  return {
    quote: payload.quote ?? '',
    interpretation: payload.interpretation ?? '',
    keywords: Array.isArray(payload.keywords) ? payload.keywords.map(String) : [],
    ritual,
  };
}
```

Version front (app_llmed) :

```ts
// src/services/zarathustraService.ts
import type { OracleResult, RitualInput } from '../domain/types';

export async function consultOracle(ritual: RitualInput): Promise<OracleResult> {
  const response = await fetch('/api/zarathustra', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ritual }),
  });

  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status}`);
  }

  return (await response.json()) as OracleResult;
}
```

Dependencies a installer si tu clones le pattern Dexaai :

```
npm install @dexaai/dexter @agentic/core @agentic/dexter openai
```

## 4) DIAGNOSTIC DIFFERENTIEL (POURQUOI CA MARCHE LA-BAS MAIS PAS ICI)

- Le dashboard fait l'appel LLM cote serveur (Node), donc pas de CORS et pas d'exposition de cle API navigateur.
- Le dashboard utilise OpenAI (`openai:gpt-4o-mini`) via `ChatModel`, pas l'API Google Gemini. Ton 404 sur `gemini-1.5-flash` est probablement lie a un modele non active sur ton projet Google ou a un endpoint inapproprie.
- Dans `app_llmed`, la logique actuelle appelle l'LLM directement depuis le navigateur (via `openai` avec `dangerouslyAllowBrowser`), ce qui est plus fragile (CORS, quotas, restrictions d'origine). Le pattern "dashboard" evite ces problemes en centralisant l'appel sur un backend.
