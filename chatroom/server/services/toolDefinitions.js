/**
 * Function-tool declarations for agent turns.
 * ───────────────────────────────────────────
 * These replace the bracket-tag vocabulary documented in buildSystemPrompt.
 * Each declaration is sent as a `tools` entry, which means:
 *   - arguments are schema-validated by the API rather than regex-scraped;
 *   - IDs are typed fields, so an agent can no longer paste a UUID into prose
 *     and hope the image model resolves it;
 *   - the syntax lesson leaves the system prompt (billed separately as
 *     total_tool_use_tokens, and variable per agent).
 *
 * Built-in tools (`google_search`, `url_context`) are declared by type alone —
 * Google runs those server-side and they need no dispatcher.
 *
 * See MODERNIZATION_PLAN.md §2.3 for the tag → declaration mapping.
 */
import { TOOL_TIERS, resolveToolTier } from '../config/tools.js';

const ASPECT_RATIOS = ['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

/**
 * Custom functions this server can execute. Built-ins are not listed here —
 * they have no dispatcher and are emitted directly as `{ type: <name> }`.
 */
export const FUNCTION_DECLARATIONS = {
  generate_image: {
    type: 'function',
    name: 'generate_image',
    description:
      'Generate a new image from a text description. Use when you want a fresh visual that ' +
      'does not need to contain any earlier image. The generated image is returned to you so ' +
      'you can react to what was actually produced. Use sparingly — once or twice per turn at most.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'A detailed visual description: subject, composition, lighting, medium, mood. ' +
            'Describe what should be seen, not what it means.',
        },
        aspect_ratio: {
          type: 'string',
          enum: ASPECT_RATIOS,
          description: 'Frame shape. Defaults to 1:1.',
        },
      },
      required: ['prompt'],
    },
  },

  compose_image: {
    type: 'function',
    name: 'compose_image',
    description:
      'Generate a NEW image that visually incorporates one or more existing images as input. ' +
      'Use this whenever the result must literally contain, extend, or transform an earlier ' +
      'image — recursive series, mise-en-abyme, restyling, adding an element to an existing ' +
      'scene. The reference images are passed to the image model alongside your prompt.',
    parameters: {
      type: 'object',
      properties: {
        reference_ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 4,
          description:
            'IDs of images already in this session, exactly as they appear in the transcript. ' +
            'To extend a series, pass the most recent image ID.',
        },
        prompt: {
          type: 'string',
          description: 'What to add, change, or build from the reference image(s).',
        },
      },
      required: ['reference_ids', 'prompt'],
    },
  },

  write_artifact: {
    type: 'function',
    name: 'write_artifact',
    description:
      'Create or replace a shared code file that renders live in a preview panel every ' +
      'participant can see. This is the ONLY way code becomes real — describing a change in ' +
      'prose does nothing. Always send the COMPLETE file; there are no partial edits.',
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description:
            'File name with extension, e.g. "sketch.js" for a p5.js sketch or "game.html" ' +
            'for a self-contained HTML page. Reuse the existing name to update a file.',
        },
        content: {
          type: 'string',
          description:
            'The entire file, top to bottom. No ellipses, no "rest unchanged" placeholders — ' +
            'whatever you send replaces the file wholesale.',
        },
        summary: {
          type: 'string',
          description: 'One line on what changed and why, for the version history.',
        },
      },
      required: ['filename', 'content'],
    },
  },

  critique_image: {
    type: 'function',
    name: 'critique_image',
    description:
      'Ask an independent critic to score a picture from 1 to 10. The critic sees only the pictures, never this conversation, so ' +
      'it cannot be talked into agreeing and its score is not up for debate. Use it before you accept a frame as matching a ' +
      'reference, or a render as good. Scores below the room\'s bar mean: do not accept it.',
    parameters: {
      type: 'object',
      properties: {
        image_id: { type: 'string', description: 'ID of the picture to score, exactly as it appears in the transcript.' },
        reference_id: { type: 'string', description: 'ID of the reference picture it should match. Omit to use the room\'s default reference.' },
        criteria: { type: 'string', description: 'What must stay the same (or, with no reference, the description the picture must match).' },
      },
      required: ['image_id'],
    },
  },

  render_artifact: {
    type: 'function',
    name: 'render_artifact',
    description:
      'Render an artifact you wrote and show the whole room what it looks like. A template (.json) with promptTemplate and variables ' +
      'is drawn a few times with random values; an instrument (.json with p5Code) or a page (.html, .js) is rendered by a browser ' +
      'attached to the room. Numbers cannot see taste: look at what you made before you call it finished. Limited per session.',
    parameters: {
      type: 'object',
      properties: {
        artifact: { type: 'string', description: 'The artifact file name, e.g. "engine.json" or "sketch.js".' },
        draws: { type: 'integer', minimum: 1, maximum: 4, description: 'How many different renders (default 3).' },
      },
      required: ['artifact'],
    },
  },

  deep_research: {
    type: 'function',
    name: 'deep_research',
    description:
      'Commission a thorough, multi-source research report on a topic. This runs for ' +
      'SEVERAL MINUTES in the background — the discussion continues without you and the ' +
      'findings reach whoever is speaking when it lands. It is expensive and strictly ' +
      'limited per session, so use it only for a question that genuinely needs dozens of ' +
      'sources synthesised. For anything a couple of web searches would answer, use ' +
      'google_search instead.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description:
            'The research question, stated in full. Be specific about scope and what a ' +
            'useful answer would contain — the agent cannot ask you to clarify.',
        },
        thorough: {
          type: 'boolean',
          description:
            'Roughly double the depth, cost and time. Default false; only set it when ' +
            'the question genuinely warrants exhaustive coverage.',
        },
      },
      required: ['topic'],
    },
  },

  // A company's tool, not part of any tier: every agent in a company room can OFFER work for publication, and nothing more.
  // It only ever queues a proposal for a person to review; no tool can approve one.
  propose_publish: {
    type: 'function',
    name: 'propose_publish',
    description:
      'Offer a finished piece of work for publication. A person reviews it and decides; nothing leaves this room because you proposed it. ' +
      'The work is checked first, and it is labelled AI-generated if it is ever published. Propose only finished work, one piece at a time.',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['text', 'artifact', 'image'], description: 'What is being offered: text you pass in, a file in the room (artifact), or a picture in the room (image).' },
        title: { type: 'string', description: 'A short title for the reviewer.' },
        ref: { type: 'string', description: 'For an artifact, its file name; for an image, its id exactly as it appears in the transcript.' },
        text: { type: 'string', description: 'For kind "text": the text itself.' },
        note: { type: 'string', description: 'What the reviewer should know: where it came from, what to check.' },
      },
      required: ['kind', 'title'],
    },
  },

  // ── The Hall: a company's tools for reaching each other between rooms (company/hall/). Not part of any tier: a person holds the ones the
  // company has open, and only if the server knows who they are at the company. None of them reaches outside the company.

  mailbox: {
    type: 'function',
    name: 'mailbox',
    description:
      'Your personal mailbox at this company: messages from colleagues wait here between rooms and between sessions. ' +
      'read: what is waiting for you (or one thread). send: write to colleagues by name. reply: answer a message you received. done: close one without answering. ' +
      'Messages are typed so they stay useful: ask (you need something), handoff (work passes to them; name the file), review (please check something), ' +
      'decision (record what was decided), fyi (they need to know; nobody replies to news). Be concrete: what you need, by when, where the work is. ' +
      'Everything you send is read by the safety screen and by the owner, nothing leaves the company, and you can send only so many in a session.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read', 'send', 'reply', 'done'] },
        to: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'For send: the names of your colleagues, as in the company list.' },
        kind: { type: 'string', enum: ['ask', 'handoff', 'review', 'decision', 'fyi'], description: 'For send: what kind of message it is.' },
        subject: { type: 'string', description: 'For send: a short subject.' },
        body: { type: 'string', description: 'For send and reply: the message, a few sentences.' },
        ref: { type: 'string', description: 'For send: the file or thread it is about, if any.' },
        message_id: { type: 'string', description: 'For reply and done: the id of the message, as shown when you read.' },
        thread: { type: 'string', description: 'For read: a thread id, to read the whole conversation.' },
      },
      required: ['action'],
    },
  },

  forum: {
    type: 'function',
    name: 'forum',
    description:
      'The company forums: lasting threads that everyone at the company can read (announcements, general, help, decisions, and one for each department). ' +
      'Use a forum for what more than one person needs to know or answer, and your mailbox for one person. ' +
      'list: the channels and what is new. read: a channel (its threads) or one thread. post: start a thread. reply: answer one. ' +
      'Posts are read by the safety screen and the owner. Be concrete; this is not a lounge.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'read', 'post', 'reply'] },
        channel: { type: 'string', description: 'For read and post: the channel name, e.g. "help".' },
        thread: { type: 'string', description: 'For read and reply: the thread id, as shown when you read a channel.' },
        title: { type: 'string', description: 'For post: a short title.' },
        body: { type: 'string', description: 'For post and reply: what you have to say.' },
      },
      required: ['action'],
    },
  },

  workspace: {
    type: 'function',
    name: 'workspace',
    description:
      'The company workspace: shared text files that outlast a session and that colleagues in other rooms can read and improve (notes, checklists, briefs, scripts kept as text). ' +
      'Your room\'s own files are separate. list: the files. read: one file. write: create or replace one with the COMPLETE new content and a note on what changed. ' +
      'A locked file can be read and not changed. Writes are read by the safety screen, versioned, and limited per session.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'read', 'write'] },
        path: { type: 'string', description: 'For read and write: e.g. "checklists/engine.md". Letters, digits, dot, dash, underscore; a text extension.' },
        content: { type: 'string', description: 'For write: the entire file.' },
        note: { type: 'string', description: 'For write: one line on what changed.' },
        version: { type: 'integer', description: 'For read: an earlier version, if you need it.' },
      },
      required: ['action'],
    },
  },

  board: {
    type: 'function',
    name: 'board',
    description:
      'The company board: tasks with a lead and members. list: open tasks. create: add one (title, what done looks like, who leads, who is on it). ' +
      'update: move a task (todo, doing, review, done, blocked) or add a note; members can report progress, the lead closes. ' +
      'A task can ask for a task team (needs_team): the owner decides whether a room is made for it.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'update'] },
        task_id: { type: 'string', description: 'For update: the task id.' },
        title: { type: 'string' },
        description: { type: 'string', description: 'For create: what is to be done and what done looks like.' },
        lead: { type: 'string', description: 'The lead\'s name. A task you create is yours to lead unless you name someone.' },
        members: { type: 'array', items: { type: 'string' }, description: 'Names of the people on it.' },
        deliverable: { type: 'string', description: 'What it will produce: a file, a decision.' },
        status: { type: 'string', enum: ['todo', 'doing', 'review', 'done', 'blocked', 'cancelled'], description: 'For update, or to filter list.' },
        note: { type: 'string', description: 'For update: a line for the task\'s log.' },
        needs_team: { type: 'boolean', description: 'Ask the owner for a task team (a room made for this task).' },
      },
      required: ['action'],
    },
  },

  propose_norm: {
    type: 'function',
    name: 'propose_norm',
    description:
      'Propose a working agreement for the company: how people hand work over, what a review looks like, what things are called. ' +
      'The owner decides; until it is approved it binds no one, and nothing you do will approve it. Not for safety or publishing: those rules are fixed.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The agreement, one or two sentences.' },
        why: { type: 'string', description: 'What went wrong or slowly that this would fix.' },
      },
      required: ['text'],
    },
  },
};

