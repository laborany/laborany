import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

console.log('Testing streaming API...');
console.log('Model:', process.env.ANTHROPIC_MODEL);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
});

async function test() {
  try {
    const stream = anthropic.messages.stream({
      model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-5-20251101',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Say hello in 3 words' }],
    });

    console.log('Stream created, waiting for events...');

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if ('text' in delta) {
          process.stdout.write(delta.text);
        }
      }
    }

    console.log('\n\nStream completed!');
    const finalMessage = await stream.finalMessage();
    console.log('Final message:', JSON.stringify(finalMessage, null, 2));
  } catch (error) {
    console.log('Error:', error.message);
    console.log('Error name:', error.name);
    console.log('Full error:', error);
  }
}

test();
