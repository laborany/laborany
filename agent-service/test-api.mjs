import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

console.log('API Key:', process.env.ANTHROPIC_API_KEY?.substring(0, 20) + '...');
console.log('Base URL:', process.env.ANTHROPIC_BASE_URL);
console.log('Model:', process.env.ANTHROPIC_MODEL);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
});

async function test() {
  try {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-5-20251101',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Hello' }],
    });
    console.log('Success:', JSON.stringify(response, null, 2));
  } catch (error) {
    console.log('Error:', error.message);
    console.log('Full error:', JSON.stringify(error, null, 2));
  }
}

test();
