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

/**
 * @param {{ dataDir?: string, env?: object, classify?: Function, getClient?: Function, now?: () => Date, extraHardLimits?: object[], extraScreenRules?: object[] }} [options]
 *   classify replaces the Gemini-backed reviewer (tests). extraHardLimits and extraScreenRules are for the red-team harness only.
 */
export function createCompanyServices({
  dataDir = defaultDataDir(), env = process.env, classify = null, getClient = getGeminiClient, now = () => new Date(),
  extraHardLimits = [], extraScreenRules = [],
} = {}) {
  const operator = loadOperator({ env, dataDir });
  for (const warning of operator.warnings) console.warn(`[company] ${warning}`);

  const audit = new AuditLog({ rootDir: dataDir, now });
  const store = new CompanyStore({ rootDir: dataDir, operator, now });
  const screen = new Screen({ classify: classify || createGeminiClassifier({ client: getClient, model: operator.screen.model }) });
  const publish = new PublishQueue({ rootDir: dataDir, store, operator, screen, audit, now });

  /** The policy for a room, or null when the room belongs to no company. */
  function policyForRoom(roomId) {
    const owner = store.roomOwner(roomId);
    if (!owner) return null;
    return new RoomPolicy({
      store, companyId: owner.company.id, departmentId: owner.department.id, roomId, operator, screen, audit, publish, extraHardLimits, extraScreenRules,
    });
  }

  /** A room initializer (sessionRegistry.registerRoomInitializer): a company's room is created under its company's policy. */
  function attach(room) {
    const policy = policyForRoom(room.id);
    if (!policy) return;
    // The company's memory, not the visitor's: two companies never share any
    room.orchestrator.attachPolicy(policy, { memoryOwnerId: policy.companyId });
  }

  return { dataDir, operator, audit, store, screen, publish, policyForRoom, attach };
}
