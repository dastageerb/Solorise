import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skippedDirectories = new Set(['.git', '.next', '.verify', 'node_modules', 'out']);
const binaryExtensions = new Set(['.gif', '.ico', '.jpeg', '.jpg', '.png', '.webp', '.woff', '.woff2', '.zip']);
const localEnvironment = /^\.env(?:\..+)?$/;
const dangerousFilenames = [
  /firebase-adminsdk.*\.json$/i,
  /service-account.*\.json$/i,
  /^(?:credentials|secrets).*\.json$/i,
  /\.(?:key|pem)$/i,
];
const secretPatterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['service-account private key', /"private_key"\s*:\s*"/],
  ['Google API key', /AIza[0-9A-Za-z_-]{30,}/],
  ['GitHub token', /(?:ghp_|github_pat_)[0-9A-Za-z_]{20,}/],
  ['AWS access key', /(?:AKIA|ASIA)[0-9A-Z]{16}/],
];

const failures = [];
const textFiles = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    const relativePath = relative(root, fullPath);
    if (dangerousFilenames.some((pattern) => pattern.test(entry.name))) {
      failures.push(`${relativePath}: credential-like file must not be published`);
    }
    if (localEnvironment.test(entry.name) && entry.name !== '.env.example') continue;
    if (!binaryExtensions.has(extname(entry.name).toLowerCase())) textFiles.push(fullPath);
  }
}

walk(root);

for (const file of textFiles) {
  let content = '';
  try { content = readFileSync(file, 'utf8'); } catch { continue; }
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const [label, pattern] of secretPatterns) {
      if (pattern.test(line)) failures.push(`${relative(root, file)}:${index + 1}: possible ${label}`);
    }
  });
}

const requiredIgnoreRules = [
  '.env*',
  '!.env.example',
  '*.log',
  '*.pem',
  '*.key',
  'service-account*.json',
  '*firebase-adminsdk*.json',
];
const gitignore = readFileSync(join(root, '.gitignore'), 'utf8').split(/\r?\n/).map((line) => line.trim());
for (const rule of requiredIgnoreRules) {
  if (!gitignore.includes(rule)) failures.push(`.gitignore: missing ${rule}`);
}

const envPath = join(root, '.env.local');
const staticRoot = join(root, '.next', 'static');
if (existsSync(envPath) && existsSync(staticRoot)) {
  const environment = Object.fromEntries(readFileSync(envPath, 'utf8').split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) return [];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[match[1], value]];
  }));
  const staticFiles = [];
  const collectStatic = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) collectStatic(fullPath); else staticFiles.push(fullPath);
    }
  };
  collectStatic(staticRoot);
  const browserBundle = staticFiles.map((file) => {
    try { return readFileSync(file, 'utf8'); } catch { return ''; }
  }).join('\n');

  for (const name of ['FIREBASE_ADMIN_CLIENT_EMAIL', 'FIREBASE_ADMIN_PRIVATE_KEY', 'APP_ENCRYPTION_KEY', 'GEMINI_API_KEY']) {
    const value = environment[name] ?? '';
    if (value.length < 8) continue;
    const variants = [value, value.replace(/\\n/g, '\n'), JSON.stringify(value).slice(1, -1)];
    if (variants.some((candidate) => candidate.length >= 8 && browserBundle.includes(candidate))) {
      failures.push(`.next/static: exact ${name} value found in a browser bundle`);
    }
  }
}

if (failures.length) {
  console.error(`Security check failed with ${failures.length} finding(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Security check passed: no publishable secret patterns or server-only values were found.');