/** Tool names that Google executes server-side; declared by type alone. */
export const BUILTIN_TOOLS = new Set(['google_search', 'url_context', 'code_execution']);

export function isBuiltinTool(name) {
  return BUILTIN_TOOLS.has(name);
}

export function isDispatchableTool(name) {
  return Object.prototype.hasOwnProperty.call(FUNCTION_DECLARATIONS, name);
}

/**
 * Build the `tools` array for one agent's turn.
 *
 * @param {object} agent           Agent whose `tools` field names a tier.
 * @param {object} [opts]
 * @param {boolean} [opts.allowArtifacts=true]  Drop write_artifact when the
 *   room isn't building anything — one fewer way for the model to go wrong.
 * @param {string[]} [opts.only]  A company room: keep only these tool names, so a tier hands out no more than the company has
 *   been granted. Absent in a plain room.
 * @param {string[]} [opts.extra]  Tools outside any tier to add (a company's propose_publish).
 * @returns {Array<object>} tool declarations, or [] if the tier is empty.
 */
export function buildToolsForAgent(agent, opts = {}) {
  const { allowArtifacts = true, allowCritic = true, allowRender = true, only = null, extra = [] } = opts;
  const names = [...(TOOL_TIERS[resolveToolTier(agent)] || [])].filter(n => !only || only.includes(n));

  const tools = [];
  for (const name of [...names, ...extra]) {
    if (name === 'write_artifact' && !allowArtifacts) continue;
    if (name === 'critique_image' && !allowCritic) continue;
    if (name === 'render_artifact' && !allowRender) continue;
    if (isBuiltinTool(name)) {
      tools.push({ type: name });
    } else if (isDispatchableTool(name)) {
      tools.push(FUNCTION_DECLARATIONS[name]);
    }
    // An unknown name in a tier is a config typo — skip it rather than
    // sending a malformed declaration the API will reject outright.
  }
  return tools;
}

/** Names of the dispatchable (non-built-in) tools available to an agent. */
export function dispatchableToolNames(agent) {
  return (TOOL_TIERS[resolveToolTier(agent)] || []).filter(isDispatchableTool);
}
