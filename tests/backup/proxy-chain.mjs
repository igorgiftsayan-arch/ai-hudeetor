// Run with Node 24 and EXPRESS_MODULE pointing at the installed Express package.
// Synthetic requests only: no HTTP listener, database, or customer data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import process from 'node:process';
import { createRequire } from 'node:module';
const loadModule = createRequire(import.meta.url);
const express = loadModule(process.env.EXPRESS_MODULE || 'express');
const config = fs.readFileSync(process.argv[2] || 'infrastructure/compose.production.yaml', 'utf8');
const hops = Number(config.match(/API_TRUST_PROXY_HOPS:\s*(\d+)/)?.[1]);
const app = express();
app.set('trust proxy', hops);
function resolveIp(forwarded) {
  const req = Object.create(express.request);
  req.app = app;
  req.headers = { 'x-forwarded-for': forwarded };
  req.socket = { remoteAddress: '172.26.0.7' };
  return req.ip;
}
assert.equal(resolveIp('198.51.100.10, 172.26.0.1'), '198.51.100.10');
assert.equal(resolveIp('203.0.113.99, 198.51.100.10, 172.26.0.1'), '198.51.100.10');
assert.equal(resolveIp('198.51.100.11, 172.26.0.1'), '198.51.100.11');
assert.match(config, /ports: !override \[\]/);
process.stdout.write('PASS: visitor IP, spoofed prefix ignored, distinct visitors\n');
