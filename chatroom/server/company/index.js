/**
 * The company safety layer, wired together.
 * ─────────────────────────────────────────
 * createCompanyServices builds what one server needs: the operator's policy, the company store, the audit log, the independent
 * screen, the publish queue, and the function that puts a company's policy on a room when the room is created. The HTTP app
 * builds one (app.js); tests build their own against a temp folder and a stand-in screen.
 *
 * The screen's model client is looked up when it is used, not when it is built: the server makes its routes before it has
 * the API key. With no client the screen is "unavailable", which every caller treats as a block (a check that fails open is not
 * a check).
 */
import { dataDir as defaultDataDir } from '../services/sessionArchive.js';
import { getGeminiClient } from '../services/gemini.js';
import { loadOperator } from './operator.js';
import { AuditLog } from './audit.js';
import { CompanyStore } from './store.js';
import { Screen, createGeminiClassifier } from './screen.js';
import { PublishQueue } from './publishQueue.js';
import { RoomPolicy } from './roomPolicy.js';
import fs from 'node:fs';
import path from 'node:path';
import { PolicyError } from './errors.js';
import { RosterStore } from './flow/roster.js';
import { Hall } from './hall/hall.js';
import { sqliteAvailable, sqliteProblem, openDatabase } from './flow/sqlite.js';
import { MIGRATIONS } from './flow/migrations.js';
import { admitDepartment } from './flow/admit.js';
import { FlowStore } from './flow/flowStore.js';
import { FlowService } from './flow/flow.js';
import { OwnerAuth } from './ownerAuth.js';
import { createModel } from './flow/model.js';
import { getRoom as defaultGetRoom } from '../services/sessionRegistry.js';

/**
 * @param {{ dataDir?: string, env?: object, classify?: Function, getClient?: Function, now?: () => Date, extraHardLimits?: object[], extraScreenRules?: object[], makeAsk?: Function, getRoom?: Function }} [options]
 *   classify replaces the Gemini-backed reviewer (tests). extraHardLimits and extraScreenRules are for the red-team harness only. makeAsk replaces the model
 *   the creation flow writes with (tests), and getRoom the registry it starts rooms in. checkRenderer answers whether the service that draws pictures is up
 *   (the server passes one; without it a room that draws is not held back).
 */
export function createCompanyServices({
  dataDir = defaultDataDir(), env = process.env, classify = null, getClient = getGeminiClient, now = () => new Date(),
  extraHardLimits = [], extraScreenRules = [], extraPreamble = '',
  makeAsk = ({ spend, limitUsd }) => createModel({ getClient, spend, limitUsd }).askJson, getRoom = defaultGetRoom, checkRenderer = null,
} = {}) {
  const operator = loadOperator({ env, dataDir });
  for (const warning of operator.warnings) console.warn(`[company] ${warning}`);
  // Who the owner is: the visitor cookie (the default) or, with COMPANY_OWNER_AUTH=key, an account that signs in with a key
  const ownerAuth = new OwnerAuth({ dataDir, env, now, hosted: operator.hosted });
  for (const warning of ownerAuth.warnings) console.warn(`[company] ${warning}`);
  if (ownerAuth.enabled && ownerAuth.justCreated) console.warn(`[company] Owner sign-in is on and this is its first start: the owner key is in ${ownerAuth.keyFile}. Paste it into the console's sign-in page.`);

  const audit = new AuditLog({ rootDir: dataDir, now });
  const store = new CompanyStore({ rootDir: dataDir, operator, now });
  const screen = new Screen({ classify: classify || createGeminiClassifier({ client: getClient, model: operator.screen.model }) });
  const publish = new PublishQueue({ rootDir: dataDir, store, operator, screen, audit, now });

  // The roster and the Hall share one SQLite database, opened the first time something needs it: a server that never makes a company with
  // people in it never creates the file, and one without SQLite simply has no Hall (the rooms work as they did).
  let roster = null;
  let hall = null;
  const dbFile = path.join(dataDir, 'company.sqlite');
  const open = () => {
    if (roster) return;
    const db = openDatabase(dbFile, MIGRATIONS);
    roster = new RosterStore({ db, now });
    hall = new Hall({ db, roster, now });
  };
  /** The roster, or a 503 that says why not (for the routes that exist to use it). */
  const needRoster = () => {
    if (!sqliteAvailable()) throw new PolicyError(sqliteProblem(), { status: 503, code: 'no_sqlite' });
    open();
    return roster;
  };
  const needHall = () => { needRoster(); return hall; };
  /**
   * The same, or null (for the room's policy, which must work without them). It never CREATES the database: a room only looks, and where
   * there is no file there are no people, no mail and no agreements to find.
   */
  const tryRoster = ({ create = false } = {}) => {
    if (roster) return roster;
    if (!sqliteAvailable()) return null;
    if (!create && !fs.existsSync(dbFile)) return null;
    try { open(); return roster; } catch (err) { console.warn(`[company] the roster could not be opened: ${err.message}`); return null; }
  };
  const tryHall = (options) => (tryRoster(options) ? hall : null);
  // The creation flow: propose, cast, create. Its proposals are files under <data>/flow; the people it writes go to the roster, the company to the store.
  const flow = new FlowService({
    store: new FlowStore({ rootDir: dataDir, now }), companies: store, operator, audit, screen,
    getRoster: needRoster, getHall: tryHall, makeAsk, getRoom, listProposals: (companyId) => publish.list(companyId), checkRenderer, now,
  });

  /** Close the database (tests, and a server shutting down). */
  const close = () => { try { roster?.close(); } finally { roster = null; hall = null; } };

  /** The policy for a room, or null when the room belongs to no company. */
  function policyForRoom(roomId) {
    const owner = store.roomOwner(roomId);
    if (!owner) return null;
    return new RoomPolicy({
      store, companyId: owner.company.id, departmentId: owner.department.id, roomId, operator, screen, audit, publish, getHall: tryHall, getRoster: tryRoster, extraHardLimits, extraScreenRules, extraPreamble,
    });
  }

  /** A room initializer (sessionRegistry.registerRoomInitializer): a company's room is created under its company's policy. */
  function attach(room) {
    const policy = policyForRoom(room.id);
    if (!policy) return;
    // The company's memory, not the visitor's: two companies never share any
    room.orchestrator.attachPolicy(policy, { memoryOwnerId: policy.companyId });
    // The people seated in this department come back with the room (a restarted server forgot them before; the roster remembers)
    const people = tryRoster();
    if (people && policy.company) {
      try {
        const { refused } = admitDepartment({ roster: people, ownerId: policy.company.ownerId, companyId: policy.companyId, departmentId: policy.departmentId, orchestrator: room.orchestrator });
        for (const r of refused) policy.record('seat_refused', { agent: r.name, reason: r.why.slice(0, 200) });
      } catch (err) {
        console.warn(`[company] could not seat the people of ${policy.departmentName}: ${err.message}`);
      }
    }
  }

  return { dataDir, operator, ownerAuth, audit, store, screen, publish, flow, policyForRoom, attach, get roster() { return needRoster(); }, get hall() { return needHall(); }, tryRoster, tryHall, close };
}
