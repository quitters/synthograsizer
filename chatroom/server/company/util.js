/**
 * Small helpers shared by the company safety layer.
 */
import crypto from 'node:crypto';

/** Freeze an object and everything inside it, so a rule written as data cannot be edited at run time. */
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A copy that shares nothing with the original (the data here is JSON). */
export const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export function getPath(obj, dotted) {
  let cur = obj;
  for (const part of dotted.split('.')) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

export function setPath(obj, dotted, value) {
  const parts = dotted.split('.');
  let cur = obj;
  for (const part of parts.slice(0, -1)) {
    if (!isPlainObject(cur[part])) cur[part] = {};
    cur = cur[part];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}

/** A random id of 128 bits as 32 hex characters (the same shape rooms use). */
export const newId = () => crypto.randomBytes(16).toString('hex');
export const isId = (v) => typeof v === 'string' && /^[a-f0-9]{32}$/.test(v);

export const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
