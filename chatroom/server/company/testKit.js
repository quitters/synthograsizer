/**
 * Shared setup for the safety layer's tests: a throwaway data folder, a stand-in screen, a company with a room already under its
 * policy, and scripted agents. Not imported by anything outside the tests.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCompanyServices } from './index.js';
import { ChatOrchestrator } from '../services/orchestrator.js';
import { MediaStore } from '../services/mediaStore.js';
import { ArtifactStore } from '../services/artifactStore.js';
import { newId } from './util.js';

export function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'company-test-'));
}

/**
 * A stand-in for the model reviewer. `markers` maps a string to the rule it stands for: material containing the string is a
 * finding for that rule (when the rule applies at the stage). Records every call.
 */
export function markerClassifier(markers = { 'FORBIDDEN-X': 'deception' }) {
  const calls = [];
  const classify = async ({ stage, rules, parts }) => {
    calls.push({ stage, parts });
    const text = parts.filter(p => p.type === 'text').map(p => p.text).join('\n');
    const findings = [];
    for (const [marker, rule] of Object.entries(markers)) {
      if (text.includes(marker) && rules.some(r => r.id === rule)) findings.push({ rule, severity: 'block', why: `holds the test marker for ${rule}` });
    }
    return { findings, model: 'stub-screen', usage: { total_input_tokens: 100, total_output_tokens: 10 } };
  };
  classify.calls = calls;
  return classify;
}

/** Services against a temp folder. `cleanup()` removes it. */
export function makeServices({ classify = markerClassifier(), env = {}, ...rest } = {}) {
  const dir = tempDir();
  const services = createCompanyServices({ dataDir: dir, env: { ...env }, classify, ...rest });
  return { services, dir, classify, cleanup: () => { services.close?.(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

/**
 * A company with one department (running unless `active: false`) and an orchestrator already under that department's policy.
 * Events the room broadcasts are collected in `events`; delays are removed.
 */
export function makeRoom({ services, ownerId = newId(), body = {}, active = true, departmentName = 'Writers' } = {}) {
  const company = services.store.create(ownerId, { name: 'Test Co', departments: [departmentName], ...body });
  if (active) services.store.setState(company.id, ownerId, 'active');
  const dept = company.departments[0];
  const orchestrator = new ChatOrchestrator({ ownerId: dept.roomId, mediaStore: new MediaStore(), artifactStore: new ArtifactStore() });
  const policy = services.policyForRoom(dept.roomId);
  orchestrator.attachPolicy(policy, { memoryOwnerId: company.id });
  orchestrator.delay = () => Promise.resolve();
  const events = [];
  orchestrator.broadcast = (event, data) => { events.push([event, data]); };
  return { company, ownerId, dept, orchestrator, policy, events };
}

export const named = (events, name) => events.filter(([e]) => e === name).map(([, d]) => d);

/** Wait for a condition the conversation loop will bring about. */
export async function until(cond, ms = 4000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out waiting for the conversation loop');
    await new Promise(r => setTimeout(r, 5));
  }
}

/**
 * Scripted agents: script(callNumber, agentName, options) returns the reply as a string, or { text, usage }, or { refusal }, or { error }.
 * Replies stream in small chunks, as a model does.
 */
export function scripted(orchestrator, script, { delayMs = 0 } = {}) {
  let calls = 0;
  const seen = [];
  orchestrator._generate = async function* (agent, _all, _messages, _goal, _media, options) {
    calls += 1;
    seen.push({ agent: agent.name, options });
    // a model takes time; a test that must act while the room is running needs the room to still be running
    if (delayMs) await new Promise(r => setTimeout(r, delayMs));
    const out = script(calls, agent.name, options);
    if (out && typeof out === 'object' && out.refusal) { yield { type: 'refusal', detail: out.refusal }; return; }
    if (out && typeof out === 'object' && out.error) { yield { type: 'error', error: out.error }; return; }
    const text = typeof out === 'string' ? out : out.text;
    for (const piece of text.match(/[\s\S]{1,40}/g) || []) yield { type: 'chunk', text: piece };
    yield { type: 'complete', fullResponse: text, tokenCount: 10, usage: out.usage || null, usageReported: Boolean(out.usage) };
  };
  return { calls: () => calls, seen };
}

export const FORBIDDEN = 'FORBIDDEN-X';
