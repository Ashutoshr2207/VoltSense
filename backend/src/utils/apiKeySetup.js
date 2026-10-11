/**
 * Interactive Terminal API Key Setup & Safe Key Writer for VoltSense.
 * 
 * Securely prompts the developer in terminal for missing GROQ_API_KEY and OCM_API_KEY
 * with masked input (silent typing) on Windows PowerShell / Node.js terminals.
 * 
 * Key Features:
 * - Silent/hidden input so secrets are NEVER echoed or printed on terminal.
 * - Non-interactive check (CI/test/Docker/background) prevents blocking/hanging.
 * - Validates provider connectivity/configuration without printing key values.
 * - Safely updates `backend/.env` while strictly preserving all existing comments and variables.
 * - Sets restrictive file permissions where supported.
 * - Never logs or transmits secret values.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ENV_PATH = path.resolve(__dirname, '../../.env');

/**
 * Masked / Hidden Terminal Prompt
 * Uses raw mode to avoid echoing keystrokes to stdout.
 */
function promptSecret(query) {
  return new Promise((resolve) => {
    // If not a TTY or running in non-interactive environment, resolve immediately with empty
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      resolve('');
      return;
    }

    process.stdout.write(query);

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let input = '';

    const onData = (char) => {
      // Enter or Return (\r, \n)
      if (char === '\r' || char === '\n') {
        stdin.removeListener('data', onData);
        stdin.setRawMode(wasRaw);
        stdin.pause();
        process.stdout.write('\n');
        resolve(input.trim());
      } else if (char === '\u0003') {
        // Ctrl+C
        process.stdout.write('\n');
        process.exit(0);
      } else if (char === '\b' || char === '\x7f') {
        // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
        }
      } else {
        // Append input without printing
        input += char;
      }
    };

    stdin.on('data', onData);
  });
}

/**
 * Validate Groq API Key by performing a lightweight model inquiry
 */
async function validateGroqKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return { valid: false, message: 'Key is empty' };
  }
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 200) {
      return { valid: true };
    } else if (res.status === 401) {
      return { valid: false, message: 'Authentication failed (401 Unauthorized)' };
    } else {
      return { valid: false, message: `Provider returned HTTP ${res.status}` };
    }
  } catch (err) {
    return { valid: false, message: `Connectivity check error: ${err.message}` };
  }
}

/**
 * Validate Open Charge Map API Key by issuing a lightweight test query
 */
async function validateOcmKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return { valid: false, message: 'Key is empty' };
  }
  try {
    const res = await fetch('https://api.openchargemap.io/v3/poi/?output=json&maxresults=1&compact=true', {
      headers: {
        'User-Agent': 'VoltSense/1.0 (Developer validation check)',
        'X-API-Key': apiKey.trim(),
      },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 200) {
      return { valid: true };
    } else if (res.status === 401 || res.status === 403) {
      return { valid: false, message: `Authentication failed (${res.status} Unauthorized)` };
    } else {
      return { valid: false, message: `Provider returned HTTP ${res.status}` };
    }
  } catch (err) {
    return { valid: false, message: `Connectivity check error: ${err.message}` };
  }
}

/**
 * Safely writes/updates keys in backend/.env preserving all existing structure and comments.
 */
function saveKeysToEnv(newEntries = {}) {
  let content = '';
  if (fs.existsSync(ENV_PATH)) {
    content = fs.readFileSync(ENV_PATH, 'utf8');
  }

  const lines = content.split(/\r?\n/);
  const updatedKeys = new Set();
  const updatedLines = [];

  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) {
      const key = match[1];
      if (newEntries[key] !== undefined) {
        updatedLines.push(`${key}=${newEntries[key]}`);
        updatedKeys.add(key);
        continue;
      }
    }
    updatedLines.push(line);
  }

  // Append any keys that weren't already in the file
  for (const [key, val] of Object.entries(newEntries)) {
    if (!updatedKeys.has(key)) {
      updatedLines.push(`${key}=${val}`);
    }
  }

  const out = updatedLines.join('\n');
  fs.writeFileSync(ENV_PATH, out, { encoding: 'utf8', mode: 0o600 });

  // Update live process.env
  for (const [key, val] of Object.entries(newEntries)) {
    process.env[key] = val;
  }
}

/**
 * Main Setup Function run at backend startup before services bind.
 */
async function setupApiKeysInteractive() {
  // If running in test mode or CI, skip interactive prompts
  if (process.env.NODE_ENV === 'test' || process.env.CI) {
    return;
  }

  const hasGroq = !!(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim());
  const hasOcm = !!(process.env.OCM_API_KEY && process.env.OCM_API_KEY.trim());

  if (hasGroq && hasOcm) {
    return;
  }

  // Non-interactive check (e.g. piped stdout, daemon, background service)
  const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!isInteractive) {
    console.log('\n[VoltSense Startup] Non-interactive environment detected.');
    if (!hasGroq) {
      console.log('  → GROQ_API_KEY is not set. Explainable AI will use verified deterministic fallback.');
    }
    if (!hasOcm) {
      console.log('  → OCM_API_KEY is not set. Charging stations will use OpenStreetMap provider.');
    }
    console.log('  To configure keys, add GROQ_API_KEY=... and OCM_API_KEY=... to backend/.env and restart.\n');
    return;
  }

  console.log('\n======================================================');
  console.log('⚡ VoltSense API Key Configuration Setup');
  console.log('======================================================');
  console.log('Your pasted keys will be hidden (not printed on screen).');
  console.log('Press [Enter] without typing to skip any key.\n');

  const updates = {};

  if (!hasGroq) {
    const enteredGroq = await promptSecret('Paste GROQ_API_KEY (hidden): ');
    if (enteredGroq) {
      process.stdout.write('Checking Groq API key... ');
      const check = await validateGroqKey(enteredGroq);
      if (check.valid) {
        console.log('✓ Validated successfully.');
        updates.GROQ_API_KEY = enteredGroq;
      } else {
        console.log(`✗ Verification notice: ${check.message}. Saving key anyway; deterministic fallback active if unreachable.`);
        updates.GROQ_API_KEY = enteredGroq;
      }
    } else {
      console.log('Skipped GROQ_API_KEY. Plain-language explanations will use deterministic rules.');
    }
  }

  if (!hasOcm) {
    const enteredOcm = await promptSecret('Paste OCM_API_KEY (hidden): ');
    if (enteredOcm) {
      process.stdout.write('Checking Open Charge Map key... ');
      const check = await validateOcmKey(enteredOcm);
      if (check.valid) {
        console.log('✓ Validated successfully.');
        updates.OCM_API_KEY = enteredOcm;
      } else {
        console.log(`✗ Verification notice: ${check.message}. Saving key anyway; OpenStreetMap fallback active if unreachable.`);
        updates.OCM_API_KEY = enteredOcm;
      }
    } else {
      console.log('Skipped OCM_API_KEY. Charging stations will query OpenStreetMap Overpass API.');
    }
  }

  if (Object.keys(updates).length > 0) {
    saveKeysToEnv(updates);
    console.log('\n✓ Keys securely saved to backend/.env (protected by .gitignore).');
  }

  console.log('======================================================\n');
}

module.exports = {
  setupApiKeysInteractive,
  saveKeysToEnv,
  validateGroqKey,
  validateOcmKey,
};
