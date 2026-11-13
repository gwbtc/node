// Armillary (a grubbery app): model inference run from this ship, on the
// owner's own provider keys or bought from a vendor ship.
//
//   read   GET /apps/armillary/api/settings    markup, public_url, own_free, … (secrets masked)
//          GET …/providers, …/catalog, …/suggested, …/brave
//          GET …/account   who this ship buys from, its balance, free
//          GET …/keys      the inference keys this ship holds (no secrets)
//          GET …/inference what apps such as Talon get: mode, base_url, key
//   write  PUT …/settings (whole), POST/DELETE …/providers[/<id>[/test|/import]],
//          PUT …/catalog (whole), PUT …/suggested, PUT …/brave,
//          PUT …/vendor, POST/DELETE …/keys[/<id>]
//
// Every route takes the ship's login cookie and answers JSON; errors are
// {error: {message}}. Payments, plans, other ships' accounts and reports
// stay on Armillary's own page (/apps/armillary).
//
// Layout: Status on top. A ship with no vendor and no providers sees one
// Set up card (pick a vendor; this ship's own name makes it its own
// provider). After that, two tabs: Vendor (where this ship's apps buy
// inference) and Provider (serving inference from this ship's own keys).
// The two are separate settings: a ship can buy from one ship and serve
// others.

import { scry, el, createPanel, confirmDialog, copyText, attachShipFormatter, parseShip } from '../lib.js';

// --- Armillary's API ---

const API = '/apps/armillary/api';
const PAGE = '/apps/armillary';

// Armillary is missing (no grubbery, or not installed) when its address
// answers no JSON at all
class Missing extends Error {}

async function http(method, path, body) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new Error('your ship did not answer');
  }
  const json = /json/.test(res.headers.get('content-type') || '') ? await res.json().catch(() => null) : null;
  if (!json && res.status === 404) throw new Missing('Armillary is not on this ship');
  if (res.status === 401 || res.status === 403) throw new Error('you are signed out');
  if (!res.ok) throw new Error(json?.error?.message || `http ${res.status}`);
  return { status: res.status, json };
}

// --- Formatting ---

// microdollars to dollars; a model's prices are per million tokens
const dollars = (n) => `$${(Number(n || 0) / 1e6).toFixed(2)}`;

// 'orrery_chat' -> 'Orrery chat'
const featureName = (f) => f.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const TIERS = [
  ['frontier', 'Frontier', 'The default model: what an app runs a feature on when nothing else is named.'],
  ['zdr', 'Zero data retention', 'For features that send what must not be kept, such as browsing.'],
  ['private', 'Private', 'For private work, often a model run on hardware you control.'],
  ['decision', 'Decision', 'Answers yes/no and multiple-choice questions with probabilities.'],
  ['transcription', 'Transcription', 'Speech to text, for dictation.']
];

// --- Panel ---

