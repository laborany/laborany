import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

// 读取 SKILL.md
const skillPath = resolve(__dirname, '../skills/financial-report/SKILL.md');
const systemPrompt = readFileSync(skillPath, 'utf-8');

console.log('System prompt length:', systemPrompt.length);
console.log('First 200 chars:', systemPrompt.substring(0, 200));

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
});

async function test() {
  try {
    // 将 system prompt 嵌入用户消息（兼容某些代理服务不支持 system 参数）
    const stream = anthropic.messages.stream({
      model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-5-20251101',
      max_tokens: 100,
      messages: [{ role: 'user', content: `${systemPrompt}\n\n---\n\n用户问题：你好` }],
    });

    console.log('\nStream created, waiting for events...');

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if ('text' in delta) {
          process.stdout.write(delta.text);
        }
      }
    }

    console.log('\n\nStream completed!');
  } catch (error) {
    console.log('\nError:', error.message);
    console.log('Status:', error.status);
    console.log('Error body:', JSON.stringify(error.error, null, 2));
  }
}

test();
