/* eslint-disable no-undef */
import { streamText } from 'ai';

// Оскільки цей скрипт запускається локально або на Vercel з OIDC токеном, 
// він може використовувати AI Gateway для доступу до моделей.
const result = streamText({
  model: 'openai/gpt-5.5',
  prompt: 'Explain quantum computing in simple terms.',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
