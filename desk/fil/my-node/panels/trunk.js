// %trunk settings: two tabs, both talking to trunk's own JSON API (the same
// one its page at /apps/trunk uses).
//
//   Notifications  notification switches and alert apps, devices, status
//                  read  /~/scry/trunk/debug.json
//   Calls          who can call, party line guest links, apps that host
//                  calls and the ship's public address
//                  read  /~/scry/trunk/policy.json  {mode, allow, block}
//                        /~/scry/trunk/guests.json  links, apps, public address
//                        /~/scry/trunk/rooms.json   the party lines we host
//   both           write POST /apps/trunk/action    a trunk-action as JSON
//
// Shapes are defined in trunk's lib/trunk-json.hoon and lib/trunk-push.hoon.

import { scry, el, ago, confirmDialog, copyText, parseShip, attachShipFormatter, createPanel } from '../lib.js';

// --- trunk's API ---

const ACTION_URL = '/apps/trunk/action';

// POST a trunk action. Resolves on 204, throws with a readable message.
// 422 means trunk refused it, 400 that it was not an action at all.
async function act(body) {
  let res;
  try {
    res = await fetch(ACTION_URL, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error('your ship did not answer');
  }
  if (res.status === 204) return;
  if (res.status === 422) throw new Error('trunk refused that');
  if (res.status === 401 || res.status === 403) throw new Error('you are signed out');
  throw new Error(`your ship answered ${res.status}`);
}

// The message for a failed scry of trunk as a whole.
function loadError(err) {
  return /\b(401|403)\b/.test(err.message)
    ? 'You are signed out.'
    : `Could not load trunk — ${err.message}. Is trunk installed and running?`;
}

// --- Notifications tab ---

// Notification switches, in trunk's push-kinds order.
const KINDS = [
  { key: 'dm', label: 'Direct messages' },
  { key: 'club', label: 'Group DMs' },
  {
    key: 'channel',
    label: 'Channel posts',
    options: [
      ['all', 'All that notify'],
      ['mentions', 'Only mentions'],
      ['none', 'None']
    ]
  },
  { key: 'replies', label: 'Thread replies' },
  { key: 'calls', label: 'Calls' },
  { key: 'reads', label: 'Clear notifications after the chat been read' },
  {
    key: 'notices',
    label: 'Reminders and alerts from other apps',
  }
];

// Hourly limits offered for an app's alerts. 0 = no hourly limit.
const CAPS = [10, 30, 60, 120, 300, 0];

// DEMO: one made-up app under Notifications → Apps, to preview the list on a
// ship where no app has sent an alert yet. Its controls change only this
// page and are never sent to trunk. Set SHOW_DEMO_APP to false once real
// apps show up, or delete this block and every line that mentions DEMO_APP.
const SHOW_DEMO_APP = true;
const DEMO_APP = {
  // the same fields /~/scry/trunk/debug.json gives for a real app
  id: 'grubbery/calendar',
  name: 'calendar',
  agent: 'grubbery',
  allowed: true,
  last: Date.now() - 12 * 60 * 1000,
  hour: 3,
  held: 0,
  waiting: 1,
  cap: 30,
  demo: true
};

function renderNotifications(root) {
  let data = null; // debug.json
  const { sections, section, update, field, run, pageStatus, mount, reload } = createPanel(root, 'trunk');

  // --- Notifications ---

  function buildKinds() {
    const k = data.kinds;
    const save = (key, value) =>
      run('kinds', 'Save notification settings', () => act({ 'push-kinds': { ...data.kinds, [key]: value } }));
    return [
      ...KINDS.map(({ key, label, options }) => {
        const id = `mn-trunk-kind-${key}`;
        const control = options
          ? el('select', { id, onchange: (e) => save(key, e.target.value) },
              options.map(([value, text]) => el('option', { value, selected: k[key] === value }, [text])))
          : el('input', { id, type: 'checkbox', checked: !!k[key], onchange: (e) => save(key, e.target.checked) });
        return field(label, null, [control], id);
      }),
      // the apps table follows the "Alerts from other apps" switch it depends
      // on; while that is off, this note says so and the table is greyed out
      !k.notices && el('p', { className: 'mn-note mn-hint' }, [
        'Alerts from apps are switched off, these apps will not send notifications.'
      ]),
      el('div', { className: k.notices ? 'mn-apps' : 'mn-apps mn-apps--off' }, buildSenders())
    ];
  }

  // --- Apps under Notifications (apps that send alerts) ---

  function buildSenders() {
    const senders = [...(data.senders || []), ...(SHOW_DEMO_APP ? [DEMO_APP] : [])]
      .sort((a, b) => (b.last || 0) - (a.last || 0));
    if (!senders.length) return [el('p', { className: 'mn-empty' }, ['No app has sent an alert yet.'])];
    const rows = senders.map((x) => {
      const allow = el('input', { type: 'checkbox', checked: !!x.allowed, title: 'Let its alerts through' });
      const caps = CAPS.includes(x.cap) ? CAPS : [...CAPS, x.cap];
      const cap = el('select', { title: 'Most alerts an hour' },
        caps.map((n) => el('option', { value: String(n), selected: n === x.cap }, [n ? `${n} an hour` : 'No hourly limit'])));
      const save = () => {
        if (x.demo) {
          // DEMO: keep the change in the page only
          DEMO_APP.allowed = allow.checked;
          DEMO_APP.cap = Number(cap.value);
          sections.kinds.status.set(`Demo app “${x.name}” changed in this page only; nothing was sent to trunk.`);
          return reload();
        }
        run('kinds', `Save ${x.name}`, () => act({ 'push-app': { id: x.id, allow: allow.checked, cap: Number(cap.value) } }));
      };
      allow.addEventListener('change', save);
      cap.addEventListener('change', save);
      const activity = [
        x.last ? `last ${ago(x.last)}` : 'none sent yet',
        x.cap ? `${x.hour} of ${x.cap} this hour` : `${x.hour} this hour`,
        x.waiting && `${x.waiting} waiting`,
        x.held && `${x.held} stopped`
      ].filter(Boolean).join(' · ');
      return el('tr', {}, [
        el('td', { className: 'mn-truncate', title: x.name }, [
          x.name,
          x.demo && el('span', { className: 'mn-tag', title: 'An example app, not on this ship' }, ['demo']),
          x.agent !== x.name && el('span', { className: 'mn-field__hint' }, [`through ${x.agent}`])
        ]),
        el('td', {}, [activity]),
        el('td', {}, [cap]),
        el('td', {}, [allow])
      ]);
    });
    return [
      el('table', { className: 'mn-table mn-table--center' }, [
        el('thead', {}, [el('tr', {}, ['App', 'Activity', 'Limit', 'On'].map((h) => el('th', {}, [h])))]),
        el('tbody', {}, rows)
      ])
    ];
  }

  // --- Devices ---

  function buildDevices() {
    const out = [];
    if (!data.devices.length) {
      out.push(el('p', { className: 'mn-empty' }, ['No devices yet.']));
    } else {
      const rows = data.devices.map((d) => {
        const kind = d.platform === 'ios-gateway' ? 'iPhone' : 'Android';
        const okay = d.last && d.last.code >= 200 && d.last.code < 300;
        const result = d.last && el('span', { className: okay ? 'mn-ok' : 'mn-error' }, [
          okay ? 'delivered' : d.last.code === 0 ? 'no answer' : `answered ${d.last.code}`
        ]);
        return el('tr', {}, [
          el('td', { className: 'mn-truncate', title: d.id }, [
            d.id,
            el('span', { className: 'mn-field__hint' }, [
              `${kind} via ${d.host}${d.caps.length ? ` · understands ${d.caps.join(', ')}` : ''}`
            ])
          ]),
          el('td', {}, [
            d.sent ? `${d.sent.kind}, ${ago(d.sent.at)}` : 'none yet',
            result && ' · ',
            result
          ]),
          el('td', { className: 'mn-actions' }, [
            el('button', {
              type: 'button',
              onclick: () =>
                run('devices', `Test ${d.id}`, async () => {
                  await act({ 'push-test': { id: d.id, nonce: Math.random().toString(36).slice(2) } });
                  // the result shows up in the device's "last push" a moment later
                  setTimeout(reload, 2500);
                })
            }, ['Test']),
            el('button', {
              type: 'button',
              className: 'mn-button--danger',
              onclick: () => {
                if (!confirm(`Stop sending notifications to ${d.id}? The app can register it again.`)) return;
                run('devices', `Remove ${d.id}`, () => act({ 'push-unregister': d.id }));
              }
            }, ['Remove'])
          ])
        ]);
      });
      out.push(el('table', { className: 'mn-table' }, [
        el('thead', {}, [el('tr', {}, ['Device', 'Last push', ''].map((h) => el('th', {}, [h])))]),
        el('tbody', {}, rows)
      ]));
    }
    if (data.drops.length) {
      out.push(el('div', { className: 'mn-note mn-hint' }, [
        'Removed lately because their push server said they were gone: ',
        data.drops.map((x) => `${x.id} (${x.platform === 'ios-gateway' ? 'iPhone' : 'Android'}, ${x.reason}, ${ago(x.at)})`).join('; ')
      ]));
    }
    return out;
  }

  // --- Status and recent activity ---

  function buildStatus() {
    const noDevices = !data.devices.length;
    const live = (path) => data.watches[path] === 'live' || noDevices;
    const rows = [
      ['Tlon activity', data.apps.activity ? 'running' : 'not running', !!data.apps.activity],
      ['Messages (/v4)', data.watches['/v4'] ?? '—', live('/v4')],
      ['Reads (/v4/reads)', data.watches['/v4/reads'] ?? '—', live('/v4/reads')],
      ['Talon settings', data.apps.settings ? 'found' : 'not found'],
      ['Badge count', data.badge === null ? 'not known yet' : String(data.badge)],
      ['Wire', String(data.wire)]
    ];
    return [
      ...rows.map(([label, value, good]) =>
        field(label, null, [
          el('span', { className: good === undefined ? 'mn-value' : good ? 'mn-value mn-ok' : 'mn-value mn-error' }, [value])
        ])),
      el('div', { className: 'mn-field mn-field--stacked' }, [
        el('div', { className: 'mn-field__label' }, ['Recent activity']),
        data.log.length
          // more than 10 entries: the log scrolls inside the card, 10 lines tall
          ? el('ol', { className: data.log.length > 10 ? 'mn-log mn-log--scroll' : 'mn-log' }, data.log.map((n) =>
              el('li', {}, [
                el('time', { title: new Date(n.at).toLocaleString() }, [ago(n.at)]),
                el('span', {}, [n.what])
              ])))
          : el('p', { className: 'mn-hint' }, ['Nothing yet.'])
      ])
    ];
  }

  // --- Load / poll ---

  async function load(force) {
    try {
      data = await scry('trunk', '/debug');
    } catch (err) {
      pageStatus.set(loadError(err), { error: true });
      return;
    }
    pageStatus.set('');
    // times are shown relative, so key on how they read now
    update('kinds', [data.kinds, data.senders, (data.senders || []).map((x) => x.last && ago(x.last)),
      SHOW_DEMO_APP && [DEMO_APP.allowed, DEMO_APP.cap, ago(DEMO_APP.last)]], buildKinds, force);
    update('devices', [data.devices, data.drops, data.devices.map((d) => d.sent && ago(d.sent.at))], buildDevices, force);
    update('status', [data.apps, data.watches, data.badge, data.wire, data.log, data.log.map((n) => ago(n.at))], buildStatus, force);
  }

  mount([
    section('kinds', 'Notifications', [
      'Your ship can send notifications to the devices. Tlon decides which messages are worth a notification; these settings only narrow that down.',
      'Apps using notifications listed below, you can change notifications limit or turn them off. A new app is let through until you switch it off.'
    ]),
    section('devices', 'Devices', [
      'Phones and computers that receive your notifications. A device appears here when you turn on notifications in its app.',
      'Removing device stops notifications to it. App can register it again.'
    ]),
    section('status', 'Status', [
      'What trunk needs in order to send notifications, for working out why they are not arriving.',
      'Messages and Reads are trunk’s feeds from Tlon’s activity app. They only need to be live while a device is registered. Recent activity lists trunk’s latest decisions and failures, newest first.'
    ])
  ], load);
}

// --- Calls tab ---

// DEMO: one made-up app under Calls → Apps, to preview the list on
// a ship where no app has asked to host calls yet. Its switch changes only
// this page and is never sent to trunk. Set SHOW_DEMO_HOST to false once
// real apps show up, or delete this block and every line that mentions
// DEMO_HOST.
const SHOW_DEMO_HOST = true;
const DEMO_HOST = {
  // the same fields /~/scry/trunk/guests.json gives for a real app
  agent: 'grubbery/calendar',
  allowed: true,
  rooms: ['standup-0v3a2', 'e-3fa9'],
  demo: true
};

function renderCalls(root) {
  let policy = null; // policy.json
  const { sections, section, update, field, run, pageStatus, mount } = createPanel(root, 'trunk');

  // --- Calls: who may ring us ---

  function shipList(label, hint, ships, addAction, removeAction, removeLabel) {
    const input = el('input', {
      type: 'text',
      placeholder: '~sampel-palnet',
      autocomplete: 'off',
      spellcheck: false,
      'aria-label': `${label}: add a ship`,
      // typing again clears the error mark from a refused name
      oninput: () => input.removeAttribute('aria-invalid')
    });
    attachShipFormatter(input);
    // Parse the name before sending: a bad one never reaches trunk, and the
    // reason shows under this card with the field marked and focused.
    const refuse = (message) => {
      input.setAttribute('aria-invalid', 'true');
      sections.calls.status.set(message, { error: true });
      input.focus();
    };
    const add = (e) => {
      e.preventDefault();
      const { ship, error } = parseShip(input.value);
      if (error) return refuse(error);
      if (ships.includes(ship)) return refuse(`${ship} is already ${label.toLowerCase()}.`);
      run('calls', `${label}: add ${ship}`, () => act({ [addAction]: ship }));
    };
    return el('div', { className: 'mn-field mn-field--stacked' }, [
      el('div', { className: 'mn-field__label' }, [
        label,
        el('span', { className: 'mn-field__hint' }, [hint])
      ]),
      el('div', { className: 'mn-chips' },
        ships.length
          ? ships.map((ship) =>
              el('span', { className: 'mn-chip' }, [
                el('span', { className: 'mn-chip__name', title: ship }, [ship]),
                el('button', {
                  type: 'button',
                  title: `${removeLabel} ${ship}`,
                  'aria-label': `${removeLabel} ${ship}`,
                  onclick: () => run('calls', `${removeLabel} ${ship}`, () => act({ [removeAction]: ship }))
                }, ['×'])
              ]))
          : [el('span', { className: 'mn-hint' }, ['None'])]),
      el('form', { className: 'mn-row', onsubmit: add }, [input, el('button', { type: 'submit' }, ['Add'])])
    ]);
  }

  function buildCalls() {
    const sorted = (s) => s.slice().sort();
    const mode = el('select', {
      id: 'mn-trunk-call-mode',
      onchange: (e) => run('calls', 'Save who can call', () => act({ 'set-call-mode': e.target.value }))
    }, [
      el('option', { value: 'open', selected: policy.mode === 'open' }, ['Anyone']),
      el('option', { value: 'allow', selected: policy.mode === 'allow' }, ['Only allowed ships'])
    ]);
    return [
      field('Who can call you', 'Set for every device and app.', [mode], 'mn-trunk-call-mode'),
      // the Allowed list only matters with "Only allowed ships", so it shows
      // only then; trunk keeps its ships while it is hidden
      policy.mode === 'allow' && shipList('Allowed', 'Only these ships can ring you.',
        sorted(policy.allow), 'allow', 'unallow', 'Remove'),
      shipList('Blocked', 'Can’t call you or join your party lines. Chats aren’t affected.',
        sorted(policy.block), 'block', 'unblock', 'Unblock'),
      // apps that host calls, from guests.json, under their own heading as
      // Notifications has its Apps
      el('h4', { className: 'mn-subhead' }, ['Apps']),
      ...(guestsError
        ? [el('p', { className: 'mn-empty mn-error' }, [guestsError])]
        : guests ? buildHosts() : [el('p', { className: 'mn-empty' }, ['Loading…'])])
    ];
  }

  // --- Guests: links that seat people with no ship on a line we host ---

  let guests = null; // guests.json: { origin, invites, links, apps }
  let guestsError = null; // why guests.json could not be loaded, if it could not
  let rooms = []; // rooms.json: the lines we host
  let chosenRoom; // the line picked in the form, kept across reloads; '' = new line
  let groupsAsked = false;

  // the link form is built once, so a poll never wipes what is being typed
  const roomSelect = el('select', {
    id: 'mn-trunk-g-room',
    onchange: () => {
      chosenRoom = roomSelect.value;
      syncGuestForm();
    }
  });
  const titleInput = el('input', { type: 'text', id: 'mn-trunk-g-title', maxLength: 80, placeholder: 'Groundwire standup', oninput: () => titleInput.removeAttribute('aria-invalid') });
  const groupSelect = el('select', { id: 'mn-trunk-g-group' }, [el('option', { value: '' }, ['Nobody'])]);
  const speakBox = el('input', { type: 'checkbox', id: 'mn-trunk-g-speak', checked: true });
  const codeInput = el('input', {
    type: 'text',
    id: 'mn-trunk-g-code',
    maxLength: 55,
    placeholder: 'groundwire-standup',
    autocomplete: 'off',
    spellcheck: false,
    oninput: () => {
      codeInput.removeAttribute('aria-invalid');
      syncGuestForm();
    }
  });
  const tailBox = el('input', { type: 'checkbox', id: 'mn-trunk-g-tail', checked: true });
  const usesSelect = el('select', { id: 'mn-trunk-g-uses' },
    [1, 5, 10, 50].map((n) => el('option', { value: String(n), selected: n === 10 }, [String(n)])));
  const ttlSelect = el('select', { id: 'mn-trunk-g-ttl' },
    [[3600, '1 hour'], [86400, '1 day'], [604800, '1 week'], [2592000, '30 days']]
      .map(([v, t]) => el('option', { value: String(v), selected: v === 86400 }, [t])));
  const makeButton = el('button', { type: 'submit' }, ['Make an invite link']);

  const titleRow = field('Title', 'What everyone sees, such as Groundwire standup.', [titleInput], titleInput.id);
  const groupRow = field('Members from Talon', 'People in this Tlon group join from Talon as themselves. Everyone else uses the link.', [groupSelect], groupSelect.id);
  const tailRow = field('Add a hard-to-guess ending', 'Such as groundwire-standup-k3f9x2qa. Anyone who knows or guesses a link can join, so leave this on unless the link is for anyone.', [tailBox], tailBox.id);
  const usesRow = field('People', 'How many guests the invite seats.', [usesSelect], usesSelect.id);
  const ttlRow = field('Lasts', null, [ttlSelect], ttlSelect.id);
  // the form's rows sit in a fieldset, so one `disabled` turns them all off
  const guestFields = el('fieldset', { className: 'mn-fieldset' }, [
    field('Party line', 'The line guests join. A line on its own call server cannot seat guests.', [roomSelect], roomSelect.id),
    titleRow,
    groupRow,
    field('Guests may speak', 'Off, they can only watch and listen.', [speakBox], speakBox.id),
    field('Permanent link name', 'Leave empty for an invite that expires. A name such as groundwire-standup makes a permanent link with no seat limit: lower case letters, digits and hyphens, starting with a letter.', [codeInput], codeInput.id),
    tailRow,
    usesRow,
    ttlRow,
    el('div', { className: 'mn-card__body mn-row mn-row--end' }, [makeButton])
  ]);
  const guestForm = el('form', { onsubmit: makeLink }, [guestFields]);
  const guestList = el('div');
  // "New link" opens and closes; it starts closed when there are guest links
  // in the list above and open when there are none, and keeps the owner's
  // choice once they open or close it
  let newLinkTouched = false;
  const newLinkPart = el('details', { className: 'mn-disclosure' }, [
    el('summary', { className: 'mn-subhead', onclick: () => { newLinkTouched = true; } }, ['New link']),
    guestForm
  ]);
  const guestPart = el('div', {}, [guestList, newLinkPart]);

  // Guests open links at the ship's public address, so a party line cannot
  // be started until it is set. The notice says so and leads to the field.
  const originNotice = el('div', { className: 'mn-notice', hidden: true });
  function renderOriginNotice() {
    originNotice.replaceChildren(
      el('p', {}, [el('strong', {}, ['Set this ship’s public address to start a party line.'])]),
      el('div', { className: 'mn-row' }, [
        el('button', { type: 'button', onclick: goToOrigin }, ['Set public address']),
        // a page opened at a public https address can name it in one click
        publicHere && el('button', {
          type: 'button',
          onclick: () => run('guests', `Set public address to ${location.origin}`, () => act({ 'set-origin': location.origin }))
        }, [`Use ${location.origin}`])
      ])
    );
  }

  // open the Public address card and put the cursor in its field
  function goToOrigin() {
    sections.origin.fold.set(false);
    const input = sections.origin.card.querySelector('#mn-trunk-origin');
    sections.origin.card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    input?.focus({ preventScroll: true });
  }
  let guestListSeen = null;
  let roomsSeen = null;

  // a page opened at a public https address can name it as the ship's own
  const publicHere = location.protocol === 'https:' && !/^(localhost|127\.|\[::1\])/.test(location.hostname);
  const linkBase = () => guests.origin || location.origin;

  function until(secs) {
    const s = secs - Date.now() / 1000;
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
    if (s < 86400) return `${Math.round(s / 3600)} h`;
    const d = Math.round(s / 86400);
    return `${d} ${d === 1 ? 'day' : 'days'}`;
  }

  // a line's name from its title: lower case and hyphens, not one we host
  function roomName(title) {
    const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'line';
    let name = base;
    for (let i = 2; rooms.some((r) => r.name === name); i++) name = `${base}-${i}`;
    return name;
  }

  // eight random characters: about 41 bits, too many to guess
  function randomTail() {
    const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => abc[b % 36]).join('');
  }

  // show only the rows that apply: a new line needs a title, a named link
  // has no seats or end
  function syncGuestForm() {
    const fresh = roomSelect.value === '';
    const named = codeInput.value.trim() !== '';
    titleRow.hidden = !fresh;
    groupRow.hidden = !fresh || groupSelect.options.length < 2;
    tailRow.hidden = !named;
    usesRow.hidden = named;
    ttlRow.hidden = named;
    makeButton.textContent = named ? 'Make a permanent link' : 'Make an invite link';
    // %groups answers with every group in full, so ask only when needed
    if (fresh && !groupsAsked) {
      groupsAsked = true;
      loadGroups();
    }
  }

  async function loadGroups() {
    try {
      const groups = await scry('groups', '/v2/groups');
      for (const [flag, g] of Object.entries(groups || {}).sort(([a], [b]) => a.localeCompare(b))) {
        groupSelect.append(el('option', { value: flag }, [g?.meta?.title || flag]));
      }
    } catch {
      // no %groups: the line just has no members from Talon
    }
    syncGuestForm();
  }

  function renderRoomOptions() {
    const lines = rooms.filter((r) => !r['custom-sfu']);
    roomSelect.replaceChildren(
      ...lines.map((r) => el('option', { value: r.name }, [r.title || r.name])),
      el('option', { value: '' }, ['New line…'])
    );
    const keep = chosenRoom === '' || lines.some((r) => r.name === chosenRoom);
    roomSelect.value = keep && chosenRoom !== undefined ? chosenRoom : (lines[0]?.name ?? '');
    syncGuestForm();
  }

  async function makeLink(e) {
    e.preventDefault();
    const status = sections.guests.status;
    if (!guests.origin) {
      status.set('Set this ship’s public address first: guests open party line links there.', { error: true });
      return;
    }
    const refuse = (input, message) => {
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      status.set(message, { error: true });
    };
    let code = codeInput.value.trim().toLowerCase().replace(/\s+/g, '-');
    if (code && !/^[a-z][a-z0-9-]{2,63}$/.test(code)) {
      return refuse(codeInput, 'A link name is 3 to 64 lower case letters, digits and hyphens, starting with a letter.');
    }
    let name = roomSelect.value;
    const title = titleInput.value.trim();
    if (!name && !title) return refuse(titleInput, 'Give the new line a title.');
    if (code && tailBox.checked) code += `-${randomTail()}`;
    if (code && guests.links.some((l) => l.code === code) &&
        !confirm(`The link ${code} already exists. Move it to this line?`)) return;

    makeButton.disabled = true;
    await run('guests', code ? `Make permanent link ${code}` : 'Make an invite link', async () => {
      if (!name) {
        name = roomName(title);
        await act({ 'open-room': { name, title, members: [], admins: [] } });
        // the line is open now, so a retry must not open another one
        chosenRoom = name;
        titleInput.value = '';
        const flag = groupSelect.value;
        if (flag) {
          const cut = flag.indexOf('/');
          try {
            await act({ 'bind-room': { name, group: { ship: flag.slice(0, cut), name: flag.slice(cut + 1) } } });
          } catch (err) {
            throw new Error(`the line “${title}” is open, but not tied to the group (${err.message})`);
          }
        }
      }
      await act(code
        ? { 'guest-link': { code, name, speak: speakBox.checked } }
        : { 'invite-guests': { name, speak: speakBox.checked, ttl: Number(ttlSelect.value), uses: Number(usesSelect.value) } });
      codeInput.value = '';
      return code ? `Permanent link ${code} made. Copy it from the list above.` : 'Invite link made. Copy it from the list above.';
    });
    makeButton.disabled = false;
    syncGuestForm();
  }

  function buildGuestRows() {
    const titles = Object.fromEntries(rooms.map((r) => [r.name, r.title || r.name]));
    const speakText = (speak) => (speak ? 'may speak' : 'watch and listen only');
    // without a public address a link has nowhere guests can open it, so
    // Copy and Share wait for one; Revoke always works
    const noOrigin = !guests.origin;
    const needsOrigin = noOrigin ? 'Set this ship’s public address first' : undefined;
    const row = (item, seats, expires) => {
      const url = linkBase() + item.path;
      const copy = el('button', {
        type: 'button',
        disabled: noOrigin,
        title: needsOrigin,
        onclick: async () => {
          await copyText(url);
          copy.textContent = 'Copied';
          setTimeout(() => { copy.textContent = 'Copy'; }, 2500);
        }
      }, ['Copy']);
      return el('tr', {}, [
        el('td', { className: 'mn-truncate', title: titles[item.name] || item.name }, [
          titles[item.name] || item.name,
          el('span', { className: 'mn-field__hint' }, [speakText(item.speak)])
        ]),
        el('td', { className: 'mn-truncate' }, [el('a', { href: url, target: '_blank', rel: 'noopener', title: url }, [url])]),
        el('td', { className: 'mn-num' }, [seats]),
        el('td', { className: 'mn-num' }, expires),
        el('td', { className: 'mn-actions' }, [
          copy,
          navigator.share && el('button', {
            type: 'button',
            disabled: noOrigin,
            title: needsOrigin,
            onclick: () => navigator.share({ title: titles[item.name], text: `Join ${titles[item.name]}`, url }).catch(() => {})
          }, ['Share']),
          el('button', {
            type: 'button',
            className: 'mn-button--danger',
            // asked in a native dialog over the page, so the row doesn't move
            onclick: async () => {
              const line = titles[item.name] || item.name;
              if (!await confirmDialog(`Revoke this link to ${line}?`, 'Nobody new can join with it, and its guests can’t rejoin. Anyone on the call now stays until they leave.', 'Revoke')) return;
              run('guests', `Revoke ${item.code}`, () => act({ 'revoke-invite': item.code }));
            }
          }, ['Revoke'])
        ])
      ]);
    };
    const rows = [
      ...guests.links.slice().sort((a, b) => a.code.localeCompare(b.code))
        .map((l) => row(l, 'No limit', ['Never'])),
      ...guests.invites.slice().sort((a, b) => b.expires - a.expires)
        // seats left of the invite's total (guests seated + seats left)
        .map((i) => row(i, `${i.uses}/${i.uses + i.guests}`, [until(i.expires)]))
    ];
    if (!rows.length) return [el('p', { className: 'mn-empty' }, ['No guest links yet.'])];
    return [el('table', { className: 'mn-table' }, [
      el('thead', {}, [el('tr', {}, ['Line', 'Link', 'Seats', 'Expires', ''].map((h) => el('th', {}, [h])))]),
      el('tbody', {}, rows)
    ])];
  }

  function updateGuests(force) {
    const s = sections.guests;
    if (!s.body.contains(guestForm)) {
      renderOriginNotice();
      s.body.replaceChildren(originNotice, guestPart);
    }
    // no public address: say so, and grey out and turn off the New link form.
    // Existing links stay as they are, with Copy, Share and Revoke.
    const noOrigin = !guests.origin;
    originNotice.hidden = !noOrigin;
    guestForm.classList.toggle('mn-off', noOrigin);
    if (!newLinkTouched) newLinkPart.open = !guests.links.length && !guests.invites.length;
    guestFields.disabled = noOrigin;
    // times are shown relative, so key on how they read now
    const key = JSON.stringify([guests.invites, guests.links, guests.origin, rooms.map((r) => [r.name, r.title]), guests.invites.map((i) => until(i.expires))]);
    if (key !== guestListSeen && (force || !guestList.contains(document.activeElement))) {
      guestListSeen = key;
      guestList.replaceChildren(...buildGuestRows());
    }
    const roomKey = JSON.stringify(rooms.map((r) => [r.name, r.title, r['custom-sfu']]));
    if (roomKey !== roomsSeen && document.activeElement !== roomSelect) {
      roomsSeen = roomKey;
      renderRoomOptions();
    }
  }

  // --- Apps that host calls: the Apps part of the Calls card ---

  function buildHosts() {
    const out = [];
    const apps = [...guests.apps, ...(SHOW_DEMO_HOST ? [DEMO_HOST] : [])]
      .sort((a, b) => a.agent.localeCompare(b.agent));
    if (!apps.length) out.push(el('p', { className: 'mn-empty' }, ['No app has asked to host calls.']));
    for (const a of apps) {
      // an app an agent names, such as grubbery's calendar, is agent/name
      const cut = a.agent.indexOf('/');
      const name = cut < 0 ? a.agent : `${a.agent.slice(cut + 1)} (through ${a.agent.slice(0, cut)})`;
      const n = a.rooms.length;
      const id = `mn-trunk-host-${a.agent}`;
      const box = el('input', {
        type: 'checkbox',
        id,
        checked: !!a.allowed,
        onchange: (e) => {
          const allow = e.target.checked;
          if (a.demo) {
            // DEMO: keep the change in the page only
            DEMO_HOST.allowed = allow;
            sections.calls.status.set(`Demo app “${name}” changed in this page only; nothing was sent to trunk.`);
            return;
          }
          run('calls', `${allow ? 'Let' : 'Stop'} ${name} host calls`, async () => {
            // an app's links need this ship's address: this page's, if public
            if (allow && !guests.origin && publicHere) await act({ 'set-origin': location.origin });
            await act({ 'app-hosting': { agent: a.agent, allow } });
          });
        }
      });
      const label = a.demo
        ? el('span', {}, [name, el('span', { className: 'mn-tag', title: 'An example app, not on this ship' }, ['demo'])])
        : name;
      out.push(field(label, n ? `${n} room${n === 1 ? '' : 's'} open` : 'no rooms open', [box], id));
    }

    return out;
  }

  // --- Public address: where guests reach this ship ---

  function buildOrigin() {
    const originInput = el('input', {
      type: 'text',
      inputMode: 'url',
      id: 'mn-trunk-origin',
      value: guests.origin || '',
      placeholder: 'https://example.groundwire.me',
      maxLength: 256,
      autocomplete: 'off',
      spellcheck: false,
      oninput: () => originInput.removeAttribute('aria-invalid')
    });
    const saveOrigin = (e) => {
      e.preventDefault();
      const value = originInput.value.trim().toLowerCase().replace(/\/+$/, '');
      if (value && !/^https?:\/\/[a-z0-9.:-]+$/.test(value)) {
        originInput.setAttribute('aria-invalid', 'true');
        originInput.focus();
        sections.origin.status.set('An address is https:// and a host, such as https://example.groundwire.me, with nothing after it.', { error: true });
        return;
      }
      run('origin', value ? `Set public address to ${value}` : 'Clear public address', () => act({ 'set-origin': value }));
    };
    return [el('form', { className: 'mn-field', onsubmit: saveOrigin }, [
      el('label', { className: 'mn-field__label', htmlFor: originInput.id }, [
        'This ship’s public address',
        el('span', { className: 'mn-field__hint' }, [
          /^http:/.test(guests.origin || '')
            ? 'This address is http. Guests need https, so use http only for testing.'
            : 'Such as https://example.groundwire.me, with nothing after the host.'
        ])
      ]),
      el('div', { className: 'mn-field__control' }, [originInput, el('button', { type: 'submit' }, ['Save'])])
    ])];
  }

  // --- Load / poll ---

  async function load(force) {
    try {
      policy = await scry('trunk', '/policy');
    } catch (err) {
      pageStatus.set(loadError(err), { error: true });
      return;
    }
    pageStatus.set('');
    // guests, apps and the public address come from their own scries; if
    // those fail (an older trunk), who-can-call still works
    try {
      [guests, rooms] = await Promise.all([scry('trunk', '/guests'), scry('trunk', '/rooms')]);
      guestsError = null;
    } catch (err) {
      guestsError = `Could not load guest links and apps — ${err.message}. This needs trunk wire 16 or later.`;
    }
    update('calls', [policy, guests && guests.apps, guests && guests.origin, SHOW_DEMO_HOST && DEMO_HOST.allowed, guestsError], buildCalls, force);
    if (guestsError) {
      for (const name of ['guests', 'origin']) {
        sections[name].body.replaceChildren(el('p', { className: 'mn-empty mn-error' }, [guestsError]));
        sections[name].seen = null;
      }
      return;
    }
    updateGuests(force);
    update('origin', [guests.origin], buildOrigin, force);
  }

  mount([
    section('calls', 'Calls', [
      'Who may ring this ship. The setting holds for every device and every app that uses trunk.',
      'A refused caller is not told: their call just rings out, the same as calling a ship that is offline.',
      'Apps that run their own call rooms for their users, such as a game’s party voice; these are the app’s rooms, not your party lines. Each one that has asked to use calls shows here. For creating your own party line in an app you will need address to be specified.'
    ]),
    section('guests', 'Party line', [
      'People with no ship can join a party line you host through a link, with audio, video and screen sharing. Pick a line, or start a new one here.',
      'An invite seats a set number of people that allowed to join. Give the link a name instead and it becomes permanent, with no seat limit, for a recurring meeting.',
      'You can revoke a link at any time; someone already on the call stays until they leave. Closing a line expires its links.'
    ]),
    section('origin', 'Public address', [
      'The address people reach this ship at from the internet, such as https://example.groundwire.me.',
      'Party line and apps links point guests here, you can’t start a party line, until it is set. It has to be https for guests, and the same http or https as the call server.'
    ])
  ], load);
}

// the two tabs, by their data-panel name in index.html
export const notifications = { render: renderNotifications };
export const calls = { render: renderCalls };