function render(root) {
  const { sections, section, update, field, run, pageStatus, mount } = createPanel(root, 'armillary');

  const api = http;
  let self = ''; // this ship, from GET /account
  let partyLine = ''; // trunk's public address, offered as a shortcut
  const data = { settings: null, providers: null, catalog: null, suggested: null, brave: null, account: null, keys: null, inference: null };
  let shownSecret = null; // { name, secret } of a key just made, shown once

  // PUT /settings replaces every setting at once: send back what is stored,
  // secrets blank (blank keeps the stored one), with this card's change
  function saveSettings(change) {
    const was = data.settings || {};
    const body = { ...was, stripe_key: '', stripe_webhook_secret: '', btcpay_key: '', btcpay_webhook_secret: '', ...change };
    return api('PUT', '/settings', body);
  }

  const enabledModels = () => (data.catalog || []).filter((r) => r.enabled);
  const usesSelf = () => !!self && data.account?.vendor === self;
  // switched on and still answering: a removed provider's rows stay in the
  // catalog, switched on, but stop answering
  const liveModels = () => enabledModels().filter((r) => data.providers.some((p) => p.id === r.provider));
  // the provider side is ready once a provider has a model switched on
  const providerReady = () => liveModels().length > 0;
  let skipSetup = false; // "Set up a provider first" on the Set up card
  // nothing chosen yet: no vendor, no providers
  const isNew = () => !skipSetup && !data.account?.vendor && !data.providers?.length;

  // Changing the vendor. This ship as its own vendor gets a key of its own:
  // a key from the old vendor does not work on this ship's own proxy.
  async function setVendor(ship) {
    const was = data.account?.vendor;
    await api('PUT', '/vendor', { ship });
    if (ship && ship === self && was !== self) {
      await api('POST', '/keys', { name: 'this ship' });
      return 'This ship is its own vendor, with a key of its own. Add a provider below to serve its apps.';
    }
    return ship ? `Buying from ${ship}.` : 'No vendor: this ship’s apps buy from nobody.';
  }

  // the vendor forms (Set up card, Vendor card); blank clears, except on Set up
  function vendorSubmit(where, input) {
    return async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      const setup = where === 'setup';
      if (!text && !setup) return run(where, 'Clear vendor', () => setVendor(''));
      const { ship, error } = parseShip(text);
      if (error) {
        input.focus();
        return sections[where].status.set(error, { error: true });
      }
      const label = ship === self ? 'Use this ship as its own vendor' : `Buy from ${ship}`;
      if (!setup) return run(where, label, () => setVendor(ship));
      // from Set up: open the tab that fits, and carry the result there
      const dest = ship === self ? 'provider' : 'vendor';
      pendingTab = dest;
      await run('setup', label, () => setVendor(ship));
      if (sections.setup.card.hidden) {
        const { status } = sections[dest === 'provider' ? 'own' : 'vendor'];
        status.set(sections.setup.status.node.textContent);
      }
    };
  }

  // --- Tabs: Vendor (buying) and Provider (serving) ---

  const TAB_KEY = 'my-node.armillary.tab';
  const readTab = () => { try { return localStorage.getItem(TAB_KEY); } catch { return null; } };
  const saveTab = (name) => { try { localStorage.setItem(TAB_KEY, name); } catch { /* not remembered */ } };
  const TABS = [
    ['vendor', 'Vendor', 'Where this ship’s apps buy inference'],
    ['provider', 'Provider', 'Serving inference from this ship’s own provider keys']
  ];
  const tabs = {};
  const tabPanels = {};
  let tab = null; // shown tab
  let pendingTab = null; // a tab to open on the next layout

  function showTab(name, remember) {
    tab = name;
    for (const [n, button] of Object.entries(tabs)) {
      const on = n === name;
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
      tabPanels[n].hidden = !on;
    }
    if (remember) saveTab(name);
  }

  const tabList = el('div', { className: 'mn-tabs__list', role: 'tablist', 'aria-label': 'Armillary' },
    TABS.map(([name, label, title]) => (tabs[name] = el('button', {
      type: 'button',
      role: 'tab',
      id: `mn-arm-tab-${name}`,
      className: 'mn-tabs__tab',
      title,
      'aria-controls': `mn-arm-panel-${name}`,
      onclick: () => showTab(name, true)
    }, [label]))));
  tabList.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = tab === 'vendor' ? 'provider' : 'vendor';
    showTab(next, true);
    tabs[next].focus();
  });
  const tabBar = el('div', { className: 'mn-tabs', hidden: true }, [
    tabList,
    el('a', { className: 'mn-tabs__link', href: PAGE, target: '_blank', rel: 'noopener' }, ['Go to Armillary ↗'])
  ]);
  const tabPanel = (name, cards) => (tabPanels[name] = el('div', {
    className: 'mn-tabs__panel',
    id: `mn-arm-panel-${name}`,
    role: 'tabpanel',
    'aria-labelledby': `mn-arm-tab-${name}`,
    hidden: true
  }, cards));

  // which cards show, from what is set up
  function layout() {
    if (!data.settings || !data.account) return;
    // every card back (unavailable() hid them all), then the rules below
    for (const sec of Object.values(sections)) sec.card.hidden = false;
    const fresh = isNew();
    sections.setup.card.hidden = !fresh;
    tabBar.hidden = fresh;
    if (fresh) {
      for (const p of Object.values(tabPanels)) p.hidden = true;
      return;
    }
    sections.vsuggested.card.hidden = !data.account.vendor || usesSelf();
    sections.own.card.hidden = providerReady();
    sections.free.card.hidden = !usesSelf();
    sections.brave.card.hidden = !data.brave;
    sections.suggested.card.hidden = !data.suggested || !providerReady();
    const remembered = readTab();
    const fallback = usesSelf() || (!data.account.vendor && data.providers.length) ? 'provider' : 'vendor';
    const name = pendingTab || tab || (remembered in tabs ? remembered : fallback);
    pendingTab = null;
    showTab(name, false);
  }

  // --- Set up ---

  function buildSetup() {
    const input = el('input', { type: 'text', id: 'mn-arm-setup-vendor', placeholder: '~nisfeb', autocomplete: 'off', spellcheck: false });
    attachShipFormatter(input);
    return [
      el('form', { className: 'mn-field', onsubmit: vendorSubmit('setup', input) }, [
        el('label', { className: 'mn-field__label', htmlFor: input.id }, [
          'Vendor',
          el('span', { className: 'mn-field__hint' }, [
            `The ship this one buys inference from. To be your own provider, enter this ship${self ? `, ${self}` : ''}.`
          ])
        ]),
        el('div', { className: 'mn-field__control' }, [input, el('button', { type: 'submit' }, ['Save'])])
      ]),
      el('div', { className: 'mn-card__body mn-row mn-row--end' }, [
        el('button', {
          type: 'button',
          onclick: () => { skipSetup = true; pendingTab = 'provider'; layout(); }
        }, ['Set up a provider first'])
      ])
    ];
  }

  // --- Status ---

  function buildStatus() {
    const inf = data.inference;
    const acct = data.account || {};
    const rows = [
      ['Apps call', inf ? `${inf.base_url}` : 'Nothing yet: this ship holds no key', !!inf],
      ['Mode', inf ? (inf.mode === 'lease' ? 'Lease: straight to the provider' : 'Proxy: through the vendor') : '—'],
      ['Vendor', acct.vendor ? (acct.vendor === self ? `${acct.vendor} (this ship)` : acct.vendor) : 'Not set', !!acct.vendor],
      ['Balance', acct.free ? 'Free: this ship’s own use is not charged' : acct.vendor ? dollars(acct.balance) : '—'],
      ['Models', inf ? `${(inf.models || []).length} offered` : `${enabledModels().length} switched on here`],
      ['Web search', inf?.search?.url !== undefined ? 'On' : data.brave?.key_set ? 'Key set' : 'Off']
    ];
    return [
      el('dl', { className: 'mn-facts mn-card__body' }, rows.flatMap(([k, v, good]) => [
        el('dt', {}, [k]),
        el('dd', { className: good === false ? 'mn-error' : '' }, [v])
      ])),
      el('p', { className: 'mn-note mn-hint' }, [
        'Check ',
        el('a', { href: PAGE, target: '_blank', rel: 'noopener' }, ['Armillary']),
        ' to see payments, plans and other ships’ accounts and reports.'
      ])
    ];
  }

  // --- Run your own inference ---

  function step(done, label, hint, control) {
    return field(label, hint, [done ? el('span', { className: 'mn-ok' }, ['Done']) : control || el('span', { className: 'mn-hint' }, ['To do'])]);
  }

  // shown until a provider has a model switched on
  function buildOwn() {
    const providers = data.providers.length;
    const models = liveModels().length;
    return [
      el('p', { className: 'mn-note mn-hint' }, [
        usesSelf()
          ? 'Talon and Orrery on this ship will run on your own provider keys.'
          : `This ship’s own apps use it once ${self || 'this ship'} is the vendor, under Vendor.`
      ]),
      step(providers > 0, '1. Add a provider', providers ? `${providers} connected` : 'Under Providers below.'),
      step(models > 0, '2. Switch on models', models ? `${models} switched on` : 'Under Models below.')
    ];
  }

  // --- Own use (this ship as its own vendor) ---

  function buildFree() {
    const free = el('input', {
      type: 'checkbox',
      id: 'mn-arm-own-free',
      checked: !!data.settings.own_free,
      onchange: (e) => run('free', e.target.checked ? 'Make own use free' : 'Charge own use', () => saveSettings({ own_free: e.target.checked }))
    });
    return [field('Own providers/models use is free', null, [free], free.id)];
  }

  // --- Providers ---

  function buildProviders() {
    const rows = data.providers.map((p) => {
      const count = data.catalog.filter((r) => r.provider === p.id).length;
      return el('div', { className: 'mn-field' }, [
        el('div', { className: 'mn-field__label' }, [
          p.name,
          el('span', { className: 'mn-field__hint mn-truncate', title: p.base_url }, [`${p.kind} · ${p.base_url}`]),
          el('span', { className: 'mn-field__hint' }, [`key ${p.api_key || 'not set'} · ${count} model${count === 1 ? '' : 's'}`])
        ]),
        el('div', { className: 'mn-field__control' }, [
          el('button', {
            type: 'button',
            onclick: () => run('providers', `Test ${p.name}`, async () => {
              const { json } = await api('POST', `/providers/${encodeURIComponent(p.id)}/test`, {});
              return `${p.name} answered ${json.status} from ${json.model}: “${json.text}”`;
            })
          }, ['Test']),
          el('button', {
            type: 'button',
            onclick: () => run('providers', `Import models from ${p.name}`, async () => {
              const { json } = await api('POST', `/providers/${encodeURIComponent(p.id)}/import`, {});
              return json.added
                ? `${json.added} new model${json.added === 1 ? '' : 's'} from ${p.name}, all switched off. Switch on the ones to use under Models.`
                : `No new models from ${p.name}.`;
            })
          }, ['Import models']),
          el('button', {
            type: 'button',
            className: 'mn-button--danger',
            onclick: async () => {
              if (!await confirmDialog(`Remove ${p.name}?`, 'Its models stay in the list but stop answering. Its key is forgotten.', 'Remove')) return;
              run('providers', `Remove ${p.name}`, () => api('DELETE', `/providers/${encodeURIComponent(p.id)}`));
            }
          }, ['Remove'])
        ])
      ]);
    });
    return [...(rows.length ? rows : [el('p', { className: 'mn-empty' }, ['No providers yet.'])]), addProviderForm];
  }

  const kindSelect = el('select', { id: 'mn-arm-kind' }, [
    el('option', { value: 'openrouter' }, ['OpenRouter']),
    el('option', { value: 'openai-compatible' }, ['OpenAI-compatible'])
  ]);
  const provId = el('input', { type: 'text', id: 'mn-arm-pid', placeholder: 'openrouter', maxLength: 64, autocomplete: 'off', spellcheck: false });
  const provUrl = el('input', { type: 'url', id: 'mn-arm-purl', placeholder: 'https://openrouter.ai/api/v1', maxLength: 500, autocomplete: 'off', spellcheck: false });
  const provKey = el('input', { type: 'password', id: 'mn-arm-pkey', placeholder: 'sk-…', autocomplete: 'off' });
  kindSelect.addEventListener('change', () => {
    provUrl.placeholder = kindSelect.value === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'http://127.0.0.1:8000/v1';
  });
  const addProviderForm = el('form', {
    className: 'mn-fieldset',
    onsubmit: (e) => {
      e.preventDefault();
      const id = provId.value.trim();
      const url = provUrl.value.trim();
      const status = sections.providers.status;
      if (!id) { provId.focus(); return status.set('Give the provider a short name, such as openrouter.', { error: true }); }
      if (!/^https?:\/\/\S+$/.test(url)) { provUrl.focus(); return status.set('The address is the provider’s API base, such as https://openrouter.ai/api/v1.', { error: true }); }
      run('providers', `Add ${id}`, async () => {
        await api('POST', '/providers', { id, name: id, kind: kindSelect.value, base_url: url, api_key: provKey.value.trim() });
        provId.value = provUrl.value = provKey.value = '';
        return `Added ${id}. Import its models next.`;
      });
    }
  }, [
    el('h4', { className: 'mn-subhead' }, ['Add a provider']),
    field('Kind', 'OpenRouter, or any server that speaks OpenAI’s API (vLLM, llama.cpp, Ollama…).', [kindSelect], kindSelect.id),
    field('Name', 'A short id, such as openrouter or home-gpu.', [provId], provId.id),
    field('API address', 'Its base URL, ending in /v1.', [provUrl], provUrl.id),
    field('API key', 'Stays on this ship; it is never shown again.', [provKey, el('button', { type: 'submit' }, ['Add'])], provKey.id)
  ]);

  // --- Models ---

  const modelFilter = el('input', { type: 'search', placeholder: 'Filter', 'aria-label': 'Filter models', autocomplete: 'off', spellcheck: false });
  modelFilter.addEventListener('input', () => showModels(true));

  function buildModels() {
    const all = data.catalog;
    if (!all.length) return [el('p', { className: 'mn-empty' }, ['No models yet. Import them from a provider.'])];
    const q = modelFilter.value.trim().toLowerCase();
    const shown = all.filter((r) => !q || `${r.id} ${r.provider} ${r.tags.join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => b.enabled - a.enabled || a.id.localeCompare(b.id));
    const rows = shown.map((r) => el('tr', {}, [
      el('td', {}, [el('input', {
        type: 'checkbox',
        checked: r.enabled,
        'aria-label': `Use ${r.id}`,
        onchange: (e) => run('models', `${e.target.checked ? 'Switch on' : 'Switch off'} ${r.id}`, () =>
          api('PUT', '/catalog', data.catalog.map((x) => (x.id === r.id ? { ...x, enabled: e.target.checked } : x))))
      })]),
      el('td', { className: 'mn-truncate', title: r.id }, [
        r.id,
        el('span', { className: 'mn-field__hint' }, [[r.provider, ...r.tags].join(' · ')])
      ]),
      el('td', { className: 'mn-num' }, [dollars(r.in)]),
      el('td', { className: 'mn-num' }, [dollars(r.out)])
    ]));
    const table = el('table', { className: 'mn-table' }, [
      el('thead', {}, [el('tr', {}, ['On', 'Model', 'In', 'Out'].map((h) => el('th', {}, [h])))]),
      el('tbody', {}, rows)
    ]);
    const on = all.filter((r) => r.enabled).length;
    return [
      el('p', { className: 'mn-hint mn-list-count' }, [`${on} of ${all.length} switched on${q ? ` · ${shown.length} match` : ''} · prices per million tokens`]),
      shown.length ? (shown.length > 10 ? el('div', { className: 'mn-scroll' }, [table]) : table)
        : el('p', { className: 'mn-empty' }, [`No models match “${modelFilter.value.trim()}”.`])
    ];
  }

  function showModels(force) {
    if (data.catalog) update('models', [data.catalog, modelFilter.value.trim()], buildModels, force);
  }

  // --- Public address ---

  function buildAddress() {
    const input = el('input', {
      type: 'url',
      id: 'mn-arm-url',
      value: data.settings.public_url || '',
      placeholder: 'https://example.groundwire.me',
      maxLength: 500,
      autocomplete: 'off',
      spellcheck: false
    });
    const save = (value) => {
      value = value.trim().replace(/\/+$/, '');
      if (value && !/^https?:\/\/[^\s/]+$/.test(value)) {
        input.focus();
        return sections.address.status.set('An address is http(s):// and a host, with nothing after it.', { error: true });
      }
      run('address', value ? `Set public address to ${value}` : 'Clear public address', () => saveSettings({ public_url: value }));
    };
    const fill = (value) => () => { input.value = value; save(value); };
    return [
      el('form', { className: 'mn-field', onsubmit: (e) => { e.preventDefault(); save(input.value); } }, [
        el('label', { className: 'mn-field__label', htmlFor: input.id }, [
          'Address apps call',
          el('span', { className: 'mn-field__hint' }, [
            data.settings.public_url ? 'Apps call this address plus /apps/armillary/v1.' : 'Blank, apps are told http://localhost:8080, which a phone can’t reach.'
          ])
        ]),
        el('div', { className: 'mn-field__control' }, [input, el('button', { type: 'submit' }, ['Save'])])
      ]),
      el('div', { className: 'mn-card__body mn-row' }, [
        el('button', { type: 'button', onclick: fill(location.origin) }, ['Use this page’s address']),
        partyLine && partyLine !== data.settings.public_url && el('button', { type: 'button', onclick: fill(partyLine) }, ['Same as Party line'])
      ])
    ];
  }

  // --- Suggested models ---

  function buildSuggested() {
    const sug = data.suggested;
    const models = enabledModels();
    const selects = {};
    const rows = TIERS.map(([tier, label, hint]) => {
      const current = sug.tiers[tier] || '';
      const choices = tier === 'transcription'
        ? models.filter((r) => r.tags.includes('transcription'))
        : models.filter((r) => !r.tags.includes('transcription'));
      const select = el('select', { id: `mn-arm-tier-${tier}` }, [
        el('option', { value: '' }, ['None']),
        ...choices.map((r) => el('option', { value: r.id, selected: r.id === current }, [r.id])),
        // a tier may name a model that is switched off now; keep it visible
        current && !choices.some((r) => r.id === current) && el('option', { value: current, selected: true }, [`${current} (off)`])
      ]);
      selects[tier] = select;
      return field(label, hint, [select], select.id);
    });
    return [
      el('form', {
        onsubmit: (e) => {
          e.preventDefault();
          const tiers = Object.fromEntries(Object.entries(selects).map(([t, s]) => [t, s.value]));
          run('suggested', 'Save suggested models', () => api('PUT', '/suggested', { tiers, features: sug.features }));
        }
      }, [
        el('p', { className: 'mn-note mn-hint' }, [
          models.length ? 'Which model apps use for each kind of work. Only switched-on models can be picked.' : 'Switch on some models first.'
        ]),
        ...rows,
        el('div', { className: 'mn-card__body mn-row mn-row--end' }, [el('button', { type: 'submit' }, ['Save'])])
      ])
    ];
  }

  // --- Web search ---

  function buildBrave() {
    const b = data.brave;
    const key = el('input', { type: 'password', id: 'mn-arm-brave', placeholder: b.key_set ? 'Replace the key' : 'Brave Search API key', autocomplete: 'off' });
    return [el('form', {
      className: 'mn-field',
      onsubmit: (e) => {
        e.preventDefault();
        if (!key.value.trim()) return sections.brave.status.set('Paste a Brave Search API key first.', { error: true });
        run('brave', 'Save Brave key', () => api('PUT', '/brave', { key: key.value.trim() }));
      }
    }, [
      el('label', { className: 'mn-field__label', htmlFor: key.id }, [
        'Brave Search key',
        el('span', { className: b.key_set ? 'mn-field__hint mn-ok' : 'mn-field__hint' }, [
          b.key_set ? 'Set. Talon’s web search and Orrery’s place lookups use it.' : 'Not set: apps have no web search.'
        ])
      ]),
      el('div', { className: 'mn-field__control' }, [
        key,
        el('button', { type: 'submit' }, ['Save']),
        b.key_set && el('button', {
          type: 'button',
          className: 'mn-button--danger',
          onclick: () => run('brave', 'Remove Brave key', () => api('PUT', '/brave', { key: null }))
        }, ['Remove'])
      ])
    ])];
  }

  // --- Vendor and keys ---

  function buildVendor() {
    const acct = data.account;
    const vendor = el('input', { type: 'text', id: 'mn-arm-vendor', value: acct.vendor || '', placeholder: '~nisfeb', autocomplete: 'off', spellcheck: false });
    attachShipFormatter(vendor);
    const keyName = el('input', { type: 'text', id: 'mn-arm-keyname', maxLength: 200, autocomplete: 'off' });
    const out = [
      el('form', { className: 'mn-field', onsubmit: vendorSubmit('vendor', vendor) }, [
        el('label', { className: 'mn-field__label', htmlFor: vendor.id }, [
          'Vendor',
          el('span', { className: 'mn-field__hint' }, [
            acct.vendor === self ? 'This ship is its own vendor: set it up under Provider.'
              : acct.vendor ? `Balance ${dollars(acct.balance)}. Top up in Talon or on Armillary’s page.`
                : `The ship this one buys inference from. Enter ${self || 'this ship'} to be your own provider.`
          ])
        ]),
        el('div', { className: 'mn-field__control' }, [vendor, el('button', { type: 'submit' }, ['Save'])])
      ])
    ];
    if (shownSecret) {
      out.push(el('div', { className: 'mn-field' }, [
        el('div', { className: 'mn-field__label' }, [
          `New key “${shownSecret.name}”`,
          el('span', { className: 'mn-field__hint mn-error' }, ['Copy it now: it is not shown again.'])
        ]),
        el('div', { className: 'mn-field__control' }, [
          el('span', { className: 'mn-value mn-truncate', title: shownSecret.secret }, [shownSecret.secret]),
          el('button', {
            type: 'button',
            onclick: async (e) => { if (await copyText(shownSecret.secret)) e.target.textContent = 'Copied'; }
          }, ['Copy']),
          el('button', { type: 'button', onclick: () => { shownSecret = null; showVendor(true); } }, ['Done'])
        ])
      ]));
    }
    out.push(el('h4', { className: 'mn-subhead' }, ['Inference keys']));
    for (const k of data.keys) {
      out.push(field(k.name, `made ${new Date(k.made).toLocaleString()}`, [
        el('button', {
          type: 'button',
          className: 'mn-button--danger',
          onclick: async () => {
            if (!await confirmDialog(`Revoke the key ${k.name}?`, 'Apps using it stop working until they get a new one.', 'Revoke')) return;
            run('vendor', `Revoke ${k.name}`, () => api('DELETE', `/keys/${encodeURIComponent(k.id)}`));
          }
        }, ['Revoke'])
      ]));
    }
    if (!data.keys.length) out.push(el('p', { className: 'mn-empty' }, [acct.vendor ? 'No keys yet.' : 'Set a vendor first.']));
    if (acct.vendor) {
      out.push(el('form', {
        className: 'mn-field',
        onsubmit: (e) => {
          e.preventDefault();
          const name = keyName.value.trim();
          if (!name) { keyName.focus(); return sections.vendor.status.set('Name the key after what will use it, such as phone.', { error: true }); }
          run('vendor', `Make key ${name}`, async () => {
            const { status, json } = await api('POST', '/keys', { name });
            if (status === 202) return 'The vendor has not answered yet; the key appears here when it does.';
            shownSecret = { name, secret: json.secret };
            keyName.value = '';
            return `Made key ${name}.`;
          });
        }
      }, [
        el('label', { className: 'mn-field__label', htmlFor: keyName.id }, ['New key', el('span', { className: 'mn-field__hint' }, ['For an app that calls models itself.'])]),
        el('div', { className: 'mn-field__control' }, [keyName, el('button', { type: 'submit' }, ['Make key'])])
      ]));
    }
    return out;
  }

  function showVendor(force) {
    if (data.account && data.keys) update('vendor', [data.account, data.keys, shownSecret], buildVendor, force);
  }

  // --- Suggested by your vendor (read only) ---

  // the vendor's picks reach this ship in its account view and in what apps get
  const vendorSuggested = () => {
    const sug = data.account?.suggested || data.inference?.suggested;
    return sug && typeof sug === 'object' && sug.tiers && typeof sug.tiers === 'object' ? sug : null;
  };

  function buildVendorSuggested() {
    const vendor = data.account.vendor;
    const sug = vendorSuggested();
    const tiers = sug ? TIERS.filter(([t]) => sug.tiers[t]).map(([t, label]) => [label, sug.tiers[t]]) : [];
    if (!tiers.length) {
      return [el('p', { className: 'mn-empty' }, [`Nothing from ${vendor} yet. Its picks arrive within a few minutes of choosing it.`])];
    }
    const features = Object.entries(sug.models || {})
      .filter(([f, m]) => f !== 'default' && f !== 'transcription' && typeof m === 'string')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([f, m]) => [featureName(f), m]);
    const facts = (rows) => el('dl', { className: 'mn-facts mn-card__body' }, rows.flatMap(([k, v]) => [
      el('dt', {}, [k]),
      el('dd', {}, [v])
    ]));
    return [
      facts(tiers),
      features.length && el('h4', { className: 'mn-subhead' }, ['By feature']),
      features.length && facts(features),
      el('p', { className: 'mn-note mn-hint' }, [`Apps on this ship use these. ${vendor} chooses them.`])
    ];
  }

  function showVendorSuggested(force) {
    if (data.account?.vendor && !usesSelf()) update('vsuggested', [data.account.vendor, vendorSuggested()], buildVendorSuggested, force);
  }

  // --- Load / poll ---

  async function get(path) {
    return (await api('GET', path)).json;
  }

  // Armillary can't be read: only the message, no cards. The next poll
  // tries a full load again, and layout() shows the cards once it works.
  function unavailable(message) {
    pageStatus.set(message, { error: true });
    for (const s of Object.values(sections)) s.card.hidden = true;
    tabBar.hidden = true;
    for (const p of Object.values(tabPanels)) p.hidden = true;
  }

  async function load(force) {
    try {
      data.settings = await get('/settings');
    } catch (err) {
      data.settings = null;
      return unavailable(err instanceof Missing
        ? 'Armillary is not on this ship. It runs in grubbery: install grubbery, then Armillary from ~ricsul-bilwyt.'
        : `Could not load Armillary — ${err.message}`);
    }
    if (!data.settings || typeof data.settings !== 'object' || !('markup_pct' in data.settings)) {
      data.settings = null;
      return unavailable('Armillary answered in a shape this page does not know. Is it an old version?');
    }
    pageStatus.set('');
    const [providers, catalog, suggested, brave, account, keys] = await Promise.all(
      ['/providers', '/catalog', '/suggested', '/brave', '/account', '/keys'].map((p) => get(p).catch(() => null)));
    // anything not in the expected shape counts as missing
    const list = (x) => (Array.isArray(x) ? x : []);
    const obj = (x, key) => (x && typeof x === 'object' && key in x ? x : null);
    Object.assign(data, {
      providers: list(providers),
      catalog: list(catalog),
      suggested: obj(suggested, 'tiers'),
      brave: obj(brave, 'key_set'),
      account: obj(account, 'vendor') || { vendor: '', balance: '0' },
      keys: list(keys)
    });
    if (data.account.self) self = data.account.self;
    // 404 "no key yet" is normal
    data.inference = obj(await get('/inference').catch(() => null), 'base_url');
    try { partyLine = (await scry('trunk', '/guests')).origin || ''; } catch { partyLine = ''; }

    update('status', [data.inference, data.account, data.brave?.key_set, enabledModels().length], buildStatus, force);
    update('setup', [self], buildSetup, force);
    showVendor(force);
    showVendorSuggested(force);
    update('own', [data.providers.length, liveModels().length, data.account.vendor, self], buildOwn, force);
    update('free', [data.settings.own_free], buildFree, force);
    update('providers', [data.providers, data.catalog.map((r) => r.provider)], buildProviders, force);
    showModels(force);
    if (data.brave) update('brave', [data.brave], buildBrave, force);
    update('address', [data.settings.public_url, partyLine], buildAddress, force);
    if (data.suggested) update('suggested', [data.suggested, enabledModels().map((r) => r.id)], buildSuggested, force);
    layout();
  }

  // Between full loads only the account (balance, vendor) and what apps get
  // change on their own; everything else changes through this tab's actions,
  // which reload in full, or is picked up when the tab is shown again
  async function poll() {
    // no full load has finished yet (not on this ship, signed out): try one
    if (!data.settings || !data.account) return load();
    const [account, inference] = await Promise.all(
      ['/account', '/inference'].map((p) => get(p).catch(() => null)));
    // keep the last account when it fails to answer; 404 "no key yet" is normal
    if (account && typeof account === 'object' && 'vendor' in account) data.account = account;
    data.inference = inference && typeof inference === 'object' && 'base_url' in inference ? inference : null;
    if (data.account.self) self = data.account.self;

    update('status', [data.inference, data.account, data.brave?.key_set, enabledModels().length], buildStatus);
    update('own', [data.providers.length, liveModels().length, data.account.vendor, self], buildOwn);
    showVendor();
    showVendorSuggested();
    layout();
  }

  mount([
    section('status', 'Status', 'What apps such as Talon and Orrery get from Armillary right now.'),
    section('setup', 'Set up Armillary', [
      'Buy from another ship: enter a vendor, such as ~nisfeb. This ship’s apps buy inference from it with a prepaid balance, topped up by card or bitcoin in Talon or on Armillary’s page.',
      'Be your own provider: enter this ship’s own name. Its apps then run on provider keys you add here, such as OpenRouter or a GPU at home, and its own use can be free.',
      'Neither sets up selling to other ships. That needs a provider here, then plans and payments on Armillary’s page, and you can do it whichever vendor this ship uses.'
    ]),
    tabBar,
    tabPanel('vendor', [
      section('vendor', 'Vendor and keys', 'The ship this one buys inference from, and the keys apps use.'),
      section('vsuggested', 'Suggested by your vendor', 'The model your vendor picked for each kind of work. Apps on this ship use them.')
    ]),
    tabPanel('provider', [
      section('own', 'Run your own inference', 'Get this ship ready to serve inference from your own provider keys.'),
      section('free', 'Own use', 'This ship is its own vendor, so its own apps can use its models without a balance.'),
      section('providers', 'Providers', 'The model services this ship has keys for: OpenRouter, or any OpenAI-compatible server.'),
      section('models', 'Models', 'Models imported from the providers. Only switched-on ones can be used.', [modelFilter]),
      section('brave', 'Web search', 'A Brave Search key gives apps web search. It never leaves this ship.'),
      section('address', 'Public address', 'Where apps on other devices reach this ship. Party line keeps its own copy of the address.'),
      section('suggested', 'Suggested models', 'Which model apps use for each kind of work. Customers of this ship get them too.')
    ])
  ], load, poll);
  // until the first load says what is set up
  sections.setup.card.hidden = true;
}

export { render };
