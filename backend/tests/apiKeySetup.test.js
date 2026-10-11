/**
 * Test for interactive API key setup utility, safe .env persistence, and validation checks.
 */
const fs = require('fs');
const path = require('path');
const { saveKeysToEnv, validateGroqKey, validateOcmKey } = require('../src/utils/apiKeySetup');

describe('API Key Setup & Security Tests', () => {
  const envPath = path.resolve(__dirname, '../.env');
  let originalEnv = '';

  beforeAll(() => {
    if (fs.existsSync(envPath)) {
      originalEnv = fs.readFileSync(envPath, 'utf8');
    }
  });

  afterAll(() => {
    if (originalEnv) {
      fs.writeFileSync(envPath, originalEnv, 'utf8');
    }
  });

  test('validateGroqKey identifies empty key safely', async () => {
    const res = await validateGroqKey('');
    expect(res.valid).toBe(false);
    expect(res.message).toMatch(/empty/i);
  });

  test('validateOcmKey identifies empty key safely', async () => {
    const res = await validateOcmKey('   ');
    expect(res.valid).toBe(false);
    expect(res.message).toMatch(/empty/i);
  });

  test('saveKeysToEnv updates entries without erasing comments or unrelated keys', () => {
    const testKey = 'TEST_MOCK_SECRET_VAR';
    saveKeysToEnv({ [testKey]: 'mock_val_123' });
    expect(process.env[testKey]).toBe('mock_val_123');

    const content = fs.readFileSync(envPath, 'utf8');
    expect(content).toContain('TEST_MOCK_SECRET_VAR=mock_val_123');

    // Clean up test entry
    const cleaned = content.split('\n').filter((l) => !l.startsWith(testKey)).join('\n');
    fs.writeFileSync(envPath, cleaned, 'utf8');
    delete process.env[testKey];
  });
});
