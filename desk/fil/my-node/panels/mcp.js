// %mcp-server (the urbit-mcp desk): what the ship offers MCP clients such as
// Claude Code, and importing more of it from other desks.
//
//   read   /~/scry/mcp-server/mcp/tools.json      {tools:[{name, description, inputSchema}]}
//          /~/scry/mcp-server/mcp/prompts.json    {prompts:[{name, title, description, arguments}]}
//          /~/scry/mcp-server/mcp/resources.json  {resources:[{uri, name, title?, description?, mimeType?, size?}]}
//          /~/scry/mcp-server/mcp/templates.json  {resourceTemplates:[{uriTemplate, name, …}]}
//   write  POST /mcp  a JSON-RPC tools/call of mcp/import-mcp-*, mcp/add-mcp-*
//                     and mcp/delete-mcp-feature
//
// The scries go through the agent's mcp-* marks (mar/mcp/*.hoon), which
// leave out each tool's Hoon code. /mcp is the same endpoint MCP clients
// use; it takes the ship's login cookie, and refuses browser pages that are
// not on localhost or the ship's eauth URL.

import { scry, el, createPanel, isShown, confirmDialog } from '../lib.js';

// --- mcp-server's API ---

const MCP_URL = '/mcp';
let rpcId = 0;

// Run one MCP tool through /mcp. Resolves with the tool's structured result
// (or its text), throws with a readable message. No MCP-Protocol-Version
// header: the server then takes the request as a plain 2025-11-25 call, and
// with Accept: application/json it answers in one JSON body, not a stream.
async function callTool(name, args) {
  let res;
  try {
    res = await fetch(MCP_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } })
    });
  } catch {
    throw new Error('your ship did not answer');
  }
  if (res.status === 403) throw new Error('the MCP server only takes requests from localhost or the ship’s eauth address');
  if (res.status === 401) throw new Error('you are signed out');
  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`your ship answered ${res.status}`);
  }
  if (body.error) throw new Error(body.error.message || 'the MCP server refused that');
  const result = body.result || {};
  const text = (result.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  if (result.isError) throw new Error(text || 'the tool failed');
  return result.structuredContent ?? text;
}

function loadError(err) {
  if (/ 404$/.test(err.message)) return 'Could not reach %mcp-server — is the urbit-mcp desk installed and running?';
  if (/ 40[13]$/.test(err.message)) return 'Could not load MCP settings — you are signed out.';
  return `Could not load MCP settings — ${err.message}`;
}

// --- Lists ---

// The four kinds of feature, how to read them and how to import them.
const KINDS = {
  tools: {
    heading: 'Tools',
    path: '/mcp/tools',
    field: 'tools',
    importTool: 'mcp/import-mcp-tools',
    deleteKind: 'tool',
    noun: ['tool', 'tools'],
    help: [
      'Actions an MCP client (such as Claude Code) can run on this ship. Each tool runs as a thread with the arguments the client sends.',
      'Open a tool to see its parameters. Tools come from importing a desk or adding one above. Any tool can be deleted except the ones this page uses to add, import and delete.'
    ]
  },
  prompts: {
    heading: 'Prompts',
    path: '/mcp/prompts',
    field: 'prompts',
    importTool: 'mcp/import-mcp-prompts',
    deleteKind: 'prompt',
    noun: ['prompt', 'prompts'],
    help: 'Ready-made instructions a client can offer you, often as a slash command. Open one to see what it asks for.'
  },
  resources: {
    heading: 'Resources',
    path: '/mcp/resources',
    field: 'resources',
    importTool: 'mcp/import-mcp-resources',
    deleteKind: 'resource',
    noun: ['resource', 'resources'],
    help: 'Documents a client can read by address (URI), such as the Urbit docs.'
  },
  templates: {
    heading: 'Resource templates',
    path: '/mcp/templates',
    field: 'resourceTemplates',
    importTool: 'mcp/import-mcp-templates',
    deleteKind: 'template',
    noun: ['template', 'templates'],
    help: 'Resource addresses with blanks, such as a Clay path, that a client fills in to read something on this ship.'
  }
};

