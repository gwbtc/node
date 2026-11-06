// Shared code for the panels: fetching, DOM helpers, ship names, createPanel.

// --- Fetching ---

// GET /~/scry/<app><path>.json
export async function scry(app, path) {
  const res = await fetch(`/~/scry/${app}${path}.json`);
  if (!res.ok) throw new Error(`scry ${app}${path} failed: ${res.status}`);
  return res.json();
}

// --- DOM helpers ---

// el('button', { onclick }, ['Save']): on* are listeners, else property or
// attribute; null/undefined/false children are skipped
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

// "just now", "5 min ago", "3 h ago", or a date
export function ago(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleString();
}

// A card's (or the page's) status line; a message stays until the next
export function statusLine(className = 'mn-status mn-card__status') {
  const node = el('p', { className, role: 'status' });
  function set(text, { error = false } = {}) {
    node.textContent = text;
    node.classList.toggle('mn-error', error);
  }
  return { node, set };
}

// Shows "label…", then "label: done" (or the string fn returns) or the error
export async function runWithStatus(status, label, fn) {
  status.set(`${label}…`);
  try {
    const message = await fn();
    status.set(typeof message === 'string' ? message : `${label}: done`);
  } catch (err) {
    status.set(`${label} failed — ${err.message}`, { error: true });
  }
}

// "?" help: shows on hover or focus; a click pins it until Escape or a click
// elsewhere. `text` is a string or a list of paragraphs.
let helpCount = 0;
function helpButton(topic, text) {
  const id = `mn-help-${++helpCount}`;
  const paragraphs = Array.isArray(text) ? text : [text];
  const tip = el('div', { className: 'mn-help__tip', id, role: 'tooltip' },
    paragraphs.map((p) => el('p', {}, [p])));
  const button = el('button', {
    type: 'button',
    className: 'mn-help__button',
    'aria-label': `About ${topic}`,
    'aria-describedby': id,
    'aria-expanded': 'false'
  }, ['?']);
  const wrap = el('span', { className: 'mn-help' }, [button, tip]);

  const setOpen = (open) => {
    wrap.classList.toggle('mn-help--open', open);
    button.setAttribute('aria-expanded', String(open));
  };
  button.addEventListener('click', () => {
    const open = !wrap.classList.contains('mn-help--open');
    setOpen(open);
    // focus alone shows the tip, so closing drops it
    if (!open) button.blur();
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) setOpen(false);
  });
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      button.blur();
    }
  });
  return wrap;
}

// Title, "?" help, then any controls
export function cardHeader(heading, help, extras = []) {
  return el('header', { className: 'mn-card__header' }, [
    el('div', { className: 'mn-card__heading' }, [
      el('h3', { className: 'mn-card__title' }, [heading]),
      help && helpButton(heading, help)
    ]),
    ...extras
  ]);
}

// Collapsible cards, remembered in this browser (if storage works)
const COLLAPSED_KEY = 'my-node.collapsed';

function readCollapsed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function saveCollapsed(ids) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...ids]));
  } catch {
    // not remembered
  }
}

// chevron (or title click) closes the card to its header; returns { set }
function makeCollapsible(card, id, heading) {
  const header = card.querySelector('.mn-card__header');
  const toggle = el('button', { type: 'button', className: 'mn-collapse' }, [
    el('span', { className: 'mn-collapse__icon', 'aria-hidden': 'true' })
  ]);

  const collapsed = () => card.classList.contains('mn-card--collapsed');
  function set(close, remember = true) {
    card.classList.toggle('mn-card--collapsed', close);
    toggle.setAttribute('aria-expanded', String(!close));
    toggle.setAttribute('aria-label', `${close ? 'Open' : 'Close'} ${heading}`);
    toggle.title = close ? 'Open' : 'Close';
    if (remember) {
      const ids = readCollapsed();
      if (close) ids.add(id);
      else ids.delete(id);
      saveCollapsed(ids);
    }
  }

  toggle.addEventListener('click', () => set(!collapsed()));
  header.querySelector('.mn-card__title')?.addEventListener('click', () => set(!collapsed()));
  header.append(toggle);
  set(readCollapsed().has(id), false);
  return { set };
}

// Styled confirm(): true only for the confirm button. Cancel has focus.
export function confirmDialog(question, detail, confirmLabel) {
  return new Promise((resolve) => {
    const cancel = el('button', { type: 'submit', value: 'cancel', autofocus: true }, ['Cancel']);
    const yes = el('button', { type: 'submit', value: 'confirm', className: 'mn-button--danger' }, [confirmLabel]);
    const dialog = el('dialog', { className: 'mn-dialog', 'aria-label': question }, [
      el('form', { method: 'dialog' }, [
        el('p', { className: 'mn-dialog__question' }, [question]),
        detail && el('p', { className: 'mn-dialog__detail' }, [detail]),
        el('div', { className: 'mn-row mn-row--end' }, [cancel, yes])
      ])
    ]);
    // backdrop click cancels
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close('cancel');
    });
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'confirm');
      dialog.remove();
    });
    // inside the my-node view so its styles apply
    (document.querySelector('main > [data-view="my-node"]') || document.body).append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}

