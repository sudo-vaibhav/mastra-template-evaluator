import { createOpenRouter } from '@openrouter/ai-sdk-provider';
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY
});
export const model = openrouter.chat("openai/gpt-oss-20b")