// Adding one by hand: the add tool for each kind, what to call it, and an
// example name.
const ADD = {
  tools: { label: 'Tool', tool: 'mcp/add-mcp-tool', placeholder: 'flr/do-thing' },
  prompts: { label: 'Prompt', tool: 'mcp/add-mcp-prompt', placeholder: 'flr/ask-thing' },
  resources: { label: 'Resource', tool: 'mcp/add-mcp-resource', placeholder: 'flr/notes' },
  templates: { label: 'Resource template', tool: 'mcp/add-mcp-template', placeholder: 'flr/read-note' }
};

// Read a dropped .hoon file. A file in the desk's own format
// (fil/mcp/tools/*.hoon, fil/mcp/prompts/*.hoon) is a whole definition:
// imports, then :* name, description… and the gate last; take the gate out
// of it, and its name and words. Anything else is taken as the gate itself.
//   readHoon(text, 'tools') -> { gate, name?, title?, desc? }
function readHoon(text, kind) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  // where the gate starts: after `^-  thread-builder:tool:mcp` in a tool,
  // at the `|=` over a map of prompt arguments in a prompt
  const start = kind === 'tools'
    ? lines.findIndex((l) => /^\s*\^-\s+thread-builder:tool:mcp\s*$/.test(l)) + 1
    : lines.findIndex((l) => /^\s*\|=\s+\S+=\(map\s+(name:argument:prompt:mcp|@t)\s+@t\)/.test(l));
  if (start <= 0) return { gate: text.trim(), missing: missingImports(text) };
  // it ends before the == that closes the definition's :*
  let end = lines.length;
  while (end > start && !/^\s*==\s*$/.test(lines[end - 1])) end--;
  const body = lines.slice(start, end > start ? end - 1 : lines.length);
  const indent = Math.min(...body.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  const gate = body.map((l) => l.slice(indent)).join('\n').trim();
  // the cords right after :* — name, then (description) or (title, description)
  const cords = [];
  const def = text.match(/\^-\s+(?:tool|prompt):mcp\s+:\*/);
  const head = def ? text.slice(def.index + def[0].length) : '';
  const cord = /^\s*(?:'''\n([\s\S]*?)\n\s*'''|'((?:[^'\\]|\\.)*)'|`'((?:[^'\\]|\\.)*)'|~)/;
  let rest = head;
  for (let i = 0; i < 3; i++) {
    const m = rest.match(cord);
    if (!m) break;
    const value = m[1] ?? m[2] ?? m[3];
    cords.push(value === undefined ? '' : value.split('\n').map((l) => l.trim()).join('\n').trim());
    rest = rest.slice(m[0].length);
  }
  const missing = missingImports(text);
  return kind === 'tools'
    ? { gate, missing, name: cords[0], desc: cords[1] }
    : { gate, missing, name: cords[0], title: cords[1], desc: cords[2] };
}

// What a hand-added gate can use: add-mcp-tool and add-mcp-prompt build it
// against mcp, spider, strand, io (strandio) and zuse, nothing else. A file
// importing more (/- sole, /+ at=mcp-aqua-tool…) names things that won't be
// there. Returns those imports, as written.
const IN_SCOPE = new Set(['mcp', 'spider', 'io=strandio']);
function missingImports(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*\/[-+]\s+(.*?)\s*(?:::.*)?$/);
    if (!m) continue;
    for (const item of m[1].split(/[\s,]+/).filter(Boolean)) {
      if (!IN_SCOPE.has(item.replace(/^\*/, ''))) out.push(item);
    }
  }
  return out;
}

// A Hoon crash from the server, in words: "crash-find.id/…" means the code
// used a name that isn't in scope.
function hoonError(message) {
  const find = message.match(/find\.([^\s/]+)/);
  if (find) return `Hoon couldn’t find ${find[1]}: the code uses a name that isn’t in scope here (only mcp, spider, strand, io and zuse are).`;
  return message;
}