// Copy to the clipboard, with a fallback for plain http; true if copied
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = el('textarea', { value: text, readOnly: true });
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

// On screen and the tab visible; polling pauses otherwise
export function isShown(node) {
  return !document.hidden && node.isConnected && node.getClientRects().length > 0;
}

// --- Ship names ---
// @p parsing as in ++fed:ag; syllables from ++po. galaxy ~zod, star ~marzod,
// planet/moon 2-4 words, comet 1-4 words then --groups of 4.

const PREFIXES = 'dozmarbinwansamlitsighidfidlissogdirwacsabwissibrigsoldopmodfoglidhopdardorlorhodfolrintogsilmirholpaslacrovlivdalsatlibtabhanticpidtorbolfosdotlosdilforpilramtirwintadbicdifrocwidbisdasmidloprilnardapmolsanlocnovsitnidtipsicropwitnatpanminritpodmottamtolsavposnapnopsomfinfonbanmorworsipronnorbotwicsocwatdolmagpicdavbidbaltimtasmalligsivtagpadsaldivdactansidfabtarmonranniswolmispallasdismaprabtobrollatlonnodnavfignomnibpagsopralbilhaddocridmocpacravripfaltodtiltinhapmicfanpattaclabmogsimsonpinlomrictapfirhasbosbatpochactidhavsaplindibhosdabbitbarracparloddosbortochilmactomdigfilfasmithobharmighinradmashalraglagfadtopmophabnilnosmilfopfamdatnoldinhatnacrisfotribhocnimlarfitwalrapsarnalmoslandondanladdovrivbacpollaptalpitnambonrostonfodponsovnocsorlavmatmipfip';
const SUFFIXES = 'zodnecbudwessevpersutletfulpensytdurwepserwylsunrypsyxdyrnuphebpeglupdepdysputlughecryttyvsydnexlunmeplutseppesdelsulpedtemledtulmetwenbynhexfebpyldulhetmevruttylwydtepbesdexsefwycburderneppurrysrebdennutsubpetrulsynregtydsupsemwynrecmegnetsecmulnymtevwebsummutnyxrextebfushepbenmuswyxsymselrucdecwexsyrwetdylmynmesdetbetbeltuxtugmyrpelsyptermebsetdutdegtexsurfeltudnuxruxrenwytnubmedlytdusnebrumtynseglyxpunresredfunrevrefmectedrusbexlebduxrynnumpyxrygryxfeptyrtustyclegnemfermertenlusnussyltecmexpubrymtucfyllepdebbermughuttunbylsudpemdevlurdefbusbeprunmelpexdytbyttyplevmylwedducfurfexnulluclennerlexrupnedlecrydlydfenwelnydhusrelrudneshesfetdesretdunlernyrsebhulrylludremlysfynwerrycsugnysnyllyndyndemluxfedsedbecmunlyrtesmudnytbyrsenwegfyrmurtelreptegpecnelnevfes';

const syllables = (s) => new Set(s.match(/.{3}/g));
const PRE = syllables(PREFIXES);
const SUF = syllables(SUFFIXES);

const isWord = (w) => w.length === 6 && PRE.has(w.slice(0, 3)) && SUF.has(w.slice(3));
const isLeadWord = (w) => isWord(w) && w !== 'dozzod';
const isStar = (w) => isWord(w) && !w.startsWith('doz');

// 1-4 words, the first nonzero; min 2 for planets and moons
function isWordGroup(words, min) {
  return words.length >= min && words.length <= 4 && isLeadWord(words[0]) && words.every(isWord);
}

// 'SAMPEL palnet' -> '~sampel-palnet'; comets get -- every 4 words from the end
function formatShip(text) {
  const letters = String(text ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!letters) return String(text ?? '').includes('~') ? '~' : '';
  const words = letters.match(/.{1,6}/g);
  let out = `~${words[0]}`;
  for (let i = 1; i < words.length; i++) {
    out += ((words.length - i) % 4 === 0 ? '--' : '-') + words[i];
  }
  return out;
}

