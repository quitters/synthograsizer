#!/usr/bin/env node
/**
 * The owner, from the command line (see server/company/ownerAuth.js and ownerAdopt.js). Operator work: it reads and writes the data folder.
 *
 *   npm run owner -- status                      who owns what in the data folder, and whether an owner account exists
 *   npm run owner -- init [--owner-id <id>]      make the owner account and its key (under an id that already owns companies, if you give one: nothing moves)
 *   npm run owner -- rotate                      a new key; every session ends; the owner id stays
 *   npm run owner -- adopt --from <id> [--to <id> | --to-email <address>] [--apply]
 *                                                move what another owner id owns to an owner (a dry run unless --apply; it backs up first). The
 *                                                owner is the key owner by default; --to-email names a Google account that has signed in once
 *                                                (status lists them), --to an owner id.
 *
 * --data <folder> names another data folder (default: the chat server's: CHATROOM_DATA_DIR, or chatroom/data). Stop the chat server before init,
 * rotate or adopt --apply: it keeps companies in memory. The key is written to <data>/owner/owner.key and is never printed here. With
 * COMPANY_OWNER_AUTH=google there is no key: the owner of a company is a Google account, whose owner id the server records the first time it signs in.
 */
import fs from 'node:fs';
import path from 'node:path';
import { OwnerAuth } from '../server/company/ownerAuth.js';
import { survey, planAdoption, applyAdoption } from '../server/company/ownerAdopt.js';
import { dataDir as defaultDataDir } from '../server/services/sessionArchive.js';
import { isPolicyError } from '../server/company/errors.js';

const args = process.argv.slice(2);
const command = args[0];
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };
const flag = (name) => args.includes(`--${name}`);
const dataDir = path.resolve(opt('data') || defaultDataDir());

const say = (...a) => console.log(...a);
const owner = (extra = {}) => new OwnerAuth({ dataDir, env: { COMPANY_OWNER_AUTH: 'key' }, ...extra });
const accountFile = path.join(dataDir, 'owner', 'owner.json');
const hasAccount = () => fs.existsSync(accountFile);

const googleAccounts = () => {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, 'owner', 'accounts.json'), 'utf8')).accounts || {}; } catch { return {}; }
};

function describeOwners(accountId) {
  const accounts = googleAccounts();
  const owners = survey(dataDir);
  if (!owners.size) { say('  (no company, flow or roster in this data folder yet)'); return; }
  for (const [id, o] of owners) {
    const rows = Object.entries(o.rows).map(([t, n]) => `${t} ${n}`).join(', ');
    say(`  ${id}${id === accountId ? '   <- the key owner' : ''}${accounts[id] ? `   <- Google account ${accounts[id].email}` : ''}`);
    say(`      companies: ${o.companies.length ? o.companies.map(c => `${c.name} (${c.id.slice(0, 8)})`).join(', ') : 'none'}; flows: ${o.flows}${rows ? `; roster and hall rows: ${rows}` : ''}`);
  }
}

try {
  if (command === 'status') {
    say(`data folder: ${dataDir}`);
    const accounts = googleAccounts();
    if (Object.keys(accounts).length) {
      say('Google accounts that have signed in (the owner id each one is):');
      for (const [id, a] of Object.entries(accounts)) say(`  ${a.email}   ${id}   last ${a.lastSeen}`);
    }
    if (hasAccount()) {
      const a = JSON.parse(fs.readFileSync(accountFile, 'utf8'));
      say(`key owner: ${a.ownerId} (made ${a.createdAt}, key changed ${a.keyChangedAt})`);
      say(`key file: ${path.join(dataDir, 'owner', 'owner.key')}${fs.existsSync(path.join(dataDir, 'owner', 'owner.key')) ? '' : '  (not there: the key was removed; rotate to make a new one)'}`);
      say('The server uses it when it starts with COMPANY_OWNER_AUTH=key.');
      say('who owns what:');
      describeOwners(a.ownerId);
    } else {
      say('key owner: none yet. With COMPANY_OWNER_AUTH=key the server makes one at its first start, or run: init');
      say('who owns what:');
      describeOwners(null);
    }
  } else if (command === 'init') {
    if (hasAccount()) throw Object.assign(new Error('There is an owner already (status shows it). To change the key: rotate.'), { quiet: true });
    const id = opt('owner-id');
    const made = owner({ initialOwnerId: id });
    say(`The owner is ${made.ownerId}${id ? ' (the id that already owned companies; nothing moved)' : ''}.`);
    say(`The key is in ${made.keyFile}. Start the server with COMPANY_OWNER_AUTH=key and paste the key into the console's sign-in page.`);
  } else if (command === 'rotate') {
    if (!hasAccount()) throw Object.assign(new Error('There is no owner yet: init.'), { quiet: true });
    const { keyFile } = owner().rotateKey();
    say(`A new key is in ${keyFile}. Every session has ended; a running server notices at once and nobody needs the old key.`);
  } else if (command === 'adopt') {
    let to = opt('to');
    const email = opt('to-email');
    if (email) {
      const hit = Object.entries(googleAccounts()).find(([, a]) => a.email === email.trim().toLowerCase());
      if (!hit) throw Object.assign(new Error(`No Google account ${email} has signed in to this server yet (status lists the ones that have). Sign in once, then run this again.`), { quiet: true });
      to = hit[0];
    }
    if (!to) {
      if (!hasAccount()) throw Object.assign(new Error('Say who to move to: --to-email <a Google account that has signed in>, --to <owner id>, or make a key owner first (init).'), { quiet: true });
      to = JSON.parse(fs.readFileSync(accountFile, 'utf8')).ownerId;
    }
    const from = opt('from');
    if (!from) throw Object.assign(new Error('Say which owner id to move from: --from <id> (status lists them).'), { quiet: true });
    if (flag('apply')) {
      const done = applyAdoption(dataDir, from, to);
      if (done.nothing) say('That id owns nothing here.');
      else {
        say(`Moved ${done.moved.companies} compan${done.moved.companies === 1 ? 'y' : 'ies'}, ${done.moved.flows} flow${done.moved.flows === 1 ? '' : 's'} and roster and hall rows (${Object.entries(done.moved.rows).map(([t, n]) => `${t} ${n}`).join(', ') || 'none'}) to ${to}.`);
        say(`A copy of what changed is in ${done.backup}. Start the server again.`);
      }
    } else {
      const plan = planAdoption(dataDir, from, to);
      if (plan.nothing) say('That id owns nothing here.');
      else {
        say(`Would move to ${to}:`);
        say(`  companies: ${plan.companies.map(c => c.name).join(', ') || 'none'}`);
        say(`  flows: ${plan.flows}`);
        say(`  roster and hall rows: ${Object.entries(plan.rows).map(([t, n]) => `${t} ${n}`).join(', ') || 'none'}`);
        say('Nothing was changed. Stop the chat server, then run the same command with --apply.');
      }
    }
  } else {
    say('usage: npm run owner -- <status | init [--owner-id <id>] | rotate | adopt --from <id> [--apply]> [--data <folder>]');
    process.exitCode = command ? 2 : 0;
  }
} catch (err) {
  console.error(isPolicyError(err) || err.quiet ? err.message : err);
  process.exitCode = 1;
}