// One line per feature: its name and a one-line description; it opens to
// show the rest.
// `action` (a Delete button) sits at the end of the row.
function item(name, summary, details, action) {
  return el('details', { className: 'mn-item' }, [
    el('summary', {}, [
      el('span', { className: 'mn-item__name', title: name }, [name]),
      el('span', { className: 'mn-item__desc' }, [summary || '']),
      action
    ]),
    el('div', { className: 'mn-item__body' }, details)
  ]);
}

// A small table inside an opened item; rows of cells: a name (cut off with
// "…" when long), short values, then a description that wraps.
function detailTable(headings, rows) {
  return el('table', { className: 'mn-table mn-table--compact' }, [
    el('thead', {}, [el('tr', {}, headings.map((h) => el('th', {}, [h])))]),
    el('tbody', {}, rows.map((cells) => el('tr', {}, cells.map((c, i) =>
      i === 0 ? el('td', { className: 'mn-truncate', title: c }, [c])
        : i === cells.length - 1 ? el('td', { className: 'mn-wrap' }, [c])
          : el('td', { className: 'mn-num' }, [c])))))
  ]);
}

// key/value lines (only the ones that have a value)
function facts(pairs) {
  const shown = pairs.filter(([, v]) => v !== undefined && v !== null && v !== '');
  return shown.length
    ? el('dl', { className: 'mn-facts' }, shown.flatMap(([k, v]) => [el('dt', {}, [k]), el('dd', {}, [String(v)])]))
    : null;
}

const firstLine = (text) => (text || '').trim().split('\n')[0];
const para = (text) => text && el('p', { className: 'mn-item__text' }, [text.trim()]);

const BUILD = {
  tools: (t, action) => {
    const props = Object.entries(t.inputSchema?.properties || {});
    const required = new Set(t.inputSchema?.required || []);
    return item(t.name, firstLine(t.description), [
      para(t.description),
      props.length
        ? detailTable(['Parameter', 'Type', 'Required', 'Description'],
            props.map(([name, p]) => [name, p.type || '', required.has(name) ? 'yes' : 'no', (p.description || '').trim()]))
        : el('p', { className: 'mn-hint' }, ['No parameters.'])
    ], action);
  },
  prompts: (p, action) => item(p.name, p.title || firstLine(p.description), [
    para(p.description),
    p.arguments?.length
      ? detailTable(['Argument', 'Required', 'Description'],
          p.arguments.map((a) => [a.name, a.required ? 'yes' : 'no', (a.description || '').trim()]))
      : el('p', { className: 'mn-hint' }, ['No arguments.'])
  ], action),
  resources: (r, action) => item(r.name, r.title || firstLine(r.description), [
    para(r.description),
    facts([['URI', r.uri], ['Type', r.mimeType], ['Size', r.size]])
  ], action),
  templates: (t, action) => item(t.name, t.title || firstLine(t.description), [
    para(t.description),
    facts([['URI template', t.uriTemplate], ['Type', t.mimeType]])
  ], action)
};

// what each kind's delete goes by: a resource's URI, otherwise its name
const keyOf = (kind, x) => (kind === 'resources' ? x.uri : x.name);

// The tools this page runs on: Import, Add MCP tools and Delete call them.
// They get no Delete button, so the page can't take away its own controls;
// every other tool, prompt, resource and template can be deleted.
const REQUIRED_TOOLS = new Set([
  'mcp/add-mcp-tool',
  'mcp/add-mcp-prompt',
  'mcp/add-mcp-resource',
  'mcp/add-mcp-template',
  'mcp/import-mcp-tools',
  'mcp/import-mcp-prompts',
  'mcp/import-mcp-resources',
  'mcp/import-mcp-templates',
  'mcp/delete-mcp-feature'
]);
const isRequired = (kind, x) => kind === 'tools' && REQUIRED_TOOLS.has(x.name);

// what the filter box matches against
const SEARCH = {
  tools: (t) => [t.name, t.description],
  prompts: (p) => [p.name, p.title, p.description],
  resources: (r) => [r.name, r.title, r.description, r.uri],
  templates: (t) => [t.name, t.title, t.description, t.uriTemplate]
};