// Formats an input as a ship name while typing; keeps the cursor, and deleting
// a dash deletes the letter beside it
export function attachShipFormatter(input) {
  let previous = input.value;
  const lettersIn = (s) => s.replace(/[^a-z]/gi, '').length;

  input.addEventListener('input', (e) => {
    let raw = input.value;
    let before = lettersIn(raw.slice(0, input.selectionStart ?? raw.length));

    if (e.inputType?.startsWith('delete') && lettersIn(raw) === lettersIn(previous)) {
      const letters = raw.replace(/[^a-z]/gi, '');
      const at = e.inputType === 'deleteContentForward' ? before : before - 1;
      if (at >= 0 && at < letters.length) {
        raw = letters.slice(0, at) + letters.slice(at + 1);
        before = at;
      }
    }

    const formatted = formatShip(raw);
    previous = formatted;
    if (formatted === input.value) return;
    input.value = formatted;

    // cursor after the same number of letters
    let pos = formatted.startsWith('~') ? 1 : 0;
    for (let i = 0, seen = 0; i < formatted.length && seen < before; i++) {
      if (/[a-z]/.test(formatted[i])) {
        seen++;
        pos = i + 1;
      }
    }
    input.setSelectionRange(pos, pos);
  });
}

// -> { ship: '~sampel-palnet' } or { error }; ~ optional, any case
export function parseShip(input) {
  const text = String(input ?? '').trim().toLowerCase();
  if (!text) return { error: 'Enter a ship name, such as ~sampel-palnet.' };
  const body = text.startsWith('~') ? text.slice(1) : text;
  if (!/^[a-z]+(--?[a-z]+)*$/.test(body)) {
    return { error: `“${input.trim()}” is not a ship name: use letters and hyphens only, such as ~sampel-palnet.` };
  }

  const groups = body.split('--');
  let ok;
  if (groups.length > 1) {
    // comet
    ok = isWordGroup(groups[0].split('-'), 1)
      && groups.slice(1).every((g) => { const w = g.split('-'); return w.length === 4 && w.every(isWord); });
  } else {
    const words = body.split('-');
    ok = words.length === 1
      ? (words[0].length === 3 ? SUF.has(words[0]) : isStar(words[0]))
      : isWordGroup(words, 2);
  }
  if (!ok) return { error: `“${input.trim()}” is not a valid ship name. Check the spelling: each part must be a real @p syllable pair, such as ~sampel-palnet.` };
  return { ship: `~${body}` };
}

// --- Panels ---

const POLL_MS = 15000;

export function createPanel(root, prefix) {
  let busy = false; // skip polls during an action
  let load = async () => {};

  // load errors; cards report their own actions
  const pageStatus = statusLine('mn-status mn-page__status');

  // A card re-renders only when its data changed and it has no focus
  const sections = {};
  function section(name, heading, help, headerExtras = []) {
    const body = el('div');
    const status = statusLine();
    const card = el('section', { className: 'mn-card' }, [
      cardHeader(heading, help, headerExtras),
      body,
      status.node
    ]);
    // remembered as <prefix>.<name>
    const fold = makeCollapsible(card, `${prefix}.${name}`, heading);
    sections[name] = { card, body, status, fold, seen: null };
    return card;
  }

  function update(name, key, build, force) {
    const s = sections[name];
    const seen = JSON.stringify(key);
    if (seen === s.seen) return;
    if (!force && s.seen !== null && s.card.contains(document.activeElement)) return;
    s.seen = seen;
    // drop `cond && el()` leftovers
    s.body.replaceChildren(...build().filter((c) => c !== null && c !== undefined && c !== false));
  }

  // label (+ hint), then controls
  function field(label, hint, controls, forId) {
    return el('div', { className: 'mn-field' }, [
      el('label', { className: 'mn-field__label', htmlFor: forId }, [
        label,
        hint && el('span', { className: 'mn-field__hint' }, [hint])
      ]),
      el('div', { className: 'mn-field__control' }, controls)
    ]);
  }

  // run on a card's status line, then reload even where focused
  async function run(where, label, fn) {
    busy = true;
    try {
      await runWithStatus(sections[where].status, label, fn);
    } finally {
      busy = false;
      await load(true);
    }
  }

  // show the cards; load now and every 15 s while on screen
  function mount(cards, loader) {
    load = async (force = false) => {
      if (busy) return;
      await loader(force);
    };
    const page = el('div', { className: 'mn-page' }, [pageStatus.node, ...cards]);
    root.replaceChildren(page);
    for (const s of Object.values(sections)) s.body.replaceChildren(el('p', { className: 'mn-empty' }, ['Loading…']));
    load();
    setInterval(() => {
      if (isShown(page)) load();
    }, POLL_MS);
  }

  return {
    sections,
    section,
    update,
    field,
    run,
    pageStatus,
    mount,
    reload: (force = true) => load(force)
  };
}
