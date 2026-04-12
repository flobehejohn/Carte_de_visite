import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey =
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.VITE_GOOGLE_API_KEY ||
  '';

if (!apiKey) {
  console.error('❌ Missing API key. Set GOOGLE_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY).');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

const logError = (label, error) => {
  console.error(`❌ ${label}`);
  console.error(error);
  if (error?.response) {
    console.error('🧾 error.response:', error.response);
  }
  if (error?.response?.data) {
    console.error('🧾 error.response.data:', error.response.data);
  }
  if (error?.status) {
    console.error('🧾 status:', error.status);
  }
  if (error?.message) {
    console.error('🧾 message:', error.message);
  }
};

const normalizeModels = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.models)) return raw.models;
  if (Array.isArray(raw.data)) return raw.data;
  return [];
};

const main = async () => {
  console.log('🔎 Gemini API diagnostic (list models + simple generation)');

  try {
    const listResponse = await genAI.listModels();
    const models = normalizeModels(listResponse);
    console.log(`✅ Models found: ${models.length}`);
    models.forEach((model) => {
      const name = model?.name || model?.model || 'unknown-model';
      const desc = model?.description || '';
      console.log(`- ${name}${desc ? ` :: ${desc}` : ''}`);
    });
  } catch (error) {
    logError('Failed to list models', error);
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent('Hello');
    const response = result?.response;
    const text = response?.text ? response.text() : undefined;
    console.log('✅ Generation succeeded');
    console.log('🟢 Response:', text || response);
  } catch (error) {
    logError('Failed to generate with gemini-1.5-flash', error);
  }
};

main().catch((error) => logError('Unhandled error', error));