// --- Panel ---

function render(root) {
  const data = { tools: null, prompts: null, resources: null, templates: null };
  const { sections, section, update, field, run, pageStatus, mount } = createPanel(root, 'mcp');

  // One filter box per list, in its card header so typing never gets
  // rebuilt away; it matches names, descriptions and addresses.
  const filters = {};
  function filterBox(kind) {
    const input = el('input', {
      type: 'search',
      placeholder: 'Filter',
      'aria-label': `Filter ${KINDS[kind].noun[1]}`,
      autocomplete: 'off',
      spellcheck: false
    });
    input.addEventListener('input', () => show(kind, true));
    filters[kind] = input;
    return input;
  }

  // Delete, for anything but the tools this page needs (REQUIRED_TOOLS).
  // A click on it must not open or close the row it sits in.
  function deleteButton(kind, x) {
    if (isRequired(kind, x)) return null;
    const key = keyOf(kind, x);
    const what = KINDS[kind].deleteKind;
    return el('button', {
      type: 'button',
      className: 'mn-button--danger mn-item__action',
      onclick: async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sure = await confirmDialog(`Delete the ${what} ${x.name}?`,
          `MCP clients can no longer use it. To have it back, add or import it again.`, 'Delete');
        if (!sure) return;
        run(kind, `Delete ${x.name}`, async () => {
          await callTool('mcp/delete-mcp-feature', { kind: what, key });
          return `Deleted ${x.name}.`;
        });
      }
    }, ['Delete']);
  }

  function buildList(kind) {
    const list = data[kind];
    const [one, many] = KINDS[kind].noun;
    if (!list.length) return [el('p', { className: 'mn-empty' }, [`No ${many} yet.`])];
    const q = filters[kind].value.trim().toLowerCase();
    // by name, with the tools this page needs (no Delete) at the end
    const sorted = [...list].sort((a, b) => isRequired(kind, a) - isRequired(kind, b) || a.name.localeCompare(b.name));
    const shown = q ? sorted.filter((x) => SEARCH[kind](x).some((s) => (s || '').toLowerCase().includes(q))) : sorted;
    const count = q
      ? `${shown.length} of ${list.length} ${list.length === 1 ? one : many}`
      : `${list.length} ${list.length === 1 ? one : many}`;
    return [
      el('p', { className: 'mn-hint mn-list-count' }, [count]),
      shown.length
        // over 10: the list scrolls inside the card, 10 rows tall
        ? el('div', { className: shown.length > 10 ? 'mn-items mn-scroll' : 'mn-items' }, shown.map((x) => BUILD[kind](x, deleteButton(kind, x))))
        : el('p', { className: 'mn-empty' }, [`No ${many} match “${filters[kind].value.trim()}”.`])
    ];
  }

  function show(kind, force) {
    if (!data[kind]) return;
    update(kind, [data[kind], filters[kind].value.trim()], () => buildList(kind), force);
  }

  // --- Import from a desk ---

  const deskInput = el('input', {
    type: 'text',
    id: 'mcp-import-desk',
    placeholder: 'desk',
    autocomplete: 'off',
    spellcheck: false,
    required: true,
    pattern: '%?[a-z][a-z0-9\\-]*',
    title: 'A desk name: lowercase letters, digits and -'
  });
  const kindSelect = el('select', { 'aria-label': 'What to import' }, [
    el('option', { value: 'all' }, ['Everything']),
    ...Object.entries(KINDS).map(([k, v]) => el('option', { value: k }, [v.heading]))
  ]);

  // "3 new, 1 updated" from the import tools' {imported-*, refreshed-*}
  function summarize(kind, result) {
    if (!result || typeof result !== 'object') return `${KINDS[kind].heading}: ${result || 'done'}`;
    let added = 0;
    let changed = 0;
    for (const [k, v] of Object.entries(result)) {
      if (!Array.isArray(v)) continue;
      if (k.startsWith('imported')) added += v.length;
      if (k.startsWith('refreshed')) changed += v.length;
    }
    const parts = [added && `${added} new`, changed && `${changed} updated`].filter(Boolean);
    return `${KINDS[kind].heading}: ${parts.length ? parts.join(', ') : 'nothing new'}`;
  }

  const importForm = el('form', {
    onsubmit: (e) => {
      e.preventDefault();
      const desk = deskInput.value.trim().replace(/^%/, '');
      const kinds = kindSelect.value === 'all' ? Object.keys(KINDS) : [kindSelect.value];
      run('import', `Import from %${desk}`, async () => {
        const lines = [];
        for (const kind of kinds) lines.push(summarize(kind, await callTool(KINDS[kind].importTool, { desk })));
        return `Imported from %${desk} — ${lines.join(' · ')}`;
      });
    }
  }, [
    field('Desk', 'Reads the MCP features the desk’s running agents provide. Importing again updates what changed.', [
      deskInput, kindSelect, el('button', { type: 'submit' }, ['Import'])
    ], deskInput.id)
  ]);

  // --- Add one by hand: pick the kind and name it; the other fields follow ---
  // the kind. Each kind goes through its mcp/add-mcp-* tool, and adding the
  // same name (a resource: the same URI) again replaces it.

  const textInput = (id, props = {}) =>
    el('input', { type: 'text', id, autocomplete: 'off', spellcheck: false, ...props });
  // The Hoon for a tool's thread or a prompt's messages comes from a .hoon
  // file, dropped on the area or chosen by clicking it; nothing is typed. A
  // whole tool or prompt file gives its gate, and fills the name and words
  // where they are still empty. A file importing more than a hand-added gate
  // can use is refused here. hoon[kind] holds what was loaded.
  const hoon = { tools: null, prompts: null };
  function hoonDrop(kind, id) {
    const what = kind === 'tools' ? 'tool' : 'prompt';
    const picker = el('input', { type: 'file', id, accept: '.hoon,text/plain', className: 'mn-drop__input' });
    const text = el('span', {});
    const preview = el('pre', { className: 'mn-code' });
    const shown = el('details', { className: 'mn-disclosure', hidden: true }, [el('summary', {}, ['Show']), preview]);
    const area = el('label', { className: 'mn-drop' }, [picker, text]);
    function show() {
      const got = hoon[kind];
      text.replaceChildren(...(got
        ? [el('strong', {}, [got.file]), ` · ${got.gate.split('\n').length} lines · drop or click to change`]
        : [el('strong', {}, [`Drop ${what}’s .hoon file here`]), ' or click to choose']));
      area.classList.toggle('mn-drop--chosen', !!got);
      preview.textContent = got ? got.gate : '';
      shown.hidden = !got;
      if (!got) shown.open = false;
    }
    async function load(file) {
      if (!file) return;
      let source;
      try {
        source = await file.text();
      } catch (err) {
        sections.add.status.set(`Couldn’t read ${file.name} — ${err.message}`, { error: true });
        return;
      }
      const got = readHoon(source, kind);
      if (got.missing.length) {
        sections.add.status.set(`${file.name} imports ${got.missing.join(', ')}, which a ${what} added here can’t use. Add it with Import from a desk instead.`, { error: true });
        return;
      }
      // fill in the file's name and words: into empty fields, and over
      // what the last file filled in, but never over what was typed
      const last = hoon[kind] || {};
      const filled = [];
      for (const [input, value, before, word] of [
        [addName, got.name, last.name, 'name'],
        [addTitle, got.title, last.title, 'title'],
        [addDesc, got.desc, last.desc, 'description']
      ]) {
        const now = input.value.trim();
        if (value && (!now || now === before)) {
          input.value = value;
          filled.push(word);
        }
      }
      hoon[kind] = { gate: got.gate, file: file.name, name: got.name, title: got.title, desc: got.desc };
      const name = addName.value.trim();
      const exists = (data[kind] || []).some((x) => x.name === name);
      sections.add.status.set(`Loaded ${file.name}${filled.length ? `, with its ${filled.join(', ')}` : ''}.${exists ? ` ${name} is already on this ship: adding replaces it, so rename it to keep both.` : ''}`);
      show();
    }
    picker.addEventListener('change', () => {
      load(picker.files?.[0]);
      picker.value = '';
    });
    area.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      area.classList.add('mn-drop--over');
    });
    area.addEventListener('dragleave', () => area.classList.remove('mn-drop--over'));
    area.addEventListener('drop', (e) => {
      e.preventDefault();
      area.classList.remove('mn-drop--over');
      load(e.dataTransfer?.files?.[0]);
    });
    show();
    return {
      node: el('div', { className: 'mn-hoon' }, [area, shown]),
      clear: () => {
        hoon[kind] = null;
        show();
      }
    };
  }

  // a settings row with its control underneath, for wide controls
  const stacked = (label, hint, control, id) =>
    el('div', { className: 'mn-field mn-field--stacked' }, [
      el('label', { className: 'mn-field__label', htmlFor: id }, [label, hint && el('span', { className: 'mn-field__hint' }, [hint])]),
      control
    ]);

  // Rows that can be added and removed: a tool's parameters, a prompt's
  // arguments. `make()` returns { node, read() } for one row.
  function repeater(id, noun, make) {
    const rows = new Set();
    const list = el('div', { className: 'mn-repeat', id });
    const add = () => {
      const row = make();
      const remove = el('button', {
        type: 'button',
        className: 'mn-repeat__remove',
        'aria-label': `Remove this ${noun}`,
        title: `Remove this ${noun}`,
        onclick: () => {
          rows.delete(row);
          row.node.remove();
        }
      }, ['×']);
      row.node.append(remove);
      rows.add(row);
      list.append(row.node);
      row.node.querySelector('input')?.focus();
    };
    return {
      node: el('div', { className: 'mn-repeat-wrap' }, [list, el('button', { type: 'button', onclick: add }, [`Add ${noun}`])]),
      read: () => [...rows].map((r) => r.read()),
      clear: () => {
        rows.clear();
        list.replaceChildren();
      }
    };
  }

  const params = repeater('mcp-add-params', 'parameter', () => {
    const name = textInput(undefined, { placeholder: 'name', 'aria-label': 'Parameter name' });
    const type = el('select', { 'aria-label': 'Parameter type' },
      ['string', 'number', 'boolean', 'array', 'object'].map((t) => el('option', { value: t }, [t])));
    const desc = textInput(undefined, { className: 'mn-repeat__desc', placeholder: 'what it is for', 'aria-label': 'Parameter description' });
    const req = el('input', { type: 'checkbox', checked: true });
    return {
      node: el('div', { className: 'mn-row' }, [name, type, desc, el('label', {}, [req, 'required'])]),
      read: () => ({ name: name.value.trim(), type: type.value, description: desc.value.trim(), required: req.checked })
    };
  });
  const promptArgs = repeater('mcp-add-args', 'argument', () => {
    const name = textInput(undefined, { placeholder: 'name', 'aria-label': 'Argument name' });
    const desc = textInput(undefined, { className: 'mn-repeat__desc', placeholder: 'what it is for', 'aria-label': 'Argument description' });
    const req = el('input', { type: 'checkbox', checked: true });
    return {
      node: el('div', { className: 'mn-row' }, [name, desc, el('label', {}, [req, 'required'])]),
      read: () => ({ name: name.value.trim(), description: desc.value.trim(), required: req.checked })
    };
  });

  const addKind = el('select', { id: 'mcp-add-kind' },
    Object.entries(ADD).map(([k, a]) => el('option', { value: k }, [a.label])));
  const addName = textInput('mcp-add-name', { required: true });
  const addTitle = textInput('mcp-add-title');
  const addDesc = el('textarea', { id: 'mcp-add-desc', rows: 2 });
  const addUri = textInput('mcp-add-uri');
  const addMime = textInput('mcp-add-mime', { placeholder: 'text/plain' });
  const addSize = el('input', { type: 'number', id: 'mcp-add-size', min: 0, step: 1 });
  const threadFile = hoonDrop('tools', 'mcp-add-thread');
  const messagesFile = hoonDrop('prompts', 'mcp-add-messages');
  const addButton = el('button', { type: 'submit' }, ['Add tool']);

  const uriLabel = el('span', {}, ['URI']);
  const uriHint = el('span', { className: 'mn-field__hint' });
  const titleHint = el('span', { className: 'mn-field__hint' });
  const descHint = el('span', { className: 'mn-field__hint' });

  // each row, and the kinds it belongs to
  const addRows = [
    [field('Kind', 'What to add.', [addKind], addKind.id), null],
    [field('Name', null, [addName], addName.id), null],
    [field(el('span', {}, ['Title', titleHint]), null, [addTitle], addTitle.id), ['prompts', 'resources', 'templates']],
    [el('div', { className: 'mn-field' }, [
      el('label', { className: 'mn-field__label', htmlFor: addUri.id }, [uriLabel, uriHint]),
      el('div', { className: 'mn-field__control' }, [addUri])
    ]), ['resources', 'templates']],
    [stacked(el('span', {}, ['Description', descHint]), null, addDesc, addDesc.id), null],
    [field('Type', 'Its MIME type, such as text/markdown. Optional.', [addMime], addMime.id), ['resources', 'templates']],
    [field('Size', 'In bytes. Optional.', [addSize], addSize.id), ['resources']],
    [stacked('Parameters', 'What a client passes to the tool. Each needs a name and a description.', params.node, 'mcp-add-params'), ['tools']],
    [stacked('Thread', 'A tool file like the desk’s fil/mcp/tools/*.hoon, or a .hoon file holding just the gate. It can use mcp, spider, strand, io and zuse, nothing else it imports.', threadFile.node, 'mcp-add-thread'), ['tools']],
    [stacked('Arguments', 'What a client asks you for before using the prompt. Optional.', promptArgs.node, 'mcp-add-args'), ['prompts']],
    [stacked('Messages', 'A prompt file like the desk’s fil/mcp/prompts/*.hoon, or a .hoon file holding just the gate.', messagesFile.node, 'mcp-add-messages'), ['prompts']]
  ];

  // show the rows for the chosen kind, and word the shared ones for it
  function syncAddForm() {
    const kind = addKind.value;
    for (const [row, kinds] of addRows) row.hidden = kinds !== null && !kinds.includes(kind);
    addName.placeholder = ADD[kind].placeholder;
    addButton.textContent = `Add ${ADD[kind].label.toLowerCase()}`;
    titleHint.textContent = kind === 'prompts' ? 'What people see, such as Get our ship name.' : 'What people see. Optional.';
    descHint.textContent = kind === 'tools' || kind === 'prompts' ? 'What it does; clients read this to decide when to use it.' : 'Optional.';
    uriLabel.textContent = kind === 'templates' ? 'URI template' : 'URI';
    addUri.placeholder = kind === 'templates' ? 'scry://cx/{desk}/{case}/{+clayPath}' : 'beam://=/base/=/sys/zuse/hoon';
    uriHint.textContent = kind === 'templates'
      ? 'An address with {blanks} a client fills in. beam://, scry:// and fine:// are read through this ship; others, such as https://, the client fetches itself.'
      : 'beam:// reads a Clay file, scry:// a scry, fine:// a remote scry, all through this ship. Other addresses, such as https://, the client fetches itself.';
  }
  addKind.addEventListener('change', syncAddForm);
  // a file dropped beside a drop area would open in the browser and leave
  // the page, so ignore drops elsewhere while the card is on screen
  for (const type of ['dragover', 'drop']) {
    window.addEventListener(type, (e) => {
      if (e.dataTransfer?.types?.includes('Files') && !e.target?.closest?.('.mn-drop') && isShown(addForm)) e.preventDefault();
    });
  }

  // The arguments for the chosen kind's add tool, or a reason it can't go.
  function addArgs(kind) {
    const name = addName.value.trim();
    const title = addTitle.value.trim();
    const desc = addDesc.value.trim();
    const uri = addUri.value.trim();
    if (!name) return { error: 'Give it a name.', focus: addName };
    const optional = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined));
    if (kind === 'tools') {
      if (!desc) return { error: 'A tool needs a description, so clients know when to use it.', focus: addDesc };
      if (!hoon.tools) return { error: 'Load the tool’s .hoon file.' };
      const list = params.read();
      const names = list.map((p) => p.name);
      if (list.some((p) => !p.name || !p.description)) return { error: 'Each parameter needs a name and a description.' };
      if (new Set(names).size !== names.length) return { error: 'Two parameters have the same name.' };
      return {
        args: {
          name,
          desc,
          parameters: Object.fromEntries(list.map((p) => [p.name, { type: p.type, description: p.description }])),
          required: list.filter((p) => p.required).map((p) => p.name),
          'thread-builder': hoon.tools.gate
        }
      };
    }
    if (kind === 'prompts') {
      if (!title) return { error: 'A prompt needs a title.', focus: addTitle };
      if (!desc) return { error: 'A prompt needs a description.', focus: addDesc };
      if (!hoon.prompts) return { error: 'Load the prompt’s .hoon file.' };
      const list = promptArgs.read();
      if (list.some((a) => !a.name || !a.description)) return { error: 'Each argument needs a name and a description.' };
      return { args: { name, title, desc, arguments: list, 'messages-builder': hoon.prompts.gate } };
    }
    if (!uri) return { error: kind === 'templates' ? 'Give it a URI template.' : 'Give it a URI.', focus: addUri };
    const size = addSize.value.trim();
    if (kind === 'resources' && size && !/^\d+$/.test(size)) return { error: 'Size is a whole number of bytes.', focus: addSize };
    return {
      args: kind === 'templates'
        ? optional({ 'uri-template': uri, name, title, desc, 'mime-type': addMime.value.trim() })
        : optional({ uri, name, title, desc, 'mime-type': addMime.value.trim(), size: size ? Number(size) : undefined })
    };
  }

  const addForm = el('form', {
    onsubmit: (e) => {
      e.preventDefault();
      const kind = addKind.value;
      const { args, error, focus } = addArgs(kind);
      if (error) {
        sections.add.status.set(error, { error: true });
        focus?.focus();
        return;
      }
      const label = `${ADD[kind].label} ${args.name}`;
      run('add', `Add ${label}`, async () => {
        try {
          await callTool(ADD[kind].tool, args);
        } catch (err) {
          throw new Error(hoonError(err.message));
        }
        // start over for the next one, on the same kind
        addForm.reset();
        params.clear();
        promptArgs.clear();
        threadFile.clear();
        messagesFile.clear();
        addKind.value = kind;
        syncAddForm();
        return `${label} added.`;
      });
    }
  }, [...addRows.map(([row]) => row), el('div', { className: 'mn-card__body mn-row mn-row--end' }, [addButton])]);
  syncAddForm();

  // --- Load / poll ---

  async function load(force) {
    const results = await Promise.allSettled(Object.entries(KINDS).map(([kind, k]) =>
      scry('mcp-server', k.path).then((json) => { data[kind] = json[k.field] || []; })));
    const failed = results.find((r) => r.status === 'rejected');
    if (failed && Object.values(data).every((d) => d === null)) {
      pageStatus.set(loadError(failed.reason), { error: true });
      return;
    }
    pageStatus.set(failed ? loadError(failed.reason) : '', { error: !!failed });
    for (const kind of Object.keys(KINDS)) show(kind, force);
  }

  mount([
    section('import', 'Import from a desk', [
      'Add tools, prompts and resources another desk offers, so MCP clients can use them.'
    ]),
    section('add', 'Add MCP tools', [
      'Add a tool, prompt, resource or resource template by hand.',
      'Adding mcp-tool with a same name or URI replaces it.'
    ]),
    ...Object.entries(KINDS).map(([kind, k]) => section(kind, k.heading, k.help, [filterBox(kind)]))
  ], load);

  // the import and add cards have no data to wait for
  sections.import.body.replaceChildren(importForm);
  sections.import.seen = 'static';
  sections.add.body.replaceChildren(addForm);
  sections.add.seen = 'static';
}

export { render };
