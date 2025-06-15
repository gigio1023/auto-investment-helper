import { randomBytes, createHash } from 'crypto';

// Polyfill crypto for Node.js test environment
if (!globalThis.crypto) {
  globalThis.crypto = {
    getRandomValues: (arr: Uint8Array) => {
      const buffer = randomBytes(arr.length);
      arr.set(buffer);
      return arr;
    },
    randomUUID: () => {
      return randomBytes(16).toString('hex');
    },
    subtle: {} as any,
  } as any;
}

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = ':memory:';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.OPENAI_API_KEY = 'test-openai-key';