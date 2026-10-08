/**
 * The Agent Profile renderer, from the one pure module the Composer shares (static/synthograsizer/js/profile-bio.js).
 * The chat room lives in the suite beside `static/`, as it does beside `workflow-engine/`, and imports it from there so a profile reads the
 * same in the browser and on the server. profileBio.test.js holds the Composer's wrapper to the same answers.
 *
 * It is loaded when this module is, and a missing file does not stop the server from starting (a chat room copied out of the suite has no
 * `static/`): only rendering a person's sheet then fails, with the reason.
 */
let impl = null;
let problem = null;
try {
  ({ renderBio: impl } = await import('../../../static/synthograsizer/js/profile-bio.js'));
} catch (err) {
  problem = err;
}

export const profileBioAvailable = () => Boolean(impl);

/** @see static/synthograsizer/js/profile-bio.js */
export function renderBio(profile, options) {
  if (!impl) throw new Error(`The profile renderer is not available (${problem?.message || 'static/synthograsizer/js/profile-bio.js is missing'}).`);
  return impl(profile, options);
}
