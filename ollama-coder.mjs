#!/usr/bin/env node

// Simple helper to use a local Ollama model to rewrite a file in this repo.
// Usage examples (from repo root, with Ollama running on localhost:11434):
//
//   node ollama-coder.mjs --file apps/web/src/app/(dashboard)/accountancy/balance-sheet/page.tsx ^
//     --instruction "Refactor for clarity, keep behavior identical."
//
//   node ollama-coder.mjs --file apps/api/src/index.ts ^
//     --instruction "Add clear comments and improve error handling." ^
//     --dry-run
//
// By default it overwrites the file with the model's response.
// Add --dry-run to print the new code to stdout instead of writing.

import fs from 'fs/promises';
import path from 'path';
import http from 'http';

const OLLAMA_HOST = process.env.OLLAMA_HOST || '127.0.0.1';
const OLLAMA_PORT = Number(process.env.OLLAMA_PORT || 11434);
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';

function parseArgs(argv) {
  const args = { file: null, instruction: null, dryRun: false };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--file' && argv[i + 1]) {
      args.file = argv[++i];
    } else if (arg === '--instruction' && argv[i + 1]) {
      args.instruction = argv[++i];
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    }
  }

  return args;
}

function usageAndExit(msg) {
  if (msg) {
    console.error(msg);
  }
  console.error(
    '\nUsage:\n' +
      '  node ollama-coder.mjs --file <relative/path/to/file> --instruction "Describe what to do" [--dry-run]\n'
  );
  process.exit(1);
}

function callOllamaChat({ host, port, model, systemPrompt, userPrompt }) {
  const body = JSON.stringify({
    model,
    stream: false,
    messages: [
      {
        role: 'system',
        content:
          systemPrompt ||
          'You are a precise coding assistant. Given instructions and a file, return ONLY the full updated file content with no explanations, no markdown code fences, and no commentary.',
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  const options = {
    host,
    port,
    path: '/api/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json || !json.message || typeof json.message.content !== 'string') {
            return reject(
              new Error('Unexpected Ollama response shape: ' + JSON.stringify(json).slice(0, 500))
            );
          }
          resolve(json.message.content);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });
}

async function main() {
  const { file, instruction, dryRun } = parseArgs(process.argv);

  if (!file) usageAndExit('Missing --file');
  if (!instruction) usageAndExit('Missing --instruction');

  const absPath = path.resolve(process.cwd(), file);

  let original;
  try {
    original = await fs.readFile(absPath, 'utf8');
  } catch (err) {
    console.error(`Failed to read file at ${absPath}:`, err.message || err);
    process.exit(1);
  }

  const userPrompt =
    `You are given a single source file from a TypeScript/Next.js/Node.js monorepo.\n` +
    `INSTRUCTIONS:\n` +
    `${instruction}\n\n` +
    `Rules:\n` +
    `- Return ONLY the full updated file content.\n` +
    `- Do NOT wrap the code in markdown fences.\n` +
    `- Do NOT add explanations or comments about what you did (unless the instruction explicitly says to add comments in the code).\n` +
    `- Keep imports, exports, and types valid for a modern TypeScript/Next.js 15 + Node 20 environment.\n\n` +
    `Current file path: ${file}\n` +
    `--- FILE START ---\n` +
    `${original}\n` +
    `--- FILE END ---\n`;

  console.error(
    `Calling Ollama at http://${OLLAMA_HOST}:${OLLAMA_PORT} with model "${OLLAMA_MODEL}"...`
  );

  let updated;
  try {
    updated = await callOllamaChat({
      host: OLLAMA_HOST,
      port: OLLAMA_PORT,
      model: OLLAMA_MODEL,
      systemPrompt:
        'You are a precise coding assistant. Given instructions and a file, return ONLY the full updated file content with no explanations, no markdown code fences, and no commentary.',
      userPrompt,
    });
  } catch (err) {
    console.error('Error calling Ollama:', err.message || err);
    process.exit(1);
  }

  if (dryRun) {
    // Just print to stdout so you can inspect or manually paste.
    process.stdout.write(updated);
    return;
  }

  try {
    await fs.writeFile(absPath, updated, 'utf8');
    console.error(`Updated file written: ${absPath}`);
  } catch (err) {
    console.error('Failed to write updated file:', err.message || err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

