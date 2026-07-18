import { defineConfig } from 'orval';

export default defineConfig({
  atlas: {
    input: './packages/api-contracts/openapi.json',
    output: {
      clean: true,
      client: 'fetch',
      mode: 'single',
      target: './packages/api-contracts/generated/client.ts',
    },
  },
});
