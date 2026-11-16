const app = 'bitcoin-client';
const subPathsToActIds = {};
const channelId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const channelPath = `${window.location.origin}/~/channel/${channelId}`;
const scryBasePath = `${window.location.origin}/~/scry/${app}`;
let our;
let eventSource;
let channelActId = 0;
let bestBlockSubscribed = false;
let bestBlockPollTimer = null;
let bestBlockPollInFlight = false;
let bestFilterHeaderPollTimer = null;
let bestFilterHeaderPollInFlight = false;
let headerViewedFrame = null;
let networkPanelFrame = null;
const dirtyNetworkTabs = new Set();
let syncStatusRevision = 0;
let cometRefreshFeedbackTimer = null;
let cometNameFeedbackTimer = null;
let cometPan = null;
let cometPanClickUntil = 0;
let cometZoomAnimations = [];

const explorerState = {
  networkPage: 'urbit',
  cometGraphScroll: null,
  bitcoinHeaderScrollAnchor: null,
  bitcoinHeaderAtStart: true,
  network: null,
  shipReconnecting: false,
  config: null,
  configDraft: null,
  configSaving: false,
  configSaveError: null,
  isSynced: null,
  bestBlock: null,
  bestFilterHeader: null,
  highestViewedHeaderHeight: null,
  headers: new Map(),
  headerHashesByHeight: new Map(),
  headerWindow: null,
  pendingHeaderHeights: new Set(),
  filterHeadersByHeight: new Map(),
  pendingFilterHeaderHeights: new Set(),
  filterHeaderHeightsInFlight: new Set(),
  peers: null,
  cometSponsorshipGraph: null,
  cometNyms: new Map(),
  cometNameFormat: 'nym',
  cometNameTogglePulse: 0,
  cometGraphZoom: 'full',
  cometSearchOpen: false,
  cometSearchQuery: '',
  cometSearchActiveIndex: 0,
  cometSearchError: null,
  observatoryOur: null,
  selectedCometPatp: null,
  cometScryError: null,
  cometRefreshState: 'idle',
  cometPeers: new Map(),
  pendingCometPeers: new Set(),
  cometPeerErrors: new Map(),
  addresses: null,
  blacklist: null,
  selectedTab: { type: 'peers' },
  peersPage: 0,
  peerConnectAddress: '',
  peerConnectPort: '',
  peerConnectError: null,
  peerConnectPending: false,
  addressesPage: 0,
  blacklistPage: 0,
  openBlocks: new Map(),
  blockTransactionPages: new Map(),
  pendingPeerDisconnects: new Set(),
  pendingPeerConnects: new Set(),
  peerSettingsOpen: new Set(),
  peerBanForms: new Map(),
  addressSettingsOpen: new Set(),
  addressBanForms: new Map(),
  pendingAddressRemovals: new Set(),
  blacklistSettingsOpen: new Set(),
  pendingPeerUnbans: new Set(),
  blocks: new Map(),
  pendingBlocks: new Set(),
  headerSearchQuery: '',
  headerSearchError: null,
  pendingHeaderSearch: null
};
let suppressHeaderScroll = false;
const headerBatchSize = 20;
const headerWindowSize = 60;
const transactionBatchSize = 5;
const peerPanelBatchSize = 20;
const bestBlockPollInterval = 3000;
const peerServiceLabels = {
  'node-network': 'Network',
  'node-bloom': 'Bloom',
  'node-witness': 'Witness',
  'node-compact-filters': 'Compact filters',
  'node-network-limited': 'Limited network',
  'node-p2p-v2': 'P2P v2'
};
const headerPlaceholders = Array.from({ length: 6 }, (_, index) => ({
  id: `header-placeholder-${index}`,
  isPlaceholder: true
}));
const searchHeaderPlaceholders = Array.from(
  { length: headerBatchSize },
  (_, index) => ({
    id: `header-search-placeholder-${index}`,
    isPlaceholder: true
  })
);

addEventListener('DOMContentLoaded', async () => {
  our = document.documentElement.getAttribute('our');
  renderExplorer();
  scryComets();
  scryObservatoryOur();
  const hasValidNetwork = await scryNetwork();
  if (hasValidNetwork) connectToShip();
});

function handleConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return;
  explorerState.config = config;
  if (explorerState.selectedTab.type === 'config') renderBitcoinExplorer();
}

async function scryObservatoryOur() {
  try {
    const response = await fetch(`${window.location.origin}/~/scry/observatory/our.json`);
    if (!response.ok) {
      throw new Error(`Observatory our scry failed with status ${response.status}`);
    }
    const data = await response.json();
    if (!data || typeof data.patp !== 'string' || !Array.isArray(data.custody)) {
      throw new Error('Expected Observatory identity and custody data');
    }
    explorerState.observatoryOur = data;
    renderExplorer();
  } catch (error) {
    console.error('Unable to load Observatory identity:', error);
  }
}

async function scryComets() {
  if (explorerState.cometRefreshState === 'loading') return;
  if (cometRefreshFeedbackTimer !== null) {
    clearTimeout(cometRefreshFeedbackTimer);
    cometRefreshFeedbackTimer = null;
  }
  explorerState.cometRefreshState = 'loading';
  explorerState.cometScryError = null;
  renderUrbitExplorer();
  try {
    const response = await fetch(`${window.location.origin}/~/scry/observatory/comets.json`);
    if (!response.ok) {
      throw new Error(`Comets scry failed with status ${response.status}`);
    }

    explorerState.cometSponsorshipGraph = buildCometSponsorshipGraph(await response.json());
    explorerState.cometNyms = indexCometNyms(explorerState.cometSponsorshipGraph);
    explorerState.selectedCometPatp = explorerState.cometSponsorshipGraph[0]?.patp ?? null;
    explorerState.cometScryError = null;
    scryCometPeer(explorerState.selectedCometPatp);
    explorerState.cometRefreshState = 'success';
    cometRefreshFeedbackTimer = setTimeout(() => {
      cometRefreshFeedbackTimer = null;
      explorerState.cometRefreshState = 'idle';
      renderUrbitExplorer();
    }, 360);
  } catch (error) {
    explorerState.cometRefreshState = 'idle';
    explorerState.cometScryError = 'Unable to load comets from Observatory.';
    console.error('Unable to load Observatory comets:', error);
  }
  renderUrbitExplorer();
}

async function scryCometPeer(patp) {
  if (!patp || explorerState.cometPeers.has(patp) || explorerState.pendingCometPeers.has(patp)) return;
  explorerState.pendingCometPeers.add(patp);
  explorerState.cometPeerErrors.delete(patp);
  try {
    const response = await fetch(`${window.location.origin}/~/scry/observatory/peer/${encodeURIComponent(patp)}.json`);
    // The vane/agent has no known legacy peer record for this identity.
    if (response.status === 404) {
      explorerState.cometPeers.set(patp, null);
    } else {
      if (!response.ok) throw new Error(`Peer scry failed with status ${response.status}`);
      const peer = await response.json();
      if (peer !== null && (typeof peer !== 'object' || Array.isArray(peer))) {
        throw new Error('Expected Observatory peer data');
      }
      explorerState.cometPeers.set(patp, peer);
    }
  } catch (error) {
    explorerState.cometPeerErrors.set(patp, 'Unable to load networking data.');
    console.error(`Unable to load Observatory peer ${patp}:`, error);
  } finally {
    explorerState.pendingCometPeers.delete(patp);
    // An older response may populate its cache, but never replaces the
    // details belonging to the comet the user has since selected.
    if (explorerState.selectedCometPatp === patp) renderUrbitExplorer();
  }
}

// A forest of { patp, nym, sponsees: [...] } nodes, including sponsors
// mentioned only as parents.  Index first so input order does not matter.
function buildCometSponsorshipGraph(comets) {
  if (!Array.isArray(comets)) throw new Error('Expected an Observatory comets array');

  const nodes = new Map();
  const parents = new Map();
  function getNode(comet) {
    if (!comet || typeof comet.patp !== 'string' || !comet.patp) {
      throw new Error('Expected a comet with a patp');
    }
    if (!nodes.has(comet.patp)) {
      nodes.set(comet.patp, { patp: comet.patp, nym: comet.nym || '', sponsees: [] });
    } else if (comet.nym) {
      nodes.get(comet.patp).nym = comet.nym;
    }
    return nodes.get(comet.patp);
  }

  for (const comet of comets) {
    const node = getNode(comet);
    parents.delete(node.patp);
    if (comet.sponsor) {
      const sponsor = getNode(comet.sponsor);
      if (sponsor.patp !== node.patp) parents.set(node.patp, sponsor.patp);
    }
  }

  // Break a cyclic sponsorship edge before nesting, preserving every
  // identity while ensuring the graph can be traversed and serialized.
  const complete = new Set();
  for (const patp of nodes.keys()) {
    const path = new Set();
    let current = patp;
    while (current !== undefined && !complete.has(current)) {
      if (path.has(current)) {
        parents.delete(current);
        break;
      }
      path.add(current);
      current = parents.get(current);
    }
    for (const visited of path) complete.add(visited);
  }

  const roots = [];
  for (const [patp, node] of nodes) {
    const sponsor = parents.get(patp);
    if (sponsor === undefined) roots.push(node);
    else nodes.get(sponsor).sponsees.push(node);
  }
  return roots;
}

async function scryNetwork() {
  try {
    const response = await fetch(`${scryBasePath}/network.json`);
    if (!response.ok) {
      throw new Error(`Network scry failed with status ${response.status}`);
    }

    const network = await response.json();
    if (network !== 'mainnet' && network !== 'regtest') return false;

    explorerState.network = network;
    renderBitcoinExplorer();
    return true;
  } catch {
    return false;
  }
}

async function connectToShip() {
  await sendActions([
    makeSubscribe('/is-synced'),
    makeSubscribe('/peers'),
    makeSubscribe('/addresses'),
    makeSubscribe('/blacklist'),
    makeSubscribe('/config')
  ]);
  eventSource = new EventSource(channelPath);
  eventSource.addEventListener('message', handleChannelStream);
  eventSource.addEventListener('error', () => {
    if (eventSource.readyState !== EventSource.CONNECTING || explorerState.shipReconnecting) return;
    explorerState.shipReconnecting = true;
    renderBitcoinExplorer();
  });
  eventSource.addEventListener('open', () => {
    refreshIsSynced();
    if (!explorerState.shipReconnecting) return;
    explorerState.shipReconnecting = false;
    renderBitcoinExplorer();
  });
  updateBestFilterHeaderPolling();
}

async function handleChannelStream(event) {
  const msg = JSON.parse(event.data);
  sendActions([makeAck(msg.id)]);
  //if (msg.response === 'quit') // TODO: resubscribe to the subPath associated with msg.id
  if (msg.response !== 'diff') return;
  if (msg.mark !== 'bitcoin-client-update') return;

  const update = parseBitcoinClientUpdate(msg.json);
  if (!update) return;

  if (update.type === 'config') {
    handleConfig(update.data);
  } else if (update.type === 'is-synced') {
    handleIsSynced(update.data);
  } else if (update.type === 'best-block' && bestBlockSubscribed) {
    handleBestBlockUpdate(update.data);
  } else if (update.type === 'peers') {
    handlePeers(update.data);
  } else if (update.type === 'addresses') {
    handleAddresses(update.data);
  } else if (update.type === 'blacklist') {
    handleBlacklist(update.data);
  } else if (update.type === 'block-by-height') {
    handleBlock(update.data);
  }
}

function parseBitcoinClientUpdate(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const entries = Object.entries(json);
  if (entries.length !== 1) return null;
  return { type: entries[0][0], data: entries[0][1] };
}

function unwrapBitcoinClientUpdate(json, expectedType) {
  const update = parseBitcoinClientUpdate(json);
  if (!update || update.type !== expectedType) {
    throw new Error(`Expected bitcoin-client ${expectedType} update`);
  }
  return update.data;
}

function peerKey(address) {
  return `${address['network-id']}:${address.address}:${address.port}`;
}

function cachePeer(address, info) {
  if (!address || !info) return;
  const key = peerKey(address);
  explorerState.peers ??= new Map();
  explorerState.peers.set(key, { key, address, info });
  if (!explorerState.peerConnectAddress.trim() || !explorerState.peerConnectPort.trim()) return;
  try {
    const enteredAddress = parsePeerIp(explorerState.peerConnectAddress);
    const port = explorerState.peerConnectPort.trim();
    if (/^[0-9]+$/.test(port)) {
      enteredAddress.port = Number(port);
      if (peerKey(enteredAddress) === key) {
        explorerState.peerConnectAddress = '';
        explorerState.peerConnectPort = '';
        explorerState.peerConnectError = null;
      }
    }
  } catch {
    // Incomplete form input does not identify a peer yet.
  }
}

function updateStatusModule() {
  if (explorerState.networkPage !== 'bitcoin') return;
  const status = document.querySelector('[data-render-key="status-module"]');
  if (status) reconcileNode(status, StatusModule());
}

function scheduleNetworkPanelRender(tabs) {
  if (explorerState.networkPage !== 'bitcoin') return;
  for (const tab of tabs) dirtyNetworkTabs.add(tab);
  if (networkPanelFrame !== null) return;
  networkPanelFrame = requestAnimationFrame(() => {
    networkPanelFrame = null;
    if (explorerState.networkPage !== 'bitcoin') return;
    const tab = explorerState.selectedTab.type;
    const needsRender = dirtyNetworkTabs.has(tab);
    dirtyNetworkTabs.clear();
    if (!needsRender) return;

    const panel = document.querySelector('[data-render-key="peers-panel"]');
    if (!panel) return;
    reconcileNode(panel, PeersPanel(
      explorerState.peers, explorerState.addresses, explorerState.blacklist, tab
    ));
  });
}

function handlePeers(peersUpdate) {
  if (!peersUpdate || typeof peersUpdate.type !== 'string') return;
  const wasNetworkConnected = hasNetworkConnection(explorerState);

  if (peersUpdate.type === 'all') {
    explorerState.peers = new Map();
    for (const peer of peersUpdate.peers ?? []) {
      cachePeer(peer.address, peer.info);
    }
    for (const key of explorerState.pendingPeerDisconnects) {
      if (!explorerState.peers.has(key)) {
        explorerState.pendingPeerDisconnects.delete(key);
      }
    }
    if (explorerState.peers.size === 0) explorerState.peers = null;
    for (const key of explorerState.peerSettingsOpen) {
      if (!explorerState.peers?.has(key)) explorerState.peerSettingsOpen.delete(key);
    }
    for (const key of explorerState.peerBanForms.keys()) {
      if (!explorerState.peers?.has(key)) explorerState.peerBanForms.delete(key);
    }
  } else if (peersUpdate.type === 'put') {
    cachePeer(peersUpdate.address, peersUpdate.info);
  } else if (peersUpdate.type === 'del' && peersUpdate.address) {
    const key = peerKey(peersUpdate.address);
    explorerState.pendingPeerDisconnects.delete(key);
    explorerState.peerSettingsOpen.delete(key);
    explorerState.peerBanForms.delete(key);
    explorerState.peers?.delete(key);
    if (explorerState.peers?.size === 0) explorerState.peers = null;
  } else {
    return;
  }

  for (const key of explorerState.pendingPeerConnects) {
    if (explorerState.peers?.has(key)) explorerState.pendingPeerConnects.delete(key);
  }
  if (wasNetworkConnected !== hasNetworkConnection(explorerState)) {
    updateStatusModule();
    refreshIsSynced();
  }
  scheduleNetworkPanelRender(['peers', 'addresses']);
}

function cacheAddress(address, info) {
  if (!address || !info) return;
  const key = peerKey(address);
  explorerState.addresses ??= new Map();
  explorerState.addresses.set(key, { key, address, info });
}

function handleAddresses(addressesUpdate) {
  if (!addressesUpdate || typeof addressesUpdate.type !== 'string') return;

  if (addressesUpdate.type === 'all') {
    explorerState.addresses = new Map();
    for (const address of addressesUpdate.addresses ?? []) {
      cacheAddress(address.address, address.info);
    }
  } else if (addressesUpdate.type === 'put') {
    cacheAddress(addressesUpdate.address, addressesUpdate.info);
  } else if (addressesUpdate.type === 'del' && addressesUpdate.address) {
    explorerState.addresses ??= new Map();
    explorerState.addresses.delete(peerKey(addressesUpdate.address));
  } else {
    return;
  }

  for (const key of explorerState.addressSettingsOpen) {
    if (!explorerState.addresses?.has(key)) explorerState.addressSettingsOpen.delete(key);
  }
  for (const key of explorerState.addressBanForms.keys()) {
    if (!explorerState.addresses?.has(key)) explorerState.addressBanForms.delete(key);
  }
  scheduleNetworkPanelRender(['addresses']);
}

function cacheBlacklistEntry(address, info) {
  if (!address || !info) return;
  const key = peerKey(address);
  explorerState.blacklist ??= new Map();
  explorerState.blacklist.set(key, { key, address, info });
}

function handleBlacklist(blacklistUpdate) {
  if (!blacklistUpdate || typeof blacklistUpdate.type !== 'string') return;

  if (blacklistUpdate.type === 'all') {
    explorerState.blacklist = new Map();
    for (const entry of blacklistUpdate.blacklist ?? []) {
      cacheBlacklistEntry(entry.address, entry.info);
    }
  } else if (blacklistUpdate.type === 'put') {
    cacheBlacklistEntry(blacklistUpdate.address, blacklistUpdate.info);
  } else if (blacklistUpdate.type === 'del' && blacklistUpdate.address) {
    explorerState.blacklist ??= new Map();
    explorerState.blacklist.delete(peerKey(blacklistUpdate.address));
  } else {
    return;
  }

  for (const key of explorerState.pendingPeerUnbans) {
    if (!explorerState.blacklist?.has(key)) {
      explorerState.pendingPeerUnbans.delete(key);
      explorerState.blacklistSettingsOpen.delete(key);
    }
  }
  for (const key of explorerState.blacklistSettingsOpen) {
    if (!explorerState.blacklist?.has(key)) explorerState.blacklistSettingsOpen.delete(key);
  }
  scheduleNetworkPanelRender(['blacklist']);
}

function handleIsSynced(isSynced) {
  syncStatusRevision++;
  const nextIsSynced = isSynced === true;
  const syncStatusChanged = explorerState.isSynced !== nextIsSynced;
  explorerState.isSynced = nextIsSynced;

  if (explorerState.isSynced) {
    stopBestBlockPolling();
    subscribeToBestBlock();
  } else {
    unsubscribeFromBestBlock();
    startBestBlockPolling();
  }

  updateBestFilterHeaderPolling();
  if (syncStatusChanged) renderBitcoinExplorer();
  else updateStatusModule();
}

function subscribeToBestBlock() {
  if (bestBlockSubscribed) return;

  bestBlockSubscribed = true;
  sendActions([makeSubscribe('/best-block')]);
}

function unsubscribeFromBestBlock() {
  if (!bestBlockSubscribed) return;

  bestBlockSubscribed = false;
  sendActions([makeUnsubscribe('/best-block')]);
}

function stopBestBlockPolling() {
  if (bestBlockPollTimer !== null) {
    clearTimeout(bestBlockPollTimer);
    bestBlockPollTimer = null;
  }
}

function scheduleBestBlockPoll() {
  if (explorerState.isSynced || bestBlockPollTimer !== null) return;

  bestBlockPollTimer = setTimeout(() => {
    bestBlockPollTimer = null;
    pollBestBlock();
  }, bestBlockPollInterval);
}

function startBestBlockPolling() {
  if (explorerState.isSynced ||
      bestBlockPollInFlight ||
      bestBlockPollTimer !== null) {
    return;
  }

  pollBestBlock();
}

async function refreshIsSynced() {
  const revision = syncStatusRevision;
  try {
    const response = await fetch(`${scryBasePath}/is-synced.json`);
    if (!response.ok) return;
    const synced = unwrapBitcoinClientUpdate(await response.json(), 'is-synced');
    // A subscription update received during this request is more authoritative.
    if (typeof synced === 'boolean' && revision === syncStatusRevision) {
      handleIsSynced(synced);
    }
  } catch {
    // Keep the subscription state; catch-up polling will retry.
  }
}

async function pollBestBlock() {
  if (explorerState.isSynced || bestBlockPollInFlight) return;

  bestBlockPollInFlight = true;

  try {
    const response = await fetch(`${scryBasePath}/best-block.json`);
    if (!response.ok) {
      throw new Error(`Best block scry failed with status ${response.status}`);
    }

    const bestBlockJson = unwrapBitcoinClientUpdate(
      await response.json(),
      'best-block'
    );
    if (!explorerState.isSynced) {
      handleBestBlockUpdate(bestBlockJson, { requireVisibleTip: true });
    }
  } catch {
    // A later poll will retry while the light client is still syncing.
  } finally {
    await refreshIsSynced();
    bestBlockPollInFlight = false;
    scheduleBestBlockPoll();
  }
}

function shouldPollBestFilterHeader() {
  const { isSynced, bestBlock, bestFilterHeader } = explorerState;
  return !(isSynced === true && bestBlock && bestFilterHeader &&
    bestFilterHeader.height === bestBlock.height &&
    bestFilterHeader.hash === bestBlock.hash);
}

function updateBestFilterHeaderPolling() {
  if (!shouldPollBestFilterHeader()) {
    if (bestFilterHeaderPollTimer !== null) {
      clearTimeout(bestFilterHeaderPollTimer);
      bestFilterHeaderPollTimer = null;
    }
    return;
  }

  if (bestFilterHeaderPollInFlight || bestFilterHeaderPollTimer !== null) return;
  pollBestFilterHeader();
}

function scheduleBestFilterHeaderPoll() {
  if (!shouldPollBestFilterHeader() || bestFilterHeaderPollTimer !== null) return;

  bestFilterHeaderPollTimer = setTimeout(() => {
    bestFilterHeaderPollTimer = null;
    pollBestFilterHeader();
  }, bestBlockPollInterval);
}

async function pollBestFilterHeader() {
  if (!shouldPollBestFilterHeader() || bestFilterHeaderPollInFlight) return;

  bestFilterHeaderPollInFlight = true;
  try {
    const response = await fetch(`${scryBasePath}/best-filter-header.json`);
    if (!response.ok) {
      throw new Error(`Best filter header scry failed with status ${response.status}`);
    }

    const data = unwrapBitcoinClientUpdate(
      await response.json(),
      'best-filter-header'
    );
    const height = Number(data?.['block-height']);
    const hash = data?.['block-hash'];
    if (!Number.isSafeInteger(height) || height < 0 ||
        typeof hash !== 'string' || !hash) {
      throw new Error('Unexpected best filter header scry response');
    }

    explorerState.bestFilterHeader = { height, hash };
    requestPendingFilterHeaders();
    renderBitcoinExplorer();
  } catch {
    // A later poll will retry until syncing is complete and both tips match.
  } finally {
    bestFilterHeaderPollInFlight = false;
    scheduleBestFilterHeaderPoll();
  }
}

function headerRowIsAtStart() {
  const row = document.querySelector('.block-header-row');
  return row ? row.scrollLeft <= 1 : explorerState.bitcoinHeaderAtStart;
}

function handleBestBlock(bestBlockJson, { requireVisibleTip = false } = {}) {
  const previousBestBlock = explorerState.bestBlock;
  const nextBestBlock = {
    height: Number(bestBlockJson['block-height']),
    hash: bestBlockJson['block-hash']
  };
  const bestBlockChanged = !previousBestBlock ||
    previousBestBlock.height !== nextBestBlock.height ||
    previousBestBlock.hash !== nextBestBlock.hash;

  explorerState.bestBlock = nextBestBlock;
  if (explorerState.highestViewedHeaderHeight === null) {
    explorerState.highestViewedHeaderHeight = nextBestBlock.height;
  }
  updateBestFilterHeaderPolling();
  if (!bestBlockChanged) return;

  if (!explorerState.headerWindow) {
    const lowestHeight = Math.max(
      0,
      explorerState.bestBlock.height - headerBatchSize + 1
    );
    setHeaderWindow({
      highestHeight: explorerState.bestBlock.height,
      lowestHeight
    });
    return;
  }

  const wasAtTip = explorerState.headerWindow.highestHeight ===
      previousBestBlock?.height &&
    (!requireVisibleTip || headerRowIsAtStart());

  if (wasAtTip) {
    const highestHeight = explorerState.bestBlock.height;
    let lowestHeight = explorerState.headerWindow.lowestHeight > highestHeight
      ? Math.max(0, highestHeight - headerBatchSize + 1)
      : explorerState.headerWindow.lowestHeight;

    if (highestHeight - lowestHeight + 1 > headerWindowSize) {
      lowestHeight = highestHeight - headerWindowSize + 1;
    }

    setHeaderWindow(
      { highestHeight, lowestHeight },
      requireVisibleTip ? null : captureHeaderScrollAnchor()
    );
  } else {
    renderBitcoinExplorer();
  }

  const mayBeReorg = previousBestBlock &&
    explorerState.bestBlock.height <= previousBestBlock.height &&
    previousBestBlock.hash !== explorerState.bestBlock.hash;

  if (mayBeReorg) {
    requestHeaderRange(
      Math.max(0, explorerState.bestBlock.height - headerBatchSize + 1),
      explorerState.bestBlock.height,
      true
    );
  }
}

function handleBestBlockUpdate(bestBlockUpdate, options = {}) {
  if (bestBlockUpdate?.['block-height'] !== undefined &&
      bestBlockUpdate?.['block-hash']) {
    handleBestBlock(bestBlockUpdate, options);
    return;
  }

  const lastCommon = bestBlockUpdate?.['last-common'];
  if (!lastCommon) return;

  for (const staleBlock of bestBlockUpdate['stale-branch'] ?? []) {
    const height = Number(staleBlock['block-height']);
    const hash = staleBlock['block-hash'];
    explorerState.headers.delete(hash);
    explorerState.blocks.delete(hash);
    explorerState.openBlocks.delete(hash);
    explorerState.blockTransactionPages.delete(hash);
    if (explorerState.headerHashesByHeight.get(height) === hash) {
      explorerState.headerHashesByHeight.delete(height);
    }
    if (explorerState.selectedTab.type === 'block' &&
        explorerState.selectedTab.hash === hash) {
      explorerState.selectedTab = { type: 'peers' };
    }
  }

  handleBestBlock(lastCommon, options);
}

function formatHoonDecimal(number) {
  return String(number).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatHoonHex(hex) {
  return `0x${hex.match(/.{4}/g).join('.')}`;
}

function handleBlockHeader(headerJson) {
  if (!headerJson) {
    const pendingSearch = explorerState.pendingHeaderSearch;
    explorerState.pendingHeaderSearch = null;
    explorerState.headerSearchError = 'Unknown block hash';
    renderBitcoinExplorer(pendingSearch?.scrollAnchor ?? null);
    return;
  }

  const blockInfo = headerJson['block-info'];
  const blockHeader = headerJson['block-header'];
  const height = Number(blockInfo['block-height']);
  const header = normalizeBlockHeader(blockInfo, blockHeader);

  explorerState.headers.set(header.hash, header);
  explorerState.headerHashesByHeight.set(height, header.hash);
  explorerState.pendingHeaderHeights.delete(height);

  const pendingSearch = explorerState.pendingHeaderSearch;
  const resolvesSearch = pendingSearch && (
    (pendingSearch.type === 'height' && pendingSearch.value === height) ||
    (pendingSearch.type === 'hash' && pendingSearch.value === header.hash)
  );

  if (resolvesSearch) {
    explorerState.pendingHeaderSearch = null;
    explorerState.headerSearchQuery = '';
    explorerState.headerSearchError = null;
    setSelectedBlock(header);
    centerHeaderWindow(height);
    return;
  }

  if (headerWindowHasHeight(height)) renderBitcoinExplorer();
}

async function scryBlockHeader(path) {
  const response = await fetch(`${scryBasePath}${path}.json`);
  if (!response.ok) {
    throw new Error(`Header scry failed with status ${response.status}`);
  }
  const responseJson = await response.json();
  const update = parseBitcoinClientUpdate(responseJson);
  if (!update || (update.type !== 'block-header-by-height' &&
                  update.type !== 'block-header-by-hash')) {
    throw new Error('Unexpected block header scry response');
  }
  return update.data;
}

function handleHeaderScryError(type, value) {
  if (type === 'height') explorerState.pendingHeaderHeights.delete(value);

  const pendingSearch = explorerState.pendingHeaderSearch;
  const failedSearch = pendingSearch &&
    pendingSearch.type === type &&
    pendingSearch.value === value;
  if (!failedSearch) return;

  explorerState.pendingHeaderSearch = null;
  explorerState.headerSearchError = 'Unable to load block header';
  renderBitcoinExplorer(pendingSearch.scrollAnchor ?? null);
}

async function scryBlockHeaderByHeight(height) {
  requestFilterHeaderByHeight(height);
  try {
    const hoonHeight = formatHoonDecimal(height);
    const headerJson = await scryBlockHeader(
      `/block-header/height/${hoonHeight}`
    );
    handleBlockHeader(headerJson);
  } catch {
    handleHeaderScryError('height', height);
  }
}

async function scryBlockHeaderByHash(blockHash) {
  try {
    const hoonHash = formatHoonHex(blockHash);
    const headerJson = await scryBlockHeader(
      `/block-header/hash/${hoonHash}`
    );
    if (headerJson) {
      requestFilterHeaderByHeight(Number(headerJson['block-info']['block-height']));
    }
    handleBlockHeader(headerJson);
  } catch {
    handleHeaderScryError('hash', blockHash);
  }
}

function requestFilterHeaderByHeight(height) {
  if (!Number.isSafeInteger(height) || height < 0) return;

  explorerState.pendingFilterHeaderHeights.add(height);
  const bestFilterHeader = explorerState.bestFilterHeader;
  if (!bestFilterHeader || height > bestFilterHeader.height ||
      explorerState.filterHeaderHeightsInFlight.has(height)) {
    return;
  }

  scryFilterHeaderByHeight(height);
}

function requestPendingFilterHeaders() {
  for (const height of explorerState.pendingFilterHeaderHeights) {
    requestFilterHeaderByHeight(height);
  }
}

async function scryFilterHeaderByHeight(height) {
  explorerState.filterHeaderHeightsInFlight.add(height);
  try {
    const hoonHeight = formatHoonDecimal(height);
    const response = await fetch(
      `${scryBasePath}/filter-header/height/${hoonHeight}.json`
    );
    if (!response.ok) {
      throw new Error(`Filter header scry failed with status ${response.status}`);
    }

    const filterHeader = unwrapBitcoinClientUpdate(
      await response.json(),
      'filter-header-by-height'
    );
    if (typeof filterHeader !== 'string' || !/^[0-9a-f]{64}$/i.test(filterHeader)) {
      throw new Error('Unexpected filter header scry response');
    }

    explorerState.filterHeadersByHeight.set(height, filterHeader);
    explorerState.pendingFilterHeaderHeights.delete(height);
    updateFilterHeaderLine(height);
  } catch {
    // Keep the height pending for the next filter tip poll or header request.
  } finally {
    explorerState.filterHeaderHeightsInFlight.delete(height);
  }
}

function requestHeaderRange(lowestHeight, highestHeight, force = false) {
  for (let height = highestHeight; height >= lowestHeight; height--) {
    if (explorerState.pendingHeaderHeights.has(height)) continue;
    if (!force && getHeaderByHeight(explorerState, height)) continue;

    explorerState.pendingHeaderHeights.add(height);
    scryBlockHeaderByHeight(height);
  }
}

function setHeaderWindow(
  headerWindow,
  scrollAnchor = captureHeaderScrollAnchor()
) {
  explorerState.headerWindow = headerWindow;
  requestHeaderRange(
    headerWindow.lowestHeight,
    headerWindow.highestHeight
  );
  renderBitcoinExplorer(scrollAnchor);
}

function headerWindowHasHeight(height) {
  const headerWindow = explorerState.headerWindow;
  return headerWindow &&
    height >= headerWindow.lowestHeight &&
    height <= headerWindow.highestHeight;
}

function getHeaderByHeight(state, height) {
  const blockHash = state.headerHashesByHeight.get(height);
  return blockHash ? state.headers.get(blockHash) : null;
}

function centerHeaderWindow(height) {
  const headersBeforeTarget = Math.floor(headerBatchSize / 2);
  let highestHeight = Math.min(
    explorerState.bestBlock.height,
    height + headersBeforeTarget
  );
  let lowestHeight = Math.max(0, highestHeight - headerBatchSize + 1);

  if (highestHeight - lowestHeight + 1 < headerBatchSize) {
    highestHeight = Math.min(
      explorerState.bestBlock.height,
      lowestHeight + headerBatchSize - 1
    );
  }

  setHeaderWindow({ highestHeight, lowestHeight }, null);
  centerHeaderCard(height);
}

function centerHeaderCard(height) {
  const row = document.querySelector('.block-header-row');
  const card = row?.querySelector(`[data-block-height="${height}"]`);
  if (!row || !card) return;

  suppressHeaderScroll = true;
  row.scrollLeft = card.offsetLeft - ((row.clientWidth - card.offsetWidth) / 2);
  requestAnimationFrame(() => {
    suppressHeaderScroll = false;
  });
}

function showHeaderSearchError(message) {
  explorerState.headerSearchError = message;

  const input = document.querySelector('.block-search');
  const error = document.querySelector('.block-search-error');
  input?.setAttribute('aria-invalid', 'true');
  if (error) error.textContent = message;
}

function handleHeaderSearch(event) {
  event.preventDefault();

  const query = event.currentTarget.elements['block-search'].value.trim();
  explorerState.headerSearchQuery = query;
  explorerState.headerSearchError = null;

  if (!explorerState.bestBlock) {
    showHeaderSearchError('Waiting for the best block');
    return;
  }

  let type;
  let value;

  if (query.length === 64) {
    if (!/^[0-9a-fA-F]{64}$/.test(query)) {
      showHeaderSearchError('Block hashes must contain 64 hexadecimal characters');
      return;
    }
    type = 'hash';
    value = query.toLowerCase();
  } else if (query.length < 64) {
    if (!/^\d+$/.test(query)) {
      showHeaderSearchError('Block heights must be non-negative decimal numbers');
      return;
    }

    value = Number(query);
    if (!Number.isSafeInteger(value)) {
      showHeaderSearchError('Block height is too large');
      return;
    }
    if (value > explorerState.bestBlock.height) {
      showHeaderSearchError('Block height is above the best block');
      return;
    }
    type = 'height';
  } else {
    showHeaderSearchError('Search input cannot exceed 64 characters');
    return;
  }

  const header = type === 'hash'
    ? explorerState.headers.get(value)
    : getHeaderByHeight(explorerState, value);

  if (header) {
    explorerState.headerSearchQuery = '';
    setSelectedBlock(header);
    centerHeaderWindow(header.height);
    return;
  }

  explorerState.pendingHeaderSearch = {
    type,
    value,
    scrollAnchor: captureHeaderScrollAnchor()
  };
  renderBitcoinExplorer(null);

  if (type === 'height') {
    requestHeaderRange(value, value);
  } else {
    scryBlockHeaderByHash(value);
  }
}

function normalizeBlockHeader(blockInfo, blockHeader) {
  return {
    height: Number(blockInfo['block-height']),
    hash: blockInfo['block-hash'],
    chainwork: blockInfo.chainwork,
    version: blockHeader.version,
    previousBlockHash: blockHeader['previous-block-hash'],
    merkleRoot: blockHeader['merkle-root'],
    time: Number(blockHeader.time),
    bits: blockHeader.bits,
    nonce: blockHeader.nonce
  };
}

function handleBlock(blockJson) {
  const blockInfo = blockJson['block-info'];
  const block = blockJson.block;
  const height = Number(blockInfo['block-height']);

  explorerState.blocks.set(blockInfo['block-hash'], {
    height,
    hash: blockInfo['block-hash'],
    transactions: block.txs
  });
  explorerState.pendingBlocks.delete(blockInfo['block-hash']);

  if (getSelectedBlock()?.hash === blockInfo['block-hash']) {
    renderBitcoinExplorer();
  }
}

function getSelectedBlock(state = explorerState) {
  return state.selectedTab.type === 'block'
    ? state.openBlocks.get(state.selectedTab.hash) ?? null
    : null;
}

function selectBlock(header) {
  setSelectedBlock(header);
  renderBitcoinExplorer();
}

function setSelectedBlock(header) {
  explorerState.openBlocks.set(header.hash, header);
  explorerState.selectedTab = { type: 'block', hash: header.hash };
  if (!explorerState.blockTransactionPages.has(header.hash)) {
    explorerState.blockTransactionPages.set(header.hash, 0);
  }

  if (!explorerState.blocks.has(header.hash) &&
      !explorerState.pendingBlocks.has(header.hash)) {
    explorerState.pendingBlocks.add(header.hash);
    const hoonHeight = formatHoonDecimal(header.height);
    sendActions([makeSubscribe(`/block/height/${hoonHeight}`)]);
  }
}

function visibleHeaders(state) {
  if (state.pendingHeaderSearch) return searchHeaderPlaceholders;
  if (!state.headerWindow) return headerPlaceholders;

  const headers = [];

  for (let height = state.headerWindow.highestHeight;
       height >= state.headerWindow.lowestHeight;
       height--) {
    const header = getHeaderByHeight(state, height);
    headers.push(header ?? {
      id: `header-placeholder-${height}`,
      height,
      isPlaceholder: true
    });
  }

  return headers;
}

function captureHeaderScrollAnchor(row = document.querySelector('.block-header-row')) {
  if (!row) return null;

  const cards = Array.from(row.querySelectorAll('[data-block-height]'));
  const anchorCard = cards.find((card) =>
    card.offsetLeft + card.offsetWidth >= row.scrollLeft
  ) ?? cards[cards.length - 1];

  if (!anchorCard) return null;
  return {
    height: Number(anchorCard.dataset.blockHeight),
    offset: anchorCard.offsetLeft - row.scrollLeft
  };
}

function restoreHeaderScrollAnchor(scrollAnchor) {
  if (!scrollAnchor) return;

  const row = document.querySelector('.block-header-row');
  const anchorCard = row?.querySelector(
    `[data-block-height="${scrollAnchor.height}"]`
  );
  if (!row || !anchorCard) return;

  const scrollLeft = anchorCard.offsetLeft - scrollAnchor.offset;
  if (Math.abs(row.scrollLeft - scrollLeft) < 1) return;

  suppressHeaderScroll = true;
  row.scrollLeft = scrollLeft;
  requestAnimationFrame(() => {
    suppressHeaderScroll = false;
  });
}

function navigateHeaderWindow(direction, row) {
  if (explorerState.pendingHeaderHeights.size > 0) return;

  const currentWindow = explorerState.headerWindow;
  if (!currentWindow || !explorerState.bestBlock) return;

  let highestHeight = currentWindow.highestHeight;
  let lowestHeight = currentWindow.lowestHeight;

  if (direction === 'older') {
    if (lowestHeight === 0) return;
    lowestHeight = Math.max(0, lowestHeight - headerBatchSize);

    const excessHeaders = highestHeight - lowestHeight + 1 - headerWindowSize;
    if (excessHeaders > 0) highestHeight -= excessHeaders;
  } else {
    if (highestHeight >= explorerState.bestBlock.height) return;
    highestHeight = Math.min(
      explorerState.bestBlock.height,
      highestHeight + headerBatchSize
    );

    const excessHeaders = highestHeight - lowestHeight + 1 - headerWindowSize;
    if (excessHeaders > 0) lowestHeight += excessHeaders;
  }

  setHeaderWindow(
    { highestHeight, lowestHeight },
    captureHeaderScrollAnchor(row)
  );
}

function scheduleViewedHeaderUpdate() {
  if (explorerState.networkPage !== 'bitcoin') return;
  if (headerViewedFrame !== null) return;
  headerViewedFrame = requestAnimationFrame(() => {
    headerViewedFrame = null;
    updateViewedHeaderHeight();
  });
}

function updateViewedHeaderHeight() {
  if (explorerState.networkPage !== 'bitcoin') return;
  const row = document.querySelector('.block-header-row');
  if (!row || row.clientWidth === 0) return;
  const bounds = row.getBoundingClientRect();
  const left = bounds.left + row.clientLeft;
  const right = left + row.clientWidth;
  const cards = Array.from(row.querySelectorAll('[data-block-hash][data-block-height]'));
  let highest = explorerState.highestViewedHeaderHeight ?? -1;
  // Read positions before changing classes to avoid repeated layout work.
  for (const card of cards) {
    const edge = card.getBoundingClientRect().left;
    if (edge >= left && edge < right) {
      highest = Math.max(highest, Number(card.dataset.blockHeight));
    }
  }
  if (highest >= 0) explorerState.highestViewedHeaderHeight = highest;
  for (const card of cards) {
    card.classList.toggle('block-header-card--new', Number(card.dataset.blockHeight) > highest);
  }
}

addEventListener('resize', scheduleViewedHeaderUpdate);

function handleHeaderPanelScroll(row) {
  scheduleViewedHeaderUpdate();
  if (suppressHeaderScroll ||
      explorerState.pendingHeaderSearch ||
      explorerState.pendingHeaderHeights.size > 0) return;

  const threshold = Math.min(240, row.clientWidth * 0.3);
  const isNearOlderEdge = row.scrollLeft + row.clientWidth >=
    row.scrollWidth - threshold;
  const isNearNewerEdge = row.scrollLeft <= threshold;

  if (isNearOlderEdge) {
    navigateHeaderWindow('older', row);
  } else if (isNearNewerEdge) {
    navigateHeaderWindow('newer', row);
  }
}

function updateBestBlockButtonVisibility(row, button) {
  const bestBlock = explorerState.bestBlock;
  if (!bestBlock || explorerState.pendingHeaderSearch) {
    button.hidden = true;
    return;
  }

  const bestBlockCard = row.querySelector(
    `[data-block-height="${bestBlock.height}"]`
  );
  const isBestBlockVisible = bestBlockCard &&
    bestBlockCard.offsetLeft + bestBlockCard.offsetWidth > row.scrollLeft &&
    bestBlockCard.offsetLeft < row.scrollLeft + row.clientWidth;

  button.hidden = Boolean(isBestBlockVisible);
}

function scrollHeaderRowToStart() {
  const row = document.querySelector('.block-header-row');
  if (!row) return;

  suppressHeaderScroll = true;
  row.scrollLeft = 0;
  requestAnimationFrame(() => {
    suppressHeaderScroll = false;
  });
}

function selectBestBlock() {
  const bestBlock = explorerState.bestBlock;
  if (!bestBlock) return;

  const indexedHeader = getHeaderByHeight(
    explorerState,
    bestBlock.height
  );
  const header = explorerState.headers.get(bestBlock.hash) ??
    (indexedHeader?.hash === bestBlock.hash ? indexedHeader : null);

  if (!header) {
    explorerState.pendingHeaderSearch = {
      type: 'height',
      value: bestBlock.height,
      scrollAnchor: captureHeaderScrollAnchor()
    };
    renderBitcoinExplorer(null);
    requestHeaderRange(bestBlock.height, bestBlock.height);
    return;
  }

  setSelectedBlock(header);

  if (explorerState.headerWindow?.highestHeight === bestBlock.height) {
    renderBitcoinExplorer(null);
    scrollHeaderRowToStart();
  } else {
    centerHeaderWindow(bestBlock.height);
  }
}

function formatBlockTime(timestamp) {
  const date = new Date(timestamp * 1000);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString();
}

function formatNetworkName(network) {
  return network.charAt(0).toUpperCase() + network.slice(1);
}

function hasNetworkConnection(state) {
  if (state.network === null || state.peers === null) return false;
  return Array.from(state.peers.values()).some(
    (peer) => peer.info['handshake-done'] === true
  );
}

function sendActions(actArray) {
  return fetch(channelPath, {
    method: 'PUT',
    body: JSON.stringify(actArray)
  });
}

function makeSubscribe(subPath) {
  channelActId++;
  subPathsToActIds[subPath] = channelActId;
  return {
    id: channelActId,
    action: 'subscribe',
    ship: our,
    app: app,
    path: subPath
  };
}

function makeUnsubscribe(subPath) {
  channelActId++;
  let subActId = subPathsToActIds[subPath];
  delete subPathsToActIds[subPath];
  return {
    id: channelActId,
    action: 'unsubscribe',
    subscription: subActId
  };
}

function makeBitcoinClientAction(action, jsonData) {
  channelActId++;
  return {
    id: channelActId,
    action: 'poke',
    ship: our,
    app: app,
    mark: 'bitcoin-client-action',
    json: { [action]: jsonData }
  };
}

function earthAddressJson(address) {
  return {
    'network-id': address['network-id'],
    address: address.address,
    port: Number(address.port)
  };
}

async function disconnectPeer(peer) {
  if (explorerState.pendingPeerDisconnects.has(peer.key)) return;

  const ban = explorerState.peerBanForms.get(peer.key);
  const isBanning = ban?.enabled === true;
  let action = 'disconnect-peer';
  let payload = earthAddressJson(peer.address);
  if (isBanning) {
    ban.error = null;
    const expiration = ban.noExpiration
      ? null
      : new Date(ban.expiration).getTime() - Date.now();
    if (expiration !== null && (!Number.isSafeInteger(expiration) || expiration <= 0)) {
      ban.error = 'Invalid time.';
      renderBitcoinExplorer();
      return;
    }
    action = 'ban-peer';
    payload = {
      'earth-address': payload,
      reason: ban.reason,
      // The action mark expects a duration in milliseconds, not an absolute time.
      expiration
    };
  }

  explorerState.pendingPeerDisconnects.add(peer.key);
  renderBitcoinExplorer();

  try {
    const response = await sendActions([
      makeBitcoinClientAction(action, payload)
    ]);
    if (!response.ok) {
      throw new Error(`${action} poke failed with status ${response.status}`);
    }
  } catch (error) {
    console.error(error);
    explorerState.pendingPeerDisconnects.delete(peer.key);
    if (isBanning) ban.error = 'Unable to ban peer. Please try again.';
    renderBitcoinExplorer();
  }
}

function makeAck(eventId) {
  channelActId++;
  return {
    id: channelActId,
    action: 'ack',
    "event-id": eventId
  };
}

function makeChannelDelete() {
  channelActId++;
  return {
    id: channelActId,
    action: 'delete'
  };
}

// Background Bitcoin scries/subscriptions keep caches current without
// rebuilding the Urbit page.  Observatory updates follow the same rule.
function renderBitcoinExplorer(...args) {
  if (explorerState.networkPage === 'bitcoin') renderExplorer(...args);
}

function renderUrbitExplorer(...args) {
  if (explorerState.networkPage === 'urbit') renderExplorer(...args);
}

function renderExplorer(scrollAnchor = captureHeaderScrollAnchor()) {
  const hadCometGraph = Boolean(document.querySelector('.comet-network'));
  const nextRoot = element('div', {
    key: 'explorer-root',
    attributes: { id: 'explorer-root' }
  }, [ExplorerApp(explorerState)]);
  const root = document.getElementById('explorer-root');

  if (!root) {
    document.body.replaceChildren(nextRoot);
  } else {
    reconcileNode(root, nextRoot);
  }

  restoreHeaderScrollAnchor(scrollAnchor);
  // Start near the default selection, but preserve the user's pan position
  // on subsequent selections and asynchronous peer-data updates.
  if (!hadCometGraph) {
    const viewport = document.querySelector('.comet-network');
    const selected = viewport?.querySelector('.comet-network__node--selected');
    if (viewport && explorerState.cometGraphScroll) {
      viewport.scrollLeft = explorerState.cometGraphScroll.left;
      viewport.scrollTop = explorerState.cometGraphScroll.top;
    } else if (selected) {
      viewport.scrollLeft = selected.offsetLeft - viewport.clientWidth / 2;
      viewport.scrollTop = selected.offsetTop - viewport.clientHeight / 2;
    }
  }
}

const renderEventListeners = Symbol('renderEventListeners');

function element(tagName, options = {}, children = []) {
  const node = document.createElement(tagName);
  const { key, className, text, attributes = {} } = options;

  if (key !== undefined) node.setAttribute('data-render-key', key);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;

  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }

  node.append(...children.filter(Boolean));
  return node;
}

function listen(node, type, listener, options) {
  node.addEventListener(type, listener, options);
  node[renderEventListeners] ??= [];
  node[renderEventListeners].push({ type, listener, options });
  return node;
}

function renderKey(node) {
  return node.nodeType === Node.ELEMENT_NODE
    ? node.getAttribute('data-render-key')
    : null;
}

function nodesMatch(currentNode, nextNode) {
  if (currentNode.nodeType !== nextNode.nodeType) return false;
  if (currentNode.nodeType !== Node.ELEMENT_NODE) return true;
  if (currentNode.tagName !== nextNode.tagName) return false;

  return renderKey(currentNode) === renderKey(nextNode);
}

function reconcileAttributes(currentElement, nextElement) {
  const preserveOpenState = currentElement.tagName === 'DETAILS' &&
    !nextElement.hasAttribute('open');

  for (const attribute of Array.from(currentElement.attributes)) {
    if (!nextElement.hasAttribute(attribute.name) &&
        !(preserveOpenState && attribute.name === 'open')) {
      currentElement.removeAttribute(attribute.name);
    }
  }

  for (const attribute of Array.from(nextElement.attributes)) {
    if (currentElement.getAttribute(attribute.name) !== attribute.value) {
      currentElement.setAttribute(attribute.name, attribute.value);
    }
  }

  if (currentElement instanceof HTMLInputElement &&
      currentElement.checked !== nextElement.checked) {
    currentElement.checked = nextElement.checked;
  }

  if ((currentElement instanceof HTMLInputElement ||
       currentElement instanceof HTMLTextAreaElement) &&
      currentElement.value !== nextElement.value) {
    currentElement.value = nextElement.value;
  }
}

function reconcileEventListeners(currentElement, nextElement) {
  for (const eventListener of currentElement[renderEventListeners] ?? []) {
    currentElement.removeEventListener(
      eventListener.type,
      eventListener.listener,
      eventListener.options
    );
  }

  const nextEventListeners = nextElement[renderEventListeners] ?? [];
  currentElement[renderEventListeners] = [];

  for (const eventListener of nextEventListeners) {
    listen(
      currentElement,
      eventListener.type,
      eventListener.listener,
      eventListener.options
    );
  }
}

function reconcileChildren(currentElement, nextElement) {
  const nextChildren = Array.from(nextElement.childNodes);
  // Prune expired keyed children before positioning the survivors.
  if (nextChildren.every((child) => renderKey(child) !== null) &&
      Array.from(currentElement.childNodes).every((child) => renderKey(child) !== null)) {
    const nextKeys = new Set(nextChildren.map(renderKey));
    for (const child of Array.from(currentElement.childNodes)) {
      if (!nextKeys.has(renderKey(child))) child.remove();
    }
  }
  const currentChildren = Array.from(currentElement.childNodes);
  const usedChildren = new Set();

  nextChildren.forEach((nextChild, index) => {
    const nextKey = renderKey(nextChild);
    let currentChild = null;

    if (nextKey !== null) {
      currentChild = currentChildren.find((child) =>
        !usedChildren.has(child) && renderKey(child) === nextKey
      ) ?? null;
    } else {
      const childAtIndex = currentChildren[index];
      if (childAtIndex &&
          !usedChildren.has(childAtIndex) &&
          renderKey(childAtIndex) === null) {
        currentChild = childAtIndex;
      }
    }

    if (!currentChild || !nodesMatch(currentChild, nextChild)) {
      currentElement.insertBefore(
        nextChild,
        currentElement.childNodes[index] ?? null
      );
      return;
    }

    usedChildren.add(currentChild);
    const childAtTargetIndex = currentElement.childNodes[index];
    if (childAtTargetIndex !== currentChild) {
      currentElement.insertBefore(currentChild, childAtTargetIndex ?? null);
    }
    reconcileNode(currentChild, nextChild);
  });

  for (const currentChild of currentChildren) {
    if (!usedChildren.has(currentChild) &&
        currentChild.parentNode === currentElement) {
      currentChild.remove();
    }
  }
}

function reconcileNode(currentNode, nextNode) {
  if (!nodesMatch(currentNode, nextNode)) {
    currentNode.replaceWith(nextNode);
    return nextNode;
  }

  if (currentNode.nodeType === Node.TEXT_NODE) {
    if (currentNode.nodeValue !== nextNode.nodeValue) {
      currentNode.nodeValue = nextNode.nodeValue;
    }
    return currentNode;
  }

  reconcileAttributes(currentNode, nextNode);
  reconcileEventListeners(currentNode, nextNode);
  reconcileChildren(currentNode, nextNode);
  return currentNode;
}

function updateFilterHeaderLine(height) {
  if (explorerState.networkPage !== 'bitcoin') return;
  const card = document.querySelector(
    `.block-header-card[data-block-height="${height}"]`
  );
  const line = card?.querySelector('.block-header-card__filter-header');
  if (!line) return;

  reconcileNode(line, FilterHeaderLine(height, `block-header:${card.dataset.blockHash}`));
}

function FilterHeaderLine(height, cardKey) {
  const filterHeader = explorerState.filterHeadersByHeight.get(height);
  return filterHeader
    ? element('p', {
      key: `${cardKey}:filter-header`,
      className: 'block-header-card__hash block-header-card__filter-header',
      text: `${filterHeader.slice(0, 6)}....${filterHeader.slice(-6)}`,
      attributes: { 'aria-label': `Filter header ${filterHeader}`, title: filterHeader }
    })
    : element('p', {
      key: `${cardKey}:filter-header`,
      className: 'block-header-card__hash block-header-card__filter-header block-header-card__filter-header--loading',
      attributes: { 'aria-label': 'Loading filter header', role: 'status' }
    }, Array.from({ length: 4 }, (_, index) => element('span', {
      key: `${cardKey}:filter-header:dot:${index}`,
      className: 'block-header-card__loading-dot',
      text: '.',
      attributes: { 'aria-hidden': 'true' }
    })));
}

function BlockHeaderCard(header, selectedBlock) {
  if (header.isPlaceholder) {
    return element('article', {
      key: `block-header-placeholder:${header.id}`,
      className: 'block-header-card block-header-card--placeholder',
      attributes: {
        'aria-hidden': 'true',
        ...(header.height !== undefined
          ? { 'data-block-height': header.height }
          : {})
      }
    }, [
      element('div', { className: 'block-header-card__height skeleton' }),
      element('div', { className: 'block-header-card__hash skeleton' }),
      element('div', { className: 'block-header-card__meta skeleton' })
    ]);
  }

  const isSelected = selectedBlock?.height === header.height &&
    selectedBlock.hash === header.hash;
  const isNew = header.height > (explorerState.highestViewedHeaderHeight ?? -1);
  const cardKey = `block-header:${header.hash}`;
  const card = element('article', {
    key: cardKey,
    className: `block-header-card${isSelected ? ' block-header-card--selected' : ''}${isNew ? ' block-header-card--new' : ''}`,
    attributes: {
      'data-block-hash': header.hash,
      'data-block-height': header.height,
      'aria-pressed': isSelected ? 'true' : 'false',
      'aria-label': `Select block ${header.height}`,
      role: 'button',
      tabindex: '0'
    }
  }, [
    element('p', {
      key: `${cardKey}:height`,
      className: 'block-header-card__height',
      text: Number(header.height).toLocaleString()
    }),
    element('div', {
      key: `${cardKey}:bytes`,
      className: 'block-header-card__bytes'
    }, [
      element('p', {
        key: `${cardKey}:hash`,
        className: 'block-header-card__hash',
        text: header.hash
      }),
      FilterHeaderLine(header.height, cardKey)
    ]),
    element('p', {
      key: `${cardKey}:time`,
      className: 'block-header-card__meta',
      text: formatBlockTime(header.time)
    })
  ]);

  listen(card, 'click', () => selectBlock(header));
  listen(card, 'keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    selectBlock(header);
  });

  return card;
}

function StatusModule() {
  const networkConnected = hasNetworkConnection(explorerState);
  const syncStatus = !networkConnected
    ? 'unsynced'
    : explorerState.isSynced ? 'synced' : 'syncing';
  const syncStatusLabel = syncStatus.charAt(0).toUpperCase() +
    syncStatus.slice(1);
  return element('div', {
    key: 'status-module',
    className: 'status-module',
    attributes: {
      role: 'status',
      'aria-live': 'polite'
    }
  }, [
    ...(explorerState.shipReconnecting ? [element('span', {
      key: 'status-module:reconnecting',
      className: 'status-module__item status-module__item--reconnecting',
      text: 'Reconnecting to ship'
    })] : [element('span', {
      key: 'status-module:network',
      className: `status-module__item status-module__item--network-${
        networkConnected ? 'connected' : 'disconnected'
      }`,
      text: explorerState.network
        ? `Bitcoin ${formatNetworkName(explorerState.network)}`
        : 'Bitcoin Network'
    }),
    element('span', {
      key: 'status-module:sync',
      className: `status-module__item status-module__item--${syncStatus}`,
      text: syncStatusLabel
    })])
  ]);
}

function BlockHeaderPanel(headers, selectedBlock) {
  const searchInput = element('input', {
    key: 'block-search-input',
    className: 'block-search',
    attributes: {
      type: 'search',
      name: 'block-search',
      value: explorerState.headerSearchQuery,
      placeholder: 'Search by block height or block hash',
      'aria-label': 'Search by block height or block hash',
      'aria-describedby': 'block-search-error',
      'aria-invalid': explorerState.headerSearchError ? 'true' : 'false',
      autocomplete: 'off',
      spellcheck: 'false',
      ...(explorerState.pendingHeaderSearch ? { disabled: '' } : {})
    }
  });
  listen(searchInput, 'input', (event) => {
    explorerState.headerSearchQuery = event.currentTarget.value;
    explorerState.headerSearchError = null;
    event.currentTarget.setAttribute('aria-invalid', 'false');
    const error = document.getElementById('block-search-error');
    if (error) error.textContent = '';
  });

  const searchForm = element('form', {
    key: 'block-search-form',
    className: 'block-search-form',
    attributes: { role: 'search' }
  }, [
    searchInput,
    element('span', {
      key: 'block-search-error',
      className: 'block-search-error',
      text: explorerState.headerSearchError ?? '',
      attributes: {
        id: 'block-search-error',
        'aria-live': 'polite'
      }
    })
  ]);
  listen(searchForm, 'submit', handleHeaderSearch);

  const headerRow = element('div', {
    key: 'block-header-row',
    className: 'block-header-row',
    attributes: {
      role: 'group',
      'aria-label': 'Block headers'
    }
  }, headers.map((header) => BlockHeaderCard(header, selectedBlock)));
  const bestBlockButton = element('button', {
    key: 'best-block-button',
    className: 'block-header-tip-button',
    attributes: {
      type: 'button',
      'aria-label': explorerState.bestBlock
        ? `Jump to best block ${explorerState.bestBlock.height}`
        : 'Jump to the best block',
      title: 'Jump to the best block',
      hidden: ''
    }
  }, [
    element('span', {
      key: 'best-block-button:arrow',
      className: 'block-header-tip-button__arrow',
      text: '◁',
      attributes: { 'aria-hidden': 'true' }
    }),
    element('span', {
      key: 'best-block-button:height',
      className: 'block-header-tip-button__height',
      text: explorerState.bestBlock
        ? Number(explorerState.bestBlock.height).toLocaleString()
        : '—'
    })
  ]);
  listen(bestBlockButton, 'click', selectBestBlock);
  listen(
    headerRow,
    'scroll',
    (event) => {
      const currentHeaderRow = event.currentTarget;
      const currentBestBlockButton = currentHeaderRow.parentElement
        ?.querySelector('.block-header-tip-button');
      handleHeaderPanelScroll(currentHeaderRow);
      if (currentBestBlockButton) {
        updateBestBlockButtonVisibility(
          currentHeaderRow,
          currentBestBlockButton
        );
      }
    },
    { passive: true }
  );
  requestAnimationFrame(() => {
    const currentHeaderRow = document.querySelector('.block-header-row');
    updateViewedHeaderHeight();
    const currentBestBlockButton = document.querySelector(
      '.block-header-tip-button'
    );
    if (currentHeaderRow && currentBestBlockButton) {
      updateBestBlockButtonVisibility(
        currentHeaderRow,
        currentBestBlockButton
      );
    }
  });

  const headerViewport = element('div', {
    key: 'block-header-viewport',
    className: 'block-header-viewport'
  }, [
    headerRow,
    bestBlockButton
  ]);

  return element('section', {
    key: 'block-header-panel',
    className: 'panel block-header-panel',
    attributes: { 'aria-label': 'Block headers' }
  }, [
    element('header', {
      key: 'block-header-panel:controls',
      className: 'panel__header'
    }, [
      searchForm,
      StatusModule()
    ]),
    headerViewport
  ]);
}

function BlockDetailField(label, value, key) {
  return element('div', {
    key,
    className: 'block-detail-field'
  }, [
    element('dt', {
      key: `${key}:label`,
      className: 'block-detail-field__label',
      text: label
    }),
    element('dd', {
      key: `${key}:value`,
      className: 'block-detail-field__value',
      text: value
    })
  ]);
}

function BlockHeaderData(block, bestBlock) {
  const blockKey = `block:${block.hash}`;
  const confirmations = bestBlock && block.height <= bestBlock.height
    ? bestBlock.height - block.height + 1
    : null;

  return element('div', {
    key: `${blockKey}:details`,
    className: 'block-details'
  }, [
    element('section', {
      key: `${blockKey}:chain-data`,
      className: 'block-details__section block-details__section--chain',
      attributes: { 'aria-label': 'Chain data' }
    }, [
      element('dl', { className: 'block-detail-list' }, [
        BlockDetailField(
          'Confirmations',
          confirmations === null ? 'Unavailable' : String(confirmations),
          `${blockKey}:confirmations`
        ),
        BlockDetailField(
          'Chainwork',
          block.chainwork,
          `${blockKey}:chainwork`
        )
      ])
    ]),
    element('section', {
      key: `${blockKey}:header-data`,
      className: 'block-details__section',
      attributes: { 'aria-labelledby': 'block-header-fields-title' }
    }, [
      element('h3', {
        key: `${blockKey}:header-data:title`,
        className: 'block-details__title',
        text: 'Block header',
        attributes: { id: 'block-header-fields-title' }
      }),
      element('dl', { className: 'block-detail-list' }, [
        BlockDetailField(
          'Version',
          block.version,
          `${blockKey}:version`
        ),
        BlockDetailField(
          'Previous block hash',
          block.previousBlockHash,
          `${blockKey}:previous-block-hash`
        ),
        BlockDetailField(
          'Merkle root',
          block.merkleRoot,
          `${blockKey}:merkle-root`
        ),
        BlockDetailField(
          'Time',
          `${block.time} · ${formatBlockTime(block.time)}`,
          `${blockKey}:time`
        ),
        BlockDetailField('Bits', block.bits, `${blockKey}:bits`),
        BlockDetailField('Nonce', block.nonce, `${blockKey}:nonce`)
      ])
    ])
  ]);
}

function TransactionInput(input, index, transactionKey) {
  const inputKey = `${transactionKey}:input:${index}`;
  return element('li', {
    key: inputKey,
    className: 'transaction-io__item'
  }, [
    element('span', {
      key: `${inputKey}:label`,
      className: 'transaction-io__index',
      text: `Input ${index + 1}`
    }),
    element('code', {
      key: `${inputKey}:value`,
      className: 'transaction-io__value',
      text: `${input.txid}:${input.vout}`
    })
  ]);
}

function TransactionOutput(output, index, transactionKey) {
  const outputKey = `${transactionKey}:output:${index}`;
  return element('li', {
    key: outputKey,
    className: 'transaction-io__item'
  }, [
    element('span', {
      key: `${outputKey}:label`,
      className: 'transaction-io__index',
      text: `Output ${index + 1} · ${Number(output.value).toLocaleString()} sats`
    }),
    element('code', {
      key: `${outputKey}:value`,
      className: 'transaction-io__value',
      text: output['script-pubkey']
    })
  ]);
}

function TransactionCard(transaction, index, blockHash) {
  const inputs = transaction.inputs ?? [];
  const outputs = transaction.outputs ?? [];
  const transactionKey = `block:${blockHash}:transaction:${index}`;

  return element('details', {
    key: transactionKey,
    className: 'transaction-card'
  }, [
    element('summary', {
      key: `${transactionKey}:summary`,
      className: 'transaction-card__summary'
    }, [
      element('span', {
        key: `${transactionKey}:title`,
        className: 'transaction-card__title',
        text: `Transaction ${index}`
      }),
      element('span', {
        key: `${transactionKey}:counts`,
        className: 'transaction-card__counts',
        text: `${inputs.length} inputs · ${outputs.length} outputs`
      })
    ]),
    element('div', {
      key: `${transactionKey}:body`,
      className: 'transaction-card__body'
    }, [
      element('p', {
        key: `${transactionKey}:metadata`,
        className: 'transaction-card__meta',
        text: `Version ${transaction.version} · Locktime ${transaction.locktime}`
      }),
      element('h4', {
        key: `${transactionKey}:inputs:title`,
        className: 'transaction-io__title',
        text: 'Inputs'
      }),
      element('ul', {
        key: `${transactionKey}:inputs`,
        className: 'transaction-io'
      }, inputs.map((input, inputIndex) =>
        TransactionInput(input, inputIndex, transactionKey))),
      element('h4', {
        key: `${transactionKey}:outputs:title`,
        className: 'transaction-io__title',
        text: 'Outputs'
      }),
      element('ul', {
        key: `${transactionKey}:outputs`,
        className: 'transaction-io'
      }, outputs.map((output, outputIndex) =>
        TransactionOutput(output, outputIndex, transactionKey)))
    ])
  ]);
}

function changeTransactionPage(page, pageCount) {
  const block = getSelectedBlock();
  if (!block) return;
  explorerState.blockTransactionPages.set(
    block.hash, Math.max(0, Math.min(page, pageCount - 1))
  );
  renderBitcoinExplorer();
}

function TransactionPaginationButton(key, label, text, disabled, onClick) {
  const button = element('button', {
    key,
    className: 'transaction-pagination__button',
    text,
    attributes: {
      type: 'button',
      'aria-label': label,
      ...(disabled ? { disabled: '' } : {})
    }
  });

  if (!disabled) listen(button, 'click', onClick);
  return button;
}

function TransactionsHeader(blockHash, count = null) {
  return element('header', {
      key: `block:${blockHash}:transactions:header`,
      className: 'block-transactions__header'
    }, [
      element('h3', {
        key: `block:${blockHash}:transactions:title`,
        className: 'block-transactions__title',
        text: 'Transactions',
        attributes: { id: 'block-transactions-title' }
      }),
      element('span', {
        key: `block:${blockHash}:transactions:count`,
        className: 'block-transactions__count',
        text: count === null ? '' : String(count)
      })
    ]);
}

function TransactionList(transactions, currentPage, blockHash) {
  const pageCount = Math.max(
    1,
    Math.ceil(transactions.length / transactionBatchSize)
  );
  const page = Math.min(currentPage, pageCount - 1);
  const firstTransaction = page * transactionBatchSize;
  const visibleTransactions = transactions.slice(
    firstTransaction,
    firstTransaction + transactionBatchSize
  );

  return element('section', {
    key: `block:${blockHash}:transactions`,
    className: 'block-transactions',
    attributes: { 'aria-labelledby': 'block-transactions-title' }
  }, [
    TransactionsHeader(blockHash, transactions.length),
    element('div', {
      key: `block:${blockHash}:transaction-list`,
      className: 'transaction-list'
    },
      visibleTransactions.map((transaction, index) =>
        TransactionCard(transaction, firstTransaction + index, blockHash))),
    element('nav', {
      key: `block:${blockHash}:transaction-pagination`,
      className: 'transaction-pagination',
      attributes: { 'aria-label': 'Transaction pages' }
    }, [
      TransactionPaginationButton(
        `block:${blockHash}:transactions:previous`,
        'Previous transactions',
        '←',
        page === 0,
        () => changeTransactionPage(page - 1, pageCount)
      ),
      element('span', {
        key: `block:${blockHash}:transactions:page`,
        className: 'transaction-pagination__status',
        text: `${page + 1} / ${pageCount}`,
        attributes: { 'aria-live': 'polite' }
      }),
      TransactionPaginationButton(
        `block:${blockHash}:transactions:next`,
        'Next transactions',
        '→',
        page === pageCount - 1,
        () => changeTransactionPage(page + 1, pageCount)
      )
    ])
  ]);
}

function BlockLoadingIndicator(blockHash) {
  const dots = Array.from({ length: 4 }, (_, index) => [index, 0]);
  return element('section', {
    key: `block:${blockHash}:transactions`,
    className: 'block-transactions',
    attributes: { 'aria-labelledby': 'block-transactions-title' }
  }, [
    TransactionsHeader(blockHash),
    element('div', {
      key: `block:${blockHash}:loading`,
      className: 'block-data-loading',
      attributes: { role: 'status', 'aria-label': 'Loading transactions' }
    }, [element('span', {
      key: `block:${blockHash}:loading:dots`,
      className: 'block-data-loading__dots',
      attributes: { 'aria-hidden': 'true' }
    }, dots.map(([column, row], index) => element('span', {
      key: `block:${blockHash}:loading:dot:${index}`,
      className: 'block-data-loading__dot',
      text: '■',
      attributes: {
        style: `grid-column: ${column + 1}; grid-row: ${row + 1}; animation-delay: ${index * 0.15 - 0.6}s`
      }
    })))])
  ]);
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through for browsers that expose but deny the Clipboard API.
    }
  }

  const textarea = element('textarea', {
    attributes: {
      readonly: '',
      'aria-hidden': 'true'
    }
  });
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();

  if (!copied) throw new Error('Clipboard copy failed');
}

function CopyBlockHashButton(blockHash) {
  const button = element('button', {
    key: `block:${blockHash}:copy-hash`,
    className: 'block-data-panel__copy',
    text: 'Copy',
    attributes: {
      type: 'button',
      'aria-label': 'Copy block hash',
      'aria-live': 'polite'
    }
  });

  listen(button, 'click', async (event) => {
    const copyButton = event.currentTarget;
    try {
      await copyTextToClipboard(blockHash);
      copyButton.textContent = 'Copied';
    } catch (error) {
      copyButton.textContent = 'Copy failed';
    }

    setTimeout(() => {
      if (copyButton.isConnected) copyButton.textContent = 'Copy';
    }, 1_500);
  });

  return button;
}

function addressBytes(hexAddress) {
  const hex = String(hexAddress ?? '').replace(/^0x/i, '');
  if (hex.length === 0 || hex.length % 2 !== 0 ||
      !/^[0-9a-f]+$/i.test(hex)) return null;

  return Array.from(
    { length: hex.length / 2 },
    (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  );
}

function formatIpv6Address(bytes) {
  if (bytes.length !== 16) return null;
  const groups = Array.from({ length: 8 }, (_, index) =>
    ((bytes[index * 2] << 8) | bytes[index * 2 + 1]).toString(16));
  let longestStart = -1;
  let longestLength = 0;

  for (let index = 0; index < groups.length;) {
    if (groups[index] !== '0') {
      index++;
      continue;
    }

    let end = index;
    while (end < groups.length && groups[end] === '0') end++;
    if (end - index > longestLength) {
      longestStart = index;
      longestLength = end - index;
    }
    index = end;
  }

  if (longestLength < 2) return groups.join(':');
  const before = groups.slice(0, longestStart).join(':');
  const after = groups.slice(longestStart + longestLength).join(':');
  return `${before}::${after}`;
}

function formatBase32(bytes) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0;
  let bitCount = 0;
  let encoded = '';

  for (const byte of bytes) {
    bits = (bits << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      encoded += alphabet[(bits >>> (bitCount - 5)) & 31];
      bitCount -= 5;
    }
    bits &= (1 << bitCount) - 1;
  }

  if (bitCount > 0) encoded += alphabet[(bits << (5 - bitCount)) & 31];
  return encoded;
}

function formatPeerAddress(address) {
  const networkId = address['network-id'];
  const bytes = addressBytes(address.address);
  if (!bytes) return address.address ?? 'Unknown';

  if (networkId === 'ipv4' && bytes.length === 4) {
    return bytes.join('.');
  }
  if (networkId === 'ipv6' ||
      networkId === 'cjdns' ||
      networkId === 'yggdrasil') {
    return formatIpv6Address(bytes) ?? address.address;
  }
  if (networkId === 'torv2') return `${formatBase32(bytes)}.onion`;
  if (networkId === 'torv3') return formatBase32(bytes);
  if (networkId === 'i2p') return `${formatBase32(bytes)}.b32.i2p`;
  return address.address;
}

function peerEndpoint(address) {
  const networkId = address['network-id'];
  const host = formatPeerAddress(address);
  const isIpv6Address = networkId === 'ipv6' ||
    networkId === 'cjdns' ||
    networkId === 'yggdrasil';
  return `${isIpv6Address ? `[${host}]` : host}:${address.port}`;
}

function activePeerServices(services = {}) {
  return Object.entries(peerServiceLabels)
    .filter(([service]) => services[service])
    .map(([, label]) => label);
}

function formatPeerTimestamp(timestamp) {
  if (timestamp === null || timestamp === undefined) return 'Unavailable';
  return formatBlockTime(Number(timestamp));
}

function formatPingAverage(milliseconds) {
  if (milliseconds === null || milliseconds === undefined) {
    return 'Unavailable';
  }

  const value = Number(milliseconds);
  return Number.isFinite(value) ? `${value.toLocaleString()} ms` : 'Unavailable';
}

function PeerDetailField(peerRenderKey, field, label, value) {
  const fieldKey = `${peerRenderKey}:${field}`;
  return element('div', {
    key: fieldKey,
    className: 'peer-card__field'
  }, [
    element('dt', {
      key: `${fieldKey}:label`,
      text: label
    }),
    element('dd', {
      key: `${fieldKey}:value`,
      text: value
    })
  ]);
}

function BanControls(peer, actionButton, {
  drafts = explorerState.peerBanForms, prefix = 'peer', label = 'Ban peer',
  alwaysVisible = false
} = {}) {
  const formKey = `${prefix}:${peer.key}:ban`;
  if (!drafts.has(peer.key)) {
    drafts.set(peer.key, {
      enabled: false, reason: '', noExpiration: true, expiration: ''
    });
  }
  const draft = drafts.get(peer.key);
  const checkbox = (name, label, checked, onChange) => {
    const input = element('input', {
      key: `${formKey}:${name}:input`,
      attributes: { type: 'checkbox', ...(checked ? { checked: '' } : {}) }
    });
    listen(input, 'change', (event) => {
      onChange(event.currentTarget.checked);
      draft.error = null;
      renderBitcoinExplorer();
    });
    return element('label', {
      key: `${formKey}:${name}`,
      className: 'peer-ban-form__checkbox'
    }, [input, element('span', { text: label })]);
  };
  const enable = alwaysVisible ? element('button', {
    key: `${formKey}:ban-button`,
    className: 'address-row__ban-button', text: 'Ban',
    attributes: { type: 'button', disabled: '', title: 'Ban is not implemented yet' }
  }) : checkbox('enabled', label, draft.enabled, (checked) => {
    draft.enabled = checked;
  });

  const reason = element('input', {
    key: `${formKey}:reason:input`,
    attributes: {
      type: 'text', value: draft.reason, placeholder: 'Reason for ban', 'aria-label': 'Ban reason'
    }
  });
  listen(reason, 'input', (event) => { draft.reason = event.currentTarget.value; });
  const expiration = element('input', {
    key: `${formKey}:expiration:input`,
    attributes: {
      type: 'datetime-local', value: draft.expiration, 'aria-label': 'Expiration (local time)',
      ...(draft.noExpiration ? { disabled: '' } : {})
    }
  });
  listen(expiration, 'input', (event) => { draft.expiration = event.currentTarget.value; });
  const form = element('form', {
    key: formKey,
    className: 'peer-ban-form',
    attributes: { 'aria-label': `Ban settings for ${peerEndpoint(peer.address)}` }
  }, [
    element('div', {
      key: `${formKey}:actions`, className: 'peer-ban-form__actions'
    }, [actionButton, enable]),
    (alwaysVisible || draft.enabled) && element('div', {
      key: `${formKey}:fields`, className: 'peer-ban-form__fields'
    }, [element('label', { key: `${formKey}:reason`, className: 'peer-ban-form__field' }, [
      reason
    ]),
    checkbox('no-expiration', 'No expiration', draft.noExpiration, (checked) => {
      draft.noExpiration = checked;
    }),
    element('label', { key: `${formKey}:expiration`, className: 'peer-ban-form__field' }, [
      expiration
    ]),
    draft.error && element('p', {
      key: `${formKey}:error`, className: 'peer-ban-form__error',
      text: draft.error, attributes: { role: 'alert' }
    })])
  ]);
  listen(form, 'submit', (event) => event.preventDefault());
  return form;
}

function PeerCard(peer) {
  const { key, address, info } = peer;
  const isActive = info['handshake-done'] === true;
  const lastHeard = info['last-heard'];
  const connectionOpened = info['connection-opened'];
  const pingAverage = info['ping-average'];
  const services = [
    ...activePeerServices(info.services),
    ...(info.wtxidrelay ? ['WTXID relay'] : [])
  ];
  const peerRenderKey = `peer:${key}`;
  const isDisconnecting = explorerState.pendingPeerDisconnects.has(key);
  const isSettingsOpen = explorerState.peerSettingsOpen.has(key);
  const disconnectLabel = 'Disconnect';
  const settingsButton = element('button', {
    key: `${peerRenderKey}:settings`,
    className: 'peer-card__settings',
    text: '⚙',
    attributes: {
      type: 'button',
      title: isSettingsOpen ? 'Close peer settings' : 'Peer settings',
      'aria-label': `Settings for ${peerEndpoint(address)}`,
      'aria-expanded': String(isSettingsOpen),
      'aria-pressed': String(isSettingsOpen)
    }
  });
  listen(settingsButton, 'click', () => {
    if (explorerState.peerSettingsOpen.has(key)) explorerState.peerSettingsOpen.delete(key);
    else explorerState.peerSettingsOpen.add(key);
    renderBitcoinExplorer();
  });
  const disconnectButton = element('button', {
    key: `${peerRenderKey}:disconnect`,
    className: 'peer-card__disconnect',
    attributes: {
      type: 'button',
      title: `${disconnectLabel} ${peerEndpoint(address)}`,
      'aria-label': `${disconnectLabel} ${peerEndpoint(address)}`,
      ...(isDisconnecting ? {
        disabled: '',
        'aria-busy': 'true'
      } : {})
    }
  }, [
    isDisconnecting
      ? element('span', {
          key: `${peerRenderKey}:disconnect:spinner`,
          className: 'peer-card__disconnect-spinner',
          attributes: { 'aria-hidden': 'true' }
        })
      : element('span', {
          key: `${peerRenderKey}:disconnect:label`,
          text: disconnectLabel
        })
  ]);
  listen(disconnectButton, 'click', () => disconnectPeer(peer));

  return element('article', {
    key: peerRenderKey,
    className: `peer-card${isActive ? '' : ' peer-card--connecting'}`,
    attributes: {
      'aria-label': `${peerEndpoint(address)}, ${
        isActive ? 'active' : 'connecting'
      }`
    }
  }, [
    element('header', {
      key: `${peerRenderKey}:header`,
      className: 'peer-card__header'
    }, [
      element('span', {
        key: `${peerRenderKey}:connection-light`,
        className: `peer-card__connection-light peer-card__connection-light--${
          isActive ? 'active' : 'connecting'
        }`,
        attributes: { 'aria-hidden': 'true' }
      }),
      element('span', {
        key: `${peerRenderKey}:network-id`,
        className: 'peer-card__network-id',
        text: String(address['network-id'] ?? 'unknown').toUpperCase()
      }),
      element('code', {
        key: `${peerRenderKey}:endpoint`,
        className: 'peer-card__endpoint',
        text: peerEndpoint(address)
      }),
      settingsButton
    ]),
    ...(isSettingsOpen ? [element('div', {
      key: `${peerRenderKey}:settings-actions`,
      className: 'peer-card__settings-actions'
    }, [
      BanControls(peer, disconnectButton)
    ])] : [element('dl', {
      key: `${peerRenderKey}:metadata`,
      className: 'peer-card__metadata'
    }, [
      PeerDetailField(
        peerRenderKey,
        'connection-opened',
        'Connected',
        formatPeerTimestamp(connectionOpened)
      ),
      PeerDetailField(
        peerRenderKey,
        'last-heard',
        'Last heard',
        formatPeerTimestamp(lastHeard)
      ),
      PeerDetailField(
        peerRenderKey,
        'ping-average',
        'Ping',
        formatPingAverage(pingAverage)
      )
    ]),
    element('div', {
      key: `${peerRenderKey}:services`,
      className: 'peer-card__services',
      attributes: { 'aria-label': 'Advertised services' }
    }, (services.length > 0 ? services : ['No services']).map((service) =>
      element('span', {
        key: `${peerRenderKey}:service:${service}`,
        className: 'peer-card__service',
        text: service
      })))])
  ]);
}

function formatAddressProvenance(provenance) {
  if (!provenance || typeof provenance.type !== 'string') return 'Unknown';
  if (provenance.type === 'userspace') return 'Userspace';
  if (provenance.type === 'network' && provenance.who) {
    return `Network · ${peerEndpoint(provenance.who)}`;
  }
  return provenance.type;
}

function formatDuration(milliseconds) {
  const value = Number(milliseconds);
  if (!Number.isFinite(value) || value < 0) return 'Unavailable';
  if (value < 1_000) return `${value.toLocaleString()} ms`;

  const seconds = Math.floor(value / 1_000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr`;
  return `${Math.floor(hours / 24)} d`;
}

async function connectAddress(entry) {
  if (explorerState.pendingPeerConnects.has(entry.key) ||
      explorerState.peers?.has(entry.key)) return;

  explorerState.pendingPeerConnects.add(entry.key);
  renderBitcoinExplorer();
  try {
    const response = await sendActions([
      makeBitcoinClientAction('connect-peer', earthAddressJson(entry.address))
    ]);
    if (!response.ok) {
      throw new Error(`Connect poke failed with status ${response.status}`);
    }
  } catch (error) {
    console.error(error);
  } finally {
    explorerState.pendingPeerConnects.delete(entry.key);
    renderBitcoinExplorer();
  }
}

async function removeAddress(entry) {
  if (explorerState.pendingAddressRemovals.has(entry.key)) return;
  const ban = explorerState.addressBanForms.get(entry.key);
  const isBanning = ban?.enabled === true;
  let action = 'del-address';
  let payload = earthAddressJson(entry.address);
  if (isBanning) {
    ban.error = null;
    const expiration = ban.noExpiration
      ? null
      : new Date(ban.expiration).getTime() - Date.now();
    if (expiration !== null && (!Number.isSafeInteger(expiration) || expiration <= 0)) {
      ban.error = 'Invalid time.';
      renderBitcoinExplorer();
      return;
    }
    action = 'ban-peer';
    payload = { 'earth-address': payload, reason: ban.reason, expiration };
  }

  explorerState.pendingAddressRemovals.add(entry.key);
  renderBitcoinExplorer();
  try {
    const response = await sendActions([makeBitcoinClientAction(action, payload)]);
    if (!response.ok) {
      throw new Error(`${action} poke failed with status ${response.status}`);
    }
  } catch (error) {
    console.error(error);
    if (isBanning) ban.error = 'Unable to ban address. Please try again.';
  } finally {
    explorerState.pendingAddressRemovals.delete(entry.key);
    renderBitcoinExplorer();
  }
}

function AddressCard(entry, peer = null) {
  const isConnected = peer !== null;
  const connectionStatus = peer?.info['handshake-done'] === true ? 'Connected' : 'Connecting';
  const { key, address, info } = entry;
  const rowKey = `address:${key}`;
  const rank = info['address-rank'] ?? 'unknown';
  const isSettingsOpen = explorerState.addressSettingsOpen.has(key);
  const settingsButton = element('button', {
    key: `${rowKey}:settings`,
    className: 'peer-card__settings address-row__settings',
    text: '⚙',
    attributes: {
      type: 'button', 'aria-label': `Settings for ${peerEndpoint(address)}`,
      'aria-expanded': String(isSettingsOpen), 'aria-pressed': String(isSettingsOpen)
    }
  });
  listen(settingsButton, 'click', () => {
    if (explorerState.addressSettingsOpen.has(key)) explorerState.addressSettingsOpen.delete(key);
    else explorerState.addressSettingsOpen.add(key);
    renderBitcoinExplorer();
  });
  const isConnecting = explorerState.pendingPeerConnects.has(key);
  const connectButton = element('button', {
    key: `${rowKey}:connect`, className: 'peer-card__disconnect address-row__connect',
    text: isConnecting ? 'Connecting…' : 'Connect',
    attributes: {
      type: 'button',
      ...(isConnecting || isConnected ? { disabled: '' } : {}),
      ...(isConnecting ? { 'aria-busy': 'true' } : {})
    }
  });
  listen(connectButton, 'click', () => connectAddress(entry));
  const isRemoving = explorerState.pendingAddressRemovals.has(key);
  const removeButton = element('button', {
    key: `${rowKey}:remove`, className: 'address-row__ban-button',
    text: isRemoving ? 'Removing…' : 'Remove',
    attributes: {
      type: 'button',
      ...(isRemoving ? { disabled: '', 'aria-busy': 'true' } : {})
    }
  });
  listen(removeButton, 'click', () => removeAddress(entry));
  const fields = [
    ['type', String(address['network-id'] ?? 'unknown').toUpperCase()],
    ['value', peerEndpoint(address)],
    ...(isSettingsOpen ? [] : isConnected
      ? [['connected', connectionStatus]]
      : [
        ['last-heard', `Last heard: ${formatPeerTimestamp(info['last-heard'])}`],
        ['source', `Source: ${formatAddressProvenance(info['address-provenance'])}`]
      ])
  ];

  return element('article', {
    key: rowKey,
    className: `address-row${isConnected ? ' address-row--connected' : ''}`,
    attributes: { 'aria-label': `${peerEndpoint(address)}${isConnected ? `, ${connectionStatus.toLowerCase()}` : ''}` }
  }, [
    element('span', {
      key: `${rowKey}:rank`,
      className: `address-row__rank network-entry-card__badge network-entry-card__badge--${rank}`,
      text: String(rank).toUpperCase(),
      attributes: { 'aria-label': `Address rank: ${rank}` }
    }),
    ...fields.map(([field, value]) => element('span', {
      key: `${rowKey}:${field}`,
      className: `address-row__${field}`,
      text: value,
      attributes: { title: `${field}: ${value}` }
    })),
    isSettingsOpen && element('div', {
      key: `${rowKey}:settings-controls`, className: 'address-row__controls'
    }, [BanControls(entry, removeButton, {
      drafts: explorerState.addressBanForms, prefix: 'address', label: 'Ban address'
    })]),
    isSettingsOpen && !isConnected && connectButton,
    settingsButton
  ]);
}

async function unbanPeer(entry) {
  if (explorerState.pendingPeerUnbans.has(entry.key)) return;
  explorerState.pendingPeerUnbans.add(entry.key);
  renderBitcoinExplorer();
  try {
    const response = await sendActions([
      makeBitcoinClientAction('unban-peer', earthAddressJson(entry.address))
    ]);
    if (!response.ok) {
      throw new Error(`Unban poke failed with status ${response.status}`);
    }
  } catch (error) {
    console.error(error);
    explorerState.pendingPeerUnbans.delete(entry.key);
    renderBitcoinExplorer();
  }
}

function BlacklistCard(entry) {
  const { key, address, info } = entry;
  const rowKey = `blacklist:${key}`;
  const isSettingsOpen = explorerState.blacklistSettingsOpen.has(key);
  const isUnbanning = explorerState.pendingPeerUnbans.has(key);
  const unbanButton = element('button', {
    key: `${rowKey}:unban`, className: 'peer-card__disconnect blacklist-row__unban',
    text: isUnbanning ? 'Unbanning…' : 'Unban',
    attributes: {
      type: 'button',
      ...(isUnbanning ? { disabled: '', 'aria-busy': 'true' } : {})
    }
  });
  listen(unbanButton, 'click', () => unbanPeer(entry));
  const settingsButton = element('button', {
    key: `${rowKey}:settings`,
    className: 'peer-card__settings blacklist-row__settings',
    text: '⚙',
    attributes: {
      type: 'button', 'aria-label': `Settings for blacklisted ${peerEndpoint(address)}`,
      'aria-expanded': String(isSettingsOpen), 'aria-pressed': String(isSettingsOpen)
    }
  });
  listen(settingsButton, 'click', () => {
    if (explorerState.blacklistSettingsOpen.has(key)) explorerState.blacklistSettingsOpen.delete(key);
    else explorerState.blacklistSettingsOpen.add(key);
    renderBitcoinExplorer();
  });
  const duration = info.expiration === null || info.expiration === undefined
    ? 'Permanent'
    : formatDuration(info.expiration);
  const fields = [
    ['type', String(address['network-id'] ?? 'unknown').toUpperCase()],
    ['value', peerEndpoint(address)],
    ['reason', info.reason || 'No reason provided'],
    ...(isSettingsOpen ? [] : [
      ['when', `Blacklisted: ${formatPeerTimestamp(info.when)}`],
      ['duration', `Duration: ${duration}`]
    ])
  ];

  return element('article', {
    key: rowKey,
    className: 'blacklist-row',
    attributes: { 'aria-label': `Blacklisted ${peerEndpoint(address)}` }
  }, [
    ...fields.map(([field, value]) => element('span', {
      key: `${rowKey}:${field}`,
      className: `blacklist-row__${field}`,
      text: value,
      attributes: { title: `${field}: ${value}` }
    })),
    isSettingsOpen && unbanButton,
    settingsButton
  ]);
}

function selectPeerPanelTab(tab, focus = false) {
  if (explorerState.selectedTab.type === tab) return;
  explorerState.selectedTab = { type: tab };
  renderBitcoinExplorer();
  if (focus) {
    requestAnimationFrame(() => {
      document.getElementById(`peers-panel-tab-${tab}`)?.focus();
    });
  }
}

function PeerPanelTab(tab, label) {
  const isSelected = explorerState.selectedTab.type === tab;
  const button = element('button', {
    key: `peers-panel:tab:${tab}`,
    className: `peers-panel__tab${
      isSelected ? ' peers-panel__tab--selected' : ''
    }`,
    text: label,
    attributes: {
      id: `peers-panel-tab-${tab}`,
      type: 'button',
      role: 'tab',
      'aria-selected': isSelected ? 'true' : 'false',
      'aria-controls': 'explorer-data-content',
      tabindex: isSelected || (getSelectedBlock() && tab === 'peers') ? '0' : '-1'
    }
  });
  listen(button, 'click', () => selectPeerPanelTab(tab));
  listen(button, 'keydown', (event) => {
    const tabs = ['peers', 'addresses', 'blacklist', 'config'];
    const currentIndex = tabs.indexOf(tab);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else return;

    event.preventDefault();
    selectPeerPanelTab(tabs[nextIndex], true);
  });
  return button;
}

function PeerPanelEmpty(tab, source, emptyText) {
  return element('div', {
    key: `peers-panel:${tab}:empty`,
    className: 'peers-panel__empty',
    attributes: {
      id: `peers-panel-content-${tab}`,
      role: 'tabpanel',
      'aria-labelledby': `peers-panel-tab-${tab}`
    }
  }, [
    element('span', {
      key: `peers-panel:${tab}:empty:indicator`,
      className: 'peers-panel__empty-indicator',
      attributes: { 'aria-hidden': 'true' }
    }),
    element('p', {
      key: `peers-panel:${tab}:empty:copy`,
      text: source === null ? 'No peers connected.' : emptyText
    })
  ]);
}

function changePeerPanelPage(tab, page, pageCount) {
  explorerState[peerPageStateKey(tab)] = Math.max(
    0,
    Math.min(page, pageCount - 1)
  );
  renderBitcoinExplorer();
}

function peerPageStateKey(tab) {
  return { peers: 'peersPage', addresses: 'addressesPage', blacklist: 'blacklistPage' }[tab];
}

function PeerPanelPage(tab, entries, renderEntry) {
  const pageCount = Math.max(1, Math.ceil(entries.length / peerPanelBatchSize));
  const page = Math.min(explorerState[peerPageStateKey(tab)], pageCount - 1);
  explorerState[peerPageStateKey(tab)] = page;
  const firstEntry = page * peerPanelBatchSize;
  const visibleEntries = entries.slice(
    firstEntry,
    firstEntry + peerPanelBatchSize
  );

  return element('div', {
    key: `peers-panel:${tab}:page`,
    className: 'peers-panel__page',
    attributes: {
      id: `peers-panel-content-${tab}`,
      role: 'tabpanel',
      'aria-labelledby': `peers-panel-tab-${tab}`
    }
  }, [
    element('div', {
      key: `peers-panel:${tab}:list`,
      className: `peers-panel__list${tab !== 'peers' ? ' peers-panel__list--rows' : ''}`
    }, visibleEntries.map(renderEntry)),
    element('nav', {
      key: `peers-panel:${tab}:pagination`,
      className: 'transaction-pagination peers-panel__pagination',
      attributes: { 'aria-label': `${tab} pages` }
    }, [
      TransactionPaginationButton(
        `peers-panel:${tab}:previous`,
        `Previous ${tab}`,
        '←',
        page === 0,
        () => changePeerPanelPage(tab, page - 1, pageCount)
      ),
      element('span', {
        key: `peers-panel:${tab}:page-status`,
        className: 'transaction-pagination__status',
        text: `${page + 1} / ${pageCount}`,
        attributes: { 'aria-live': 'polite' }
      }),
      TransactionPaginationButton(
        `peers-panel:${tab}:next`,
        `Next ${tab}`,
        '→',
        page === pageCount - 1,
        () => changePeerPanelPage(tab, page + 1, pageCount)
      )
    ])
  ]);
}

function parsePeerIp(value) {
  const parseIpv4 = (text) => {
    const parts = text.split('.');
    if (parts.length !== 4 || parts.some((part) =>
      !/^(0|[1-9][0-9]{0,2})$/.test(part) || Number(part) > 255)) return null;
    return parts.map(Number);
  };
  const host = value.trim();
  const ipv4 = parseIpv4(host);
  if (ipv4) {
    return { 'network-id': 'ipv4', address: ipv4.map((byte) => byte.toString(16).padStart(2, '0')).join('') };
  }

  let ipv6 = host;
  if (ipv6.startsWith('[') && ipv6.endsWith(']')) ipv6 = ipv6.slice(1, -1);
  if (!ipv6.includes(':')) throw new Error('Enter a valid IPv4 or IPv6 address.');
  if (ipv6.includes('.')) {
    const tail = ipv6.lastIndexOf(':');
    const bytes = parseIpv4(ipv6.slice(tail + 1));
    if (!bytes) throw new Error('Enter a valid IPv6 address.');
    ipv6 = ipv6.slice(0, tail + 1) +
      ((bytes[0] << 8) | bytes[1]).toString(16) + ':' +
      ((bytes[2] << 8) | bytes[3]).toString(16);
  }
  const halves = ipv6.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const count = left.length + right.length;
  if (halves.length > 2 ||
      (halves.length === 1 ? count !== 8 : count >= 8) ||
      [...left, ...right].some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) {
    throw new Error('Enter a valid IPv6 address.');
  }
  const groups = [...left, ...Array(8 - count).fill('0'), ...right];
  return { 'network-id': 'ipv6', address: groups.map((group) => group.toLowerCase().padStart(4, '0')).join('') };
}

async function submitPeerConnect() {
  if (explorerState.peerConnectPending) return;
  explorerState.peerConnectError = null;
  let address;
  try {
    address = parsePeerIp(explorerState.peerConnectAddress);
    const port = explorerState.peerConnectPort.trim();
    if (!/^[0-9]+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
      throw new Error('Enter a port between 1 and 65535.');
    }
    address.port = Number(port);
  } catch (error) {
    explorerState.peerConnectError = error.message;
    renderBitcoinExplorer();
    return;
  }
  const key = peerKey(address);
  if (explorerState.peers?.has(key) || explorerState.pendingPeerConnects.has(key)) {
    explorerState.peerConnectError = 'Already connected or connecting to this address.';
    renderBitcoinExplorer();
    return;
  }

  explorerState.peerConnectPending = true;
  explorerState.pendingPeerConnects.add(key);
  renderBitcoinExplorer();
  try {
    const response = await sendActions([
      makeBitcoinClientAction('connect-peer', address)
    ]);
    if (!response.ok) throw new Error('Unable to connect to peer. Please try again.');
  } catch (error) {
    explorerState.peerConnectError = error.message;
  } finally {
    explorerState.peerConnectPending = false;
    explorerState.pendingPeerConnects.delete(key);
    renderBitcoinExplorer();
  }
}

function PeerConnectForm() {
  const address = element('input', {
    key: 'peer-connect:address',
    className: 'peer-connect-form__address',
    attributes: {
      type: 'text', placeholder: 'Address', 'aria-label': 'Peer address',
      value: explorerState.peerConnectAddress
    }
  });
  const port = element('input', {
    key: 'peer-connect:port',
    className: 'peer-connect-form__port',
    attributes: {
      type: 'text', inputmode: 'numeric', placeholder: 'Port', 'aria-label': 'Peer port',
      value: explorerState.peerConnectPort
    }
  });
  listen(address, 'input', (event) => { explorerState.peerConnectAddress = event.currentTarget.value; });
  listen(port, 'input', (event) => { explorerState.peerConnectPort = event.currentTarget.value; });
  const form = element('form', {
    key: 'peer-connect', className: 'peer-connect-form',
    attributes: { 'aria-label': 'Connect to a peer' }
  }, [address, port, element('button', {
    key: 'peer-connect:button', className: 'peer-card__disconnect',
    text: explorerState.peerConnectPending ? 'Connecting…' : 'Connect',
    attributes: {
      type: 'submit',
      ...(explorerState.peerConnectPending ? { disabled: '', 'aria-busy': 'true' } : {})
    }
  }), explorerState.peerConnectError && element('span', {
    key: 'peer-connect:error', className: 'peer-connect-form__error',
    text: explorerState.peerConnectError, attributes: { role: 'alert' }
  })]);
  listen(form, 'submit', (event) => {
    event.preventDefault();
    submitPeerConnect();
  });
  return form;
}

function PeersPanel(peers, addresses, blacklist, activeTab) {
  const visiblePeers = (activeTab === 'peers' ? Array.from(peers?.values() ?? []) : []).sort((first, second) => {
    const activeDifference = Number(second.info['handshake-done']) -
      Number(first.info['handshake-done']);
    return activeDifference || first.key.localeCompare(second.key);
  });
  const addressRankOrder = { priority: 0, known: 1, unknown: 2 };
  const visibleAddresses = activeTab === 'addresses' ? Array.from(addresses?.values() ?? [])
    .sort((first, second) => {
      const rankDifference = (addressRankOrder[first.info['address-rank']] ?? 2) -
        (addressRankOrder[second.info['address-rank']] ?? 2);
      return rankDifference || first.key.localeCompare(second.key);
    }) : [];
  const visibleBlacklist = activeTab === 'blacklist' ? Array.from(blacklist?.values() ?? [])
    .sort((first, second) => first.key.localeCompare(second.key)) : [];
  const activePeerCount = visiblePeers.filter(
    (peer) => peer.info['handshake-done']
  ).length;
  const tabData = {
    peers: {
      source: peers,
      entries: visiblePeers,
      render: PeerCard,
      count: `${activePeerCount} / ${visiblePeers.length}`,
      countLabel: `${activePeerCount} active of ${visiblePeers.length} peers`,
      emptyText: 'Waiting for peer connections…'
    },
    addresses: {
      source: addresses,
      entries: visibleAddresses,
      render: (entry) => AddressCard(entry, peers?.get(entry.key) ?? null),
      count: visibleAddresses.length.toLocaleString(),
      countLabel: `${visibleAddresses.length} known addresses`,
      emptyText: 'No known addresses.'
    },
    blacklist: {
      source: blacklist,
      entries: visibleBlacklist,
      render: BlacklistCard,
      count: visibleBlacklist.length.toLocaleString(),
      countLabel: `${visibleBlacklist.length} blacklisted addresses`,
      emptyText: 'The blacklist is empty.'
    }
  };
  const currentTab = tabData[activeTab] ?? tabData.peers;
  const currentTabName = tabData[activeTab] ? activeTab : 'peers';

  return element('section', {
    key: 'peers-panel',
    className: 'peers-panel',
    attributes: { 'aria-label': 'Network connections and addresses' }
  }, [
    element('header', {
      key: 'peers-panel:header',
      className: 'panel__header peers-panel__header'
    }, [
      element('span', {
        key: 'peers-panel:count',
        className: 'peers-panel__count',
        text: currentTab.count,
        attributes: {
          'aria-label': currentTab.countLabel
        }
      }),
      currentTabName === 'peers' && PeerConnectForm()
    ]),
    currentTab.entries.length > 0
      ? PeerPanelPage(
          currentTabName,
          currentTab.entries,
          currentTab.render
        )
      : PeerPanelEmpty(
          currentTabName,
          currentTab.source,
          currentTab.emptyText
        )
  ]);
}

function BlockDataPanel(block, blockData, transactionPage, bestBlock) {
  const blockKey = block ? `block:${block.hash}` : 'block:none';
  const content = block
    ? element('div', {
        key: `${blockKey}:content`,
        className: 'block-data-content'
      }, [
        BlockHeaderData(block, bestBlock),
        blockData
          ? TransactionList(
              blockData.transactions,
              transactionPage,
              block.hash
            )
          : BlockLoadingIndicator(block.hash)
      ])
    : element('div', {
        key: 'block-data-empty',
        className: 'block-data-empty'
      }, [
        element('div', {
          key: 'block-data-empty:icon',
          className: 'block-data-empty__icon',
          text: '₿',
          attributes: { 'aria-hidden': 'true' }
        }),
        element('h3', {
          key: 'block-data-empty:title',
          className: 'block-data-empty__title',
          text: 'No block selected'
        }),
        element('p', {
          key: 'block-data-empty:copy',
          className: 'block-data-empty__copy',
          text: 'Select a header above to inspect its block data.'
        })
      ]);

  return element('section', {
    key: 'block-data-panel',
    className: 'block-data-panel',
    attributes: block
      ? { 'aria-labelledby': 'block-data-title' }
      : { 'aria-label': 'Block data' }
  }, [
    block
      ? element('header', {
          key: `${blockKey}:panel-header`,
          className: 'panel__header block-data-panel__header'
        }, [
          element('h2', {
            key: `${blockKey}:panel-title`,
            className: 'block-data-panel__title',
            text: 'Block',
            attributes: { id: 'block-data-title' }
          }),
          element('div', {
            key: `${blockKey}:hash-group`,
            className: 'block-data-panel__hash-group'
          }, [
            element('code', {
              key: `${blockKey}:hash`,
              className: 'block-data-panel__hash',
              text: block.hash
            }),
            CopyBlockHashButton(block.hash)
          ]),
          element('span', {
            key: `${blockKey}:height`,
            className: 'block-data-panel__height',
            text: `Height ${Number(block.height).toLocaleString()}`
          })
        ])
      : null,
    content
  ]);
}

function closeBlockTab(hash) {
  const hashes = Array.from(explorerState.openBlocks.keys());
  const index = hashes.indexOf(hash);
  if (index < 0) return;

  const nextHash = index === 0 ? hashes[1] : hashes[index - 1];
  explorerState.openBlocks.delete(hash);
  explorerState.blockTransactionPages.delete(hash);
  if (nextHash) {
    setSelectedBlock(explorerState.openBlocks.get(nextHash));
  } else {
    explorerState.selectedTab = { type: 'config' };
  }
  renderBitcoinExplorer();
  document.getElementById(
    nextHash ? `block-tab-${nextHash}` : 'peers-panel-tab-config'
  )?.focus();
}

function BlockDataTab(block, state) {
  const selected = getSelectedBlock(state)?.hash === block.hash;
  const button = element('button', {
    key: `block-tab:${block.hash}`,
    className: `peers-panel__tab${selected ? ' peers-panel__tab--selected' : ''}`,
    text: `Block ${Number(block.height).toLocaleString()}`,
    attributes: {
      id: `block-tab-${block.hash}`,
      type: 'button',
      role: 'tab',
      title: block.hash,
      'aria-selected': selected ? 'true' : 'false',
      'aria-controls': 'explorer-data-content'
    }
  });
  listen(button, 'click', () => {
    if (getSelectedBlock()?.hash === block.hash) {
      centerHeaderWindow(block.height);
    } else {
      selectBlock(block);
    }
  });
  listen(button, 'keydown', (event) => {
    const tabs = Array.from(event.currentTarget.closest('[role="tablist"]').querySelectorAll('[role="tab"]'));
    const index = tabs.indexOf(event.currentTarget);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    tabs[next]?.focus();
    tabs[next]?.click();
  });
  const closeButton = element('button', {
    key: `block-tab:${block.hash}:close`,
    className: 'block-data-tab__close',
    text: '×',
    attributes: {
      type: 'button',
      'aria-label': `Close block ${Number(block.height).toLocaleString()}`,
      title: 'Close tab'
    }
  });
  listen(closeButton, 'click', () => closeBlockTab(block.hash));

  return element('div', {
    key: `block-tab:${block.hash}:group`,
    className: `block-data-tab${selected ? ' block-data-tab--selected' : ''}`,
    attributes: { role: 'presentation' }
  }, [button, closeButton]);
}

const configActionFields = [
  'verb', 'target-addresses', 'target-peers', 'target-priority-peers',
  'filter-cache-range', 'block-cache-range'
];

async function saveConfig() {
  if (!explorerState.configDraft || explorerState.configSaving) return;
  const values = {};
  explorerState.configSaveError = null;
  for (const name of configActionFields) {
    if (name === 'verb') {
      values[name] = explorerState.configDraft.verb;
      continue;
    }
    const input = explorerState.configDraft[name].trim();
    if (!input) {
      values[name] = explorerState.config[name];
    } else {
      if (!/^[0-9]+$/.test(input) || !Number.isSafeInteger(Number(input))) {
        explorerState.configSaveError = 'Targets and cache ranges must be non-negative whole numbers within the supported range.';
        renderBitcoinExplorer();
        return;
      }
      values[name] = Number(input);
    }
  }
  explorerState.configSaving = true;
  renderBitcoinExplorer();
  try {
    const response = await sendActions([
      makeBitcoinClientAction('configure', configActionFields.map((name) => ({ [name]: values[name] })))
    ]);
    if (!response.ok) throw new Error('Unable to save configuration. Please try again.');
    explorerState.configDraft = null;
  } catch (error) {
    explorerState.configSaveError = error.message;
  } finally {
    explorerState.configSaving = false;
    renderBitcoinExplorer();
  }
}

function ConfigPanel(state) {
  const editing = state.configDraft !== null;
  const button = (label, onClick, type = 'button') => {
    const control = element('button', {
      key: `config:${label}`, className: 'peer-card__disconnect', text: label,
      attributes: { type, ...(state.configSaving ? { disabled: '' } : {}) }
    });
    if (onClick) listen(control, 'click', onClick);
    return control;
  };
  const controls = editing ? [
    button('Cancel', () => {
      explorerState.configDraft = null;
      explorerState.configSaveError = null;
      renderBitcoinExplorer();
    }),
    button(state.configSaving ? 'Saving…' : 'Save', null, 'submit')
  ] : [button('Edit', () => {
    explorerState.configDraft = Object.fromEntries(configActionFields.map((name) => [
      name, name === 'verb' ? state.config.verb === true : String(state.config[name])
    ]));
    explorerState.configSaveError = null;
    renderBitcoinExplorer();
  })];
  const form = element('form', { key: 'config-panel:form' }, [
    state.config && element('div', {
      key: 'config-panel:controls', className: 'config-panel__controls'
    }, controls),
    state.configSaveError && element('p', {
      key: 'config-panel:error', className: 'peer-ban-form__error',
      text: state.configSaveError, attributes: { role: 'alert' }
    }),
    state.config
      ? element('dl', { key: 'config-panel:fields', className: 'config-panel__fields' },
          configActionFields.map((name) => {
            const value = state.config[name];
            const formatted = name === 'verb' ? (value ? 'on' : 'off') : String(value);
            const label = name === 'verb' ? 'verbosity'
              : name === 'block-cache-range' || name === 'filter-cache-range'
                ? `${name.replaceAll('-', ' ')} from best block`
                : name.replaceAll('-', ' ');
            const input = !editing ? null : name === 'verb' ? element('button', {
              key: 'config:verb:toggle',
              className: 'peer-card__disconnect',
              text: state.configDraft.verb ? 'on' : 'off',
              attributes: {
                type: 'button', role: 'switch', 'aria-label': 'Verbosity',
                'aria-checked': String(state.configDraft.verb),
                ...(state.configSaving ? { disabled: '' } : {})
              }
            }) : element('input', {
              key: `config:${name}:input`,
              attributes: {
                type: 'text', value: state.configDraft[name], placeholder: formatted,
                'aria-label': label,
                ...(name !== 'verb' ? { inputmode: 'numeric' } : {}),
                ...(state.configSaving ? { disabled: '' } : {})
              }
            });
            if (input && name === 'verb') listen(input, 'click', () => {
              explorerState.configDraft.verb = !explorerState.configDraft.verb;
              renderBitcoinExplorer();
            });
            else if (input) listen(input, 'input', (event) => {
              explorerState.configDraft[name] = event.currentTarget.value;
            });
            return element('div', {
              key: `config:${name}`, className: 'config-panel__field'
            }, [
              element('dt', { text: label }),
              editing ? element('dd', {}, [input]) : element('dd', { text: formatted })
            ]);
          }))
      : element('p', {
          key: 'config-panel:status', text: 'Loading configuration…',
          attributes: { role: 'status' }
        })
  ]);
  listen(form, 'submit', (event) => {
    event.preventDefault();
    saveConfig();
  });
  return element('section', {
    key: 'config-panel', className: 'config-panel',
    attributes: { role: 'tabpanel', 'aria-labelledby': 'peers-panel-tab-config' }
  }, [form]);
}

function selectComet(patp, { center = false } = {}) {
  const zoomIn = explorerState.cometGraphZoom === 'overview';
  const transitionFrame = zoomIn || center ? captureCometZoomFrame() : null;
  explorerState.selectedCometPatp = patp;
  if (zoomIn) {
    stopCometPan();
    explorerState.cometGraphZoom = 'full';
  }
  scryCometPeer(patp);
  renderUrbitExplorer();
  if (zoomIn || center) {
    const viewport = document.querySelector('.comet-network');
    const selected = viewport?.querySelector('.comet-network__node--selected');
    if (selected) {
      viewport.scrollLeft = selected.offsetLeft - viewport.clientWidth / 2;
      viewport.scrollTop = selected.offsetTop - viewport.clientHeight / 2;
    }
  }
  // Animate search centering with the same frame transition as zooming, so
  // moving to a peer and opening its full view happen in one smooth motion.
  if (zoomIn || center) animateCometZoom(transitionFrame);
}

function truncateCometPatp(patp) {
  const words = patp.replace(/^~/, '').split(/-+/);
  return words.length > 1 ? `~${words[0]}_${words[words.length - 1]}` : patp;
}

function truncateCometNym(nym) {
  const words = nym.replace(/^\.+/, '').split('.').filter(Boolean);
  return words.length > 1 ? `..${words[0]}...${words[words.length - 1]}` : nym;
}

function indexCometNyms(roots) {
  const nyms = new Map();
  const pending = [...roots];
  while (pending.length) {
    const comet = pending.pop();
    if (comet.nym) nyms.set(comet.patp, comet.nym);
    pending.push(...comet.sponsees);
  }
  return nyms;
}

// Keep identity/cache keys as patps; only presentation follows this mode.
// Fall back to the patp until a nym is supplied by /our or /comets.
function formatCometName(patp, state, truncated = false) {
  if (!patp) return '';
  const nym = (state.observatoryOur?.patp === patp ? state.observatoryOur.nym : '') || state.cometNyms.get(patp);
  if (state.cometNameFormat === 'nym' && nym) return truncated ? truncateCometNym(nym) : nym;
  return truncated ? truncateCometPatp(patp) : patp;
}

function toggleCometNameFormat() {
  explorerState.cometNameFormat = explorerState.cometNameFormat === 'nym' ? 'patp' : 'nym';
  explorerState.cometNameTogglePulse++;
  if (cometNameFeedbackTimer !== null) clearTimeout(cometNameFeedbackTimer);
  renderUrbitExplorer();
  cometNameFeedbackTimer = setTimeout(() => {
    cometNameFeedbackTimer = null;
    explorerState.cometNameTogglePulse = 0;
    renderUrbitExplorer();
  }, 360);
}

// Cache geometry by graph identity: selecting a node or receiving peer
// data should neither recompute the layout nor move the graph beneath it.
const cometGraphLayouts = new WeakMap();
const cometGraphOverviewLayouts = new WeakMap();
const cometGraphDrags = new WeakMap();
const cometGraphTaps = new WeakMap();
const cometGraphOuterMargin = 128;
const cometOverviewScale = 0.42;

function stopCometPan() {
  const pan = cometPan;
  cometPan = null;
  if (!pan) return;
  if (pan.frame !== null) cancelAnimationFrame(pan.frame);
  cometPanClickUntil = performance.now() + 180;
  if (pan.pointerId !== null && pan.owner.hasPointerCapture(pan.pointerId)) {
    pan.owner.releasePointerCapture(pan.pointerId);
  }
}

function startCometPan(dx, dy, owner, pointerId = null) {
  stopCometPan();
  const viewport = document.querySelector('.comet-network');
  if (!viewport || explorerState.networkPage !== 'urbit') return;
  const pan = { dx, dy, owner, pointerId, frame: null, last: performance.now() };
  cometPan = pan;
  const step = (now) => {
    if (cometPan !== pan) return;
    const graph = document.querySelector('.comet-network');
    if (!graph || document.hidden || explorerState.networkPage !== 'urbit') {
      stopCometPan();
      return;
    }
    const distance = Math.min(40, Math.max(0, now - pan.last)) * 0.42;
    pan.last = now;
    graph.scrollLeft += dx * distance;
    graph.scrollTop += dy * distance;
    pan.frame = requestAnimationFrame(step);
  };
  pan.frame = requestAnimationFrame(step);
}

addEventListener('blur', stopCometPan);
addEventListener('pagehide', stopCometPan);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCometPan();
});

function CometPanButton(direction, symbol, dx, dy, disabled) {
  const button = element('button', {
    key: `comet-graph:pan:${direction}`,
    className: `comet-graph-panel__button comet-graph-pan comet-graph-pan--${direction}`,
    text: symbol,
    attributes: {
      type: 'button', 'aria-label': `Pan graph ${direction}`, title: `Pan ${direction}`,
      ...(disabled ? { disabled: '' } : {})
    }
  });
  listen(button, 'pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    startCometPan(dx, dy, event.currentTarget, event.pointerId);
    if (cometPan) event.currentTarget.setPointerCapture(event.pointerId);
  });
  const stop = (event) => {
    if (cometPan?.owner === event.currentTarget) stopCometPan();
  };
  listen(button, 'pointerup', stop);
  listen(button, 'pointercancel', stop);
  listen(button, 'lostpointercapture', stop);
  listen(button, 'blur', stop);
  listen(button, 'contextmenu', (event) => event.preventDefault());
  listen(button, 'keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!event.repeat) startCometPan(dx, dy, event.currentTarget);
  });
  listen(button, 'keyup', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    stop(event);
  });
  // Assistive-technology activation may produce a click without a press.
  listen(button, 'click', (event) => {
    if (event.detail !== 0 || performance.now() < cometPanClickUntil || cometPan) return;
    startCometPan(dx, dy, event.currentTarget);
    const pan = cometPan;
    setTimeout(() => {
      if (cometPan === pan) stopCometPan();
    }, 120);
  });
  return button;
}

function captureCometZoomFrame() {
  const viewport = document.querySelector('.comet-network');
  const svg = viewport?.querySelector('.comet-network__lines');
  if (!svg || typeof svg.animate !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  const transform = getComputedStyle(svg).transform;
  const matrix = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
  const nodes = new Map();
  for (const node of viewport.querySelectorAll('.comet-network__node')) {
    const circle = node.querySelector('.comet-network__circle').getBoundingClientRect();
    nodes.set(node.getAttribute('data-render-key'), {
      x: (circle.left + circle.right) / 2, y: (circle.top + circle.bottom) / 2,
      width: circle.width, height: circle.height,
      named: Boolean(node.querySelector('.comet-network__name'))
    });
  }
  return {
    nodes, scale: explorerState.cometGraphZoom === 'overview' ? cometOverviewScale : 1,
    matrix, left: viewport.scrollLeft, top: viewport.scrollTop, bounds: viewport.getBoundingClientRect()
  };
}

function animateCometZoom(before) {
  for (const animation of cometZoomAnimations) animation.cancel();
  cometZoomAnimations = [];
  const viewport = document.querySelector('.comet-network');
  const svg = viewport?.querySelector('.comet-network__lines');
  if (!before || !svg || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const options = { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' };
  const animations = [];
  const scale = explorerState.cometGraphZoom === 'overview' ? cometOverviewScale : 1;
  const ratio = before.scale / scale;
  const bounds = viewport.getBoundingClientRect();
  // Invert the new layout and scroll position back to the previous view.
  // Include an interrupted animation's matrix so rapid toggles stay smooth.
  const x = before.matrix.a * cometGraphOuterMargin * (1 - ratio) + before.matrix.e +
    viewport.scrollLeft - before.left + before.bounds.left - bounds.left;
  const y = before.matrix.d * cometGraphOuterMargin * (1 - ratio) + before.matrix.f +
    viewport.scrollTop - before.top + before.bounds.top - bounds.top;
  animations.push(svg.animate([
    { transform: `translate(${x}px, ${y}px) scale(${before.matrix.a * ratio}, ${before.matrix.d * ratio})` },
    { transform: 'translate(0px, 0px) scale(1, 1)' }
  ], options));
  for (const node of viewport.querySelectorAll('.comet-network__node')) {
    const old = before.nodes.get(node.getAttribute('data-render-key'));
    if (!old) continue;
    const circle = node.querySelector('.comet-network__circle');
    const rect = circle.getBoundingClientRect();
    animations.push(node.animate([
      { translate: `${old.x - (rect.left + rect.right) / 2}px ${old.y - (rect.top + rect.bottom) / 2}px` },
      { translate: '0px 0px' }
    ], options));
    animations.push(circle.animate([
      { width: `${old.width}px`, height: `${old.height}px` },
      { width: `${rect.width}px`, height: `${rect.height}px` }
    ], options));
    const label = node.querySelector('.comet-network__name');
    if (label && !old.named) animations.push(label.animate([{ opacity: 0 }, { opacity: 1 }], options));
  }
  cometZoomAnimations = animations;
  Promise.all(animations.map((animation) => animation.finished.catch(() => {}))).then(() => {
    if (cometZoomAnimations === animations) cometZoomAnimations = [];
  });
}

function toggleCometGraphZoom() {
  stopCometPan();
  const zoomFrame = captureCometZoomFrame();
  const viewport = document.querySelector('.comet-network');
  const oldScale = explorerState.cometGraphZoom === 'overview' ? cometOverviewScale : 1;
  const center = viewport ? {
    x: cometGraphOuterMargin + (viewport.scrollLeft + viewport.clientWidth / 2 - cometGraphOuterMargin) / oldScale,
    y: cometGraphOuterMargin + (viewport.scrollTop + viewport.clientHeight / 2 - cometGraphOuterMargin) / oldScale
  } : null;
  explorerState.cometGraphZoom = explorerState.cometGraphZoom === 'full' ? 'overview' : 'full';
  renderUrbitExplorer();
  const updated = document.querySelector('.comet-network');
  if (center && updated) {
    const scale = explorerState.cometGraphZoom === 'overview' ? cometOverviewScale : 1;
    updated.scrollLeft = cometGraphOuterMargin + (center.x - cometGraphOuterMargin) * scale - updated.clientWidth / 2;
    updated.scrollTop = cometGraphOuterMargin + (center.y - cometGraphOuterMargin) * scale - updated.clientHeight / 2;
  }
  animateCometZoom(zoomFrame);
}

// Project the existing layout instead of repacking: every relative node
// position stays the same, with only distances compressed in overview.
function cometGraphViewLayout(roots, zoom) {
  const full = layoutCometGraph(roots);
  if (zoom !== 'overview') return full;
  if (cometGraphOverviewLayouts.has(full)) return cometGraphOverviewLayouts.get(full);
  const project = (value) => cometGraphOuterMargin + (value - cometGraphOuterMargin) * cometOverviewScale;
  const nodes = full.nodes.map((node) => ({ ...node, x: project(node.x), y: project(node.y) }));
  const byPatp = new Map(nodes.map((node) => [node.comet.patp, node]));
  const edges = full.edges.map((edge) => {
    const source = byPatp.get(edge.source.comet.patp);
    const target = byPatp.get(edge.target.comet.patp);
    return { source, target, path: cometConnectionPath(source, target, cometOverviewScale) };
  });
  const overview = {
    nodes, edges,
    width: Math.max(800, (full.width - cometGraphOuterMargin * 2) * cometOverviewScale + cometGraphOuterMargin * 2),
    height: Math.max(480, (full.height - cometGraphOuterMargin * 2) * cometOverviewScale + cometGraphOuterMargin * 2)
  };
  cometGraphOverviewLayouts.set(full, overview);
  return overview;
}

// Stable noise gives clusters and curves an organic shape without moving
// them on every selection, refresh, or peer-data response.
function cometLayoutNoise(key) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function cometClusterPoints(count, seed, reserveSponsor) {
  const points = [];
  const buckets = new Map();
  const rotation = cometLayoutNoise(seed) * 2 * Math.PI;
  // Scatter through the interior on a perturbed golden-angle spiral.
  // Reject close neighbors to leave readable label space, without a grid.
  for (let index = 0; points.length < count; index++) {
    const key = `${seed}:${index}`;
    const angle = rotation + index * 2.399963229728653 + (cometLayoutNoise(`${key}:angle`) - 0.5) * 0.7;
    const radius = Math.sqrt(index) * (0.72 + cometLayoutNoise(`${key}:radius`) * 0.15);
    const x = Math.cos(angle) * radius * 120;
    const y = Math.sin(angle) * radius * 80;
    if (reserveSponsor && Math.abs(x) < 136 && Math.abs(y) < 88) continue;
    const bx = Math.floor(x / 128), by = Math.floor(y / 70);
    let crowded = false;
    for (let cx = bx - 1; cx <= bx + 1 && !crowded; cx++) {
      for (let cy = by - 1; cy <= by + 1 && !crowded; cy++) {
        crowded = (buckets.get(`${cx}:${cy}`) ?? []).some((other) =>
          Math.abs(x - other.x) < 128 && Math.abs(y - other.y) < 70
        );
      }
    }
    if (crowded) continue;
    const point = { x, y };
    points.push(point);
    const bucket = `${bx}:${by}`;
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(point);
  }
  return points;
}

function cometConnectionPath(source, target, scale = 1) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.hypot(dx, dy) || 1;
  const key = `${source.comet.patp}:${target.comet.patp}`;
  const bend = Math.min(70 * scale, distance * 0.3);
  const first = (cometLayoutNoise(`${key}:first`) - 0.5) * bend * 2;
  const second = (cometLayoutNoise(`${key}:second`) - 0.5) * bend * 2;
  const fraction = 0.2 + cometLayoutNoise(`${key}:fraction`) * 0.2;
  const c1x = source.x + dx * fraction - dy / distance * first;
  const c1y = source.y + dy * fraction + dx / distance * first;
  const c2x = target.x - dx * 0.25 - dy / distance * second;
  const c2y = target.y - dy * 0.25 + dx / distance * second;
  return `M ${source.x} ${source.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${target.x} ${target.y}`;
}

function layoutCometGraph(roots) {
  if (cometGraphLayouts.has(roots)) return cometGraphLayouts.get(roots);
  const nodes = [];
  const edges = [];
  const clusters = [];
  for (const root of roots) {
    const queue = [{ comet: root, x: 0, y: 0, topLevel: true }];
    for (let index = 0; index < queue.length; index++) {
      const sponsor = queue[index];
      const children = [...sponsor.comet.sponsees].sort((a, b) =>
        cometLayoutNoise(a.patp) - cometLayoutNoise(b.patp)
      );
      const leaves = children.filter((comet) => !comet.sponsees.length);
      // Every sponsor anchors its own cluster.  Nested sponsors have no
      // placeholder node or reserved seat in their parent's leaf cluster.
      const points = cometClusterPoints(leaves.length, sponsor.comet.patp, true);
      const members = [sponsor];
      let leafIndex = 0;
      for (const comet of children) {
        const child = { comet, x: 0, y: 0, topLevel: false };
        edges.push({ source: sponsor, target: child });
        if (comet.sponsees.length) {
          queue.push(child);
        } else {
          child.x = points[leafIndex].x;
          child.y = points[leafIndex].y;
          leafIndex++;
          members.push(child);
        }
      }
      let radiusX = 0, radiusY = 0;
      for (const node of members) {
        radiusX = Math.max(radiusX, Math.abs(node.x));
        radiusY = Math.max(radiusY, Math.abs(node.y));
      }
      clusters.push({
        owner: sponsor.comet.patp, members,
        width: radiusX * 2 + 176, height: radiusY * 2 + 144
      });
    }
  }

  // Top-level and nested sponsor families use the same plot packing.
  // Families of a root are queued together, keeping their hubs nearby;
  // the parent-child edge bridges plots instead of spanning a leaf cloud.
  const plots = [];
  const columns = Math.max(1, Math.ceil(Math.sqrt(clusters.length)));
  const outerMargin = cometGraphOuterMargin;
  let x = outerMargin, y = outerMargin, rowHeight = 0, width = 0;
  clusters.forEach((cluster, index) => {
    if (index && index % columns === 0) {
      x = outerMargin;
      y += rowHeight + 56;
      rowHeight = 0;
    }
    const centerX = x + cluster.width / 2;
    const centerY = y + cluster.height / 2;
    for (const node of cluster.members) {
      node.x += centerX;
      node.y += centerY;
      nodes.push(node);
    }
    plots.push({ owner: cluster.owner, x: centerX, y: centerY, width: cluster.width, height: cluster.height });
    x += cluster.width + 56;
    width = Math.max(width, x - 56 + outerMargin);
    rowHeight = Math.max(rowHeight, cluster.height);
  });
  // All hub coordinates must be placed before generating cross-plot paths.
  for (const edge of edges) edge.path = cometConnectionPath(edge.source, edge.target);
  const layout = { nodes, edges, plots, width: Math.max(800, width), height: Math.max(480, y + rowHeight + outerMargin) };
  cometGraphLayouts.set(roots, layout);
  return layout;
}

function CometNetworkGraph(state) {
  const overview = state.cometGraphZoom === 'overview';
  const layout = cometGraphViewLayout(state.cometSponsorshipGraph, state.cometGraphZoom);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('data-render-key', 'comet-network:lines');
  svg.setAttribute('class', 'comet-network__lines');
  svg.setAttribute('width', layout.width);
  svg.setAttribute('height', layout.height);
  svg.setAttribute('aria-hidden', 'true');
  for (const { source, target, path } of layout.edges) {
    const line = document.createElementNS(svg.namespaceURI, 'path');
    line.setAttribute('data-render-key', `edge:${source.comet.patp}:${target.comet.patp}`);
    line.setAttribute('d', path);
    line.setAttribute('class', `comet-network__edge${[source.comet.patp, target.comet.patp].includes(state.selectedCometPatp) ? ' comet-network__edge--selected' : ''}`);
    svg.append(line);
  }
  const plane = element('div', {
    key: 'comet-network:plane', className: 'comet-network__plane',
    attributes: { style: `width: ${layout.width}px; height: ${layout.height}px` }
  }, [svg, ...layout.nodes.map(({ comet, x, y, topLevel }) => {
    const selected = comet.patp === state.selectedCometPatp;
    return listen(element('button', {
      key: `comet-node:${comet.patp}`,
      className: `comet-network__node${comet.sponsees.length ? ' comet-network__node--hub' : ''}${topLevel ? ' comet-network__node--top-level' : ''}${selected ? ' comet-network__node--selected' : ''}`,
      attributes: {
        type: 'button', title: formatCometName(comet.patp, state),
        'aria-label': `Select ${formatCometName(comet.patp, state)}`, 'aria-pressed': String(selected),
        style: `left: ${x}px; top: ${y}px`
      }
    }, [
      element('span', { className: 'comet-network__circle', attributes: { 'aria-hidden': 'true' } }),
      (!overview || topLevel) && element('span', { className: 'comet-network__name', text: formatCometName(comet.patp, state, true) })
    ]), 'click', () => selectComet(comet.patp));
  })]);
  const viewport = element('div', {
    key: 'comet-network', className: `comet-network${overview ? ' comet-network--overview' : ''}`,
    attributes: { tabindex: '0', role: 'region', 'aria-label': 'Comet network graph. Scroll or drag to explore. Double-click or double-tap to toggle zoom.' }
  }, [plane]);
  listen(viewport, 'pointerdown', (event) => {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    cometGraphDrags.set(event.currentTarget, {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop, moved: false
    });
  });
  listen(viewport, 'pointermove', (event) => {
    const drag = cometGraphDrags.get(event.currentTarget);
    if (!drag || drag.id !== event.pointerId) return;
    if (!event.buttons) { cometGraphDrags.delete(event.currentTarget); return; }
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.currentTarget.scrollLeft = drag.left - dx;
    event.currentTarget.scrollTop = drag.top - dy;
  });
  const endDrag = (event) => {
    const drag = cometGraphDrags.get(event.currentTarget);
    if (!drag || drag.id !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved) drag.suppressClickUntil = performance.now() + 400;
    drag.id = null;
  };
  listen(viewport, 'pointerup', endDrag);
  listen(viewport, 'pointercancel', endDrag);
  listen(viewport, 'dblclick', (event) => {
    const now = performance.now();
    if (cometGraphDrags.get(event.currentTarget)?.suppressClickUntil > now ||
        cometGraphTaps.get(event.currentTarget)?.suppressDblClickUntil > now) return;
    event.preventDefault();
    toggleCometGraphZoom();
  });
  listen(viewport, 'touchstart', (event) => {
    const taps = cometGraphTaps.get(event.currentTarget) ?? {};
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      taps.start = { id: touch.identifier, x: touch.clientX, y: touch.clientY, at: performance.now() };
    } else {
      taps.start = null;
      taps.last = null;
    }
    cometGraphTaps.set(event.currentTarget, taps);
  }, { passive: true });
  listen(viewport, 'touchmove', (event) => {
    const taps = cometGraphTaps.get(event.currentTarget);
    const start = taps?.start;
    const touch = event.touches[0];
    if (start && (event.touches.length !== 1 || touch.identifier !== start.id ||
        Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 10)) {
      taps.start = null;
      taps.last = null;
    }
  }, { passive: true });
  listen(viewport, 'touchcancel', (event) => {
    cometGraphTaps.delete(event.currentTarget);
  }, { passive: true });
  listen(viewport, 'touchend', (event) => {
    const taps = cometGraphTaps.get(event.currentTarget);
    const start = taps?.start;
    const touch = event.changedTouches[0];
    if (!start) return;
    taps.start = null;
    const now = performance.now();
    if (event.touches.length || !touch || touch.identifier !== start.id ||
        now - start.at > 300 || Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 10) {
      taps.last = null;
      return;
    }
    if (taps.last && now - taps.last.at < 350 &&
        Math.hypot(touch.clientX - taps.last.x, touch.clientY - taps.last.y) < 24) {
      // Prevent a synthetic second click or native dblclick from toggling
      // again or selecting a node moved underneath the second tap.
      event.preventDefault();
      taps.last = null;
      taps.suppressDblClickUntil = now + 500;
      toggleCometGraphZoom();
    } else {
      taps.last = { x: touch.clientX, y: touch.clientY, at: now };
    }
  }, { passive: false });
  listen(viewport, 'click', (event) => {
    const drag = cometGraphDrags.get(event.currentTarget);
    if (drag?.suppressClickUntil > performance.now() ||
        cometGraphTaps.get(event.currentTarget)?.suppressDblClickUntil > performance.now()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, { capture: true });
  return viewport;
}

function formatCometFief(fief) {
  if (!fief) return 'Not declared';
  const host = fief.type === 'turf'
    ? fief.domains.map((labels) => [...labels].reverse().join('.')).join(', ')
    : fief.type === 'ipv6' ? `[${fief.address}]` : fief.address;
  return `${host}:${fief.port}`;
}

const cometPeerFields = [
  ['life', 'Life'],
  ['rift', 'Rift'],
  ['sponsor', 'Sponsor'],
  ['fief', 'Declared endpoint'],
  ['route', 'Route'],
  ['status', 'Connection'],
  ['last-contact', 'Last contact'],
  ['tracking-started', 'Tracking began'],
  ['sending', 'Sending flows'],
  ['receiving', 'Receiving flows'],
  ['remote-scries', 'Remote scries'],
  ['closing', 'Closing flows'],
  ['corked', 'Corked flows'],
  ['halted', 'Halted flows'],
  ['nacks', 'Negative acknowledgments'],
  ['pass', 'Pass']
];

function CometPeerSkeleton(key) {
  return element('div', {
    key, className: 'comet-peer', attributes: { 'aria-busy': 'true', 'aria-label': 'Loading networking data' }
  }, [element('dl', { className: 'comet-peer__fields' }, cometPeerFields.map(([field, label]) => {
    const row = BlockDetailField(label, '', `${key}:${field}`);
    row.querySelector('dd').append(element('span', {
      className: `skeleton comet-peer__skeleton${field === 'pass' ? ' comet-peer__skeleton--pass' : ''}`,
      attributes: { 'aria-hidden': 'true' }
    }));
    return row;
  }))]);
}

function CometPeerDetails(patp, state) {
  if (!patp) return null;
  const key = `comet-peer:${patp}`;
  const status = (text) => element('p', {
    key: `${key}:status`, className: 'comet-peer__status', text,
    attributes: { role: 'status' }
  });
  if (state.pendingCometPeers.has(patp)) return CometPeerSkeleton(key);
  if (state.cometPeerErrors.has(patp)) {
    return element('div', { key: `${key}:error` }, [
      status(state.cometPeerErrors.get(patp)),
      listen(element('button', {
        className: 'comet-peer__retry', text: 'Retry', attributes: { type: 'button' }
      }), 'click', () => {
        scryCometPeer(patp);
        renderUrbitExplorer();
      })
    ]);
  }
  if (!state.cometPeers.has(patp)) return CometPeerSkeleton(key);
  const peer = state.cometPeers.get(patp);
  if (!peer) return status('No known Ames peer data for this comet.');

  const route = peer.route;
  const lane = route?.lane;
  const routeText = route
    ? `${route.direct ? 'Direct' : 'Indirect'} · ${lane?.ship ? formatCometName(lane.ship, state) : lane?.address ?? 'Unknown lane'}`
    : 'No route';
  const bones = (items) => items?.length ? items.join(', ') : 'None';
  const topLevelSponsor = peer.sponsor === patp ||
    state.cometSponsorshipGraph?.some((comet) => comet.patp === patp);
  const values = {
    'life': peer.life,
    'rift': peer.rift,
    'sponsor': topLevelSponsor ? '~' : formatCometName(peer.sponsor, state),
    'fief': formatCometFief(peer.fief),
    'route': routeText,
    'status': peer.qos?.status ?? 'Unavailable',
    'last-contact': formatPeerTimestamp(peer.qos?.['last-contact']),
    'tracking-started': formatPeerTimestamp(peer.qos?.['tracking-started']),
    'sending': peer.flows?.sending ?? 0,
    'receiving': peer.flows?.receiving ?? 0,
    'remote-scries': peer.flows?.['remote-scries'] ?? 0,
    'closing': bones(peer.flows?.closing),
    'corked': bones(peer.flows?.corked),
    'halted': bones(peer.flows?.halted),
    'nacks': peer.flows?.nacks ?? 0,
    'pass': peer.pass
  };
  const fields = cometPeerFields.map(([field, label]) =>
    BlockDetailField(label, values[field] ?? 'Unavailable', `${key}:${field}`)
  );
  return element('div', { key, className: 'comet-peer' }, [
    element('dl', { className: 'comet-peer__fields' }, fields)
  ]);
}

function selectNetworkPage(page) {
  if (!['urbit', 'bitcoin'].includes(page) || page === explorerState.networkPage) return;
  stopCometPan();
  if (explorerState.networkPage === 'urbit') {
    const graph = document.querySelector('.comet-network');
    if (graph) explorerState.cometGraphScroll = { left: graph.scrollLeft, top: graph.scrollTop };
  } else {
    explorerState.bitcoinHeaderScrollAnchor = captureHeaderScrollAnchor();
    explorerState.bitcoinHeaderAtStart = headerRowIsAtStart();
  }
  if (networkPanelFrame !== null) {
    cancelAnimationFrame(networkPanelFrame);
    networkPanelFrame = null;
  }
  dirtyNetworkTabs.clear();
  explorerState.networkPage = page;
  renderExplorer(page === 'bitcoin' ? explorerState.bitcoinHeaderScrollAnchor : null);
}

function NetworkPageTab(page, label, state) {
  const selected = state.networkPage === page;
  const tab = listen(element('button', {
    key: `network-page-tab:${page}`, className: 'network-page-tab', text: label,
    attributes: {
      type: 'button', role: 'tab', id: `network-page-tab-${page}`,
      'aria-selected': String(selected), 'aria-controls': `network-page-${page}`,
      tabindex: selected ? '0' : '-1'
    }
  }), 'click', () => selectNetworkPage(page));
  return listen(tab, 'keydown', (event) => {
    const destination = { ArrowLeft: page === 'urbit' ? 'bitcoin' : 'urbit',
      ArrowRight: page === 'urbit' ? 'bitcoin' : 'urbit', Home: 'urbit', End: 'bitcoin' }[event.key];
    if (!destination) return;
    event.preventDefault();
    selectNetworkPage(destination);
    document.getElementById(`network-page-tab-${destination}`)?.focus();
  });
}

function GWLogo() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('data-render-key', 'comet-identity-logo');
  svg.setAttribute('class', 'comet-identity-panel__logo');
  svg.setAttribute('viewBox', '0 0 10 10');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', 'M5 0v5.6m-5 0h10m-8.35 2h6.7m-5 2h3.3');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '0.8');
  svg.append(path);
  return svg;
}

function CometIdentityPanel(state) {
  return element('header', {
    key: 'comet-identity-panel', className: 'panel comet-identity-panel',
    attributes: { 'aria-label': 'Your comet' }
  }, [
    element('h2', { className: 'comet-identity-panel__name' }, [
      GWLogo(),
      element('span', { text: formatCometName(state.observatoryOur?.patp ?? our, state) })
    ]),
    element('nav', {
      key: 'network-page-tabs', className: 'network-page-tabs',
      attributes: { role: 'tablist', 'aria-label': 'Network pages' }
    }, [
      NetworkPageTab('urbit', 'Urbit Network', state),
      NetworkPageTab('bitcoin', 'Bitcoin Network', state)
    ])
  ]);
}

function cometSearchNames(comet, format) {
  return (format === 'patp' ? [comet.patp, truncateCometPatp(comet.patp)]
    : [comet.nym, comet.nym ? truncateCometNym(comet.nym) : ''])
    .filter(Boolean).map((name) => name.toLowerCase().replace(/^[~.]+/, ''));
}

function cometNymWordRank(nym, words) {
  const nameWords = nym.toLowerCase().split('.').filter(Boolean);
  // Each entered word must remain a prefix of a word in this nym.
  if (!words.every((word) => nameWords.some((name) => name.startsWith(word)))) return Infinity;
  const sequenceAt = (sequence, start) => sequence.every((word, index) => nameWords[start + index]?.startsWith(word));
  // Prefer the whole query as a consecutive sequence anywhere in the nym.
  if (nameWords.some((_, index) => sequenceAt(words, index))) return 0;
  // Then prefer a prefix and suffix, with the unentered middle omitted.
  if (words.length <= nameWords.length) {
    for (let split = 1; split < words.length; split++) {
      if (sequenceAt(words.slice(0, split), 0) &&
          sequenceAt(words.slice(split), nameWords.length - (words.length - split))) return 1;
    }
  }
  return 2;
}

function cometSearchMatches(query, state) {
  const needle = query.trim().toLowerCase().replace(/^[~.]+/, '');
  if (!/[a-z0-9]/i.test(needle)) return [];
  const wordQuery = /\s/.test(query.trim()) && !/[~.]/.test(query)
    ? needle.split(/\s+/) : null;
  const known = new Map();
  const add = (patp, nym = '') => {
    if (patp) known.set(patp, { patp, nym: nym || state.cometNyms.get(patp) || '' });
  };
  const pending = [...(state.cometSponsorshipGraph ?? [])];
  while (pending.length) {
    const comet = pending.pop();
    add(comet.patp, comet.nym);
    pending.push(...comet.sponsees);
  }
  for (const [patp, nym] of state.cometNyms) add(patp, nym);
  for (const [patp, peer] of state.cometPeers) {
    if (!peer) continue;
    add(patp);
    add(peer.sponsor);
    add(peer.route?.lane?.ship);
  }
  if (state.observatoryOur) add(state.observatoryOur.patp, state.observatoryOur.nym);
  const rank = (comet, format) => {
    if (wordQuery) return format === 'nym'
      ? cometNymWordRank(comet.nym, wordQuery) : Infinity;
    const names = cometSearchNames(comet, format);
    return names.includes(needle) ? 0 : names.some((name) => name.startsWith(needle)) ? 1
      : names.some((name) => name.includes(needle)) ? 2 : Infinity;
  };
  const preferred = query.trim().startsWith('~') ? 'patp'
    : query.trim().startsWith('.') ? 'nym' : state.cometNameFormat;
  return [...known.values()]
    .map((comet) => {
      const patpRank = rank(comet, 'patp');
      const nymRank = rank(comet, 'nym');
      const format = patpRank < nymRank ? 'patp' : nymRank < patpRank ? 'nym' : preferred;
      return { ...comet, searchName: comet[format], searchRank: Math.min(patpRank, nymRank) };
    })
    .filter((comet) => Number.isFinite(comet.searchRank))
    .sort((a, b) => a.searchRank - b.searchRank || a.patp.localeCompare(b.patp));
}

function CometSearchName(name, query) {
  const needle = query.trim().toLowerCase().replace(/^[~.]+/, '');
  const lower = name.toLowerCase();
  const highlighted = new Set();
  const wordQuery = /\s/.test(query.trim()) && !/[~.]/.test(query);
  if (wordQuery) {
    const words = needle.split(/\s+/);
    for (const match of lower.matchAll(/[^.]+/g)) {
      for (const word of words) {
        if (match[0].startsWith(word)) {
          for (let i = 0; i < word.length; i++) highlighted.add(match.index + i);
        }
      }
    }
  } else if (needle) {
    // Map abbreviated search forms back onto the full name in the dropdown.
    const offset = name.match(/^[~.]+/)?.[0].length ?? 0;
    const variants = [Array.from({ length: name.length - offset }, (_, i) => offset + i)];
    const words = [...lower.matchAll(/[^~.\-]+/g)];
    if (words.length > 1) {
      const first = words[0], last = words[words.length - 1];
      variants.push([
        ...Array.from({ length: first[0].length }, (_, i) => first.index + i),
        ...Array(name.startsWith('~') ? 1 : 3).fill(null),
        ...Array.from({ length: last[0].length }, (_, i) => last.index + i)
      ]);
    }
    for (const indices of variants) {
      const text = indices.map((i) => i === null ? (name.startsWith('~') ? '_' : '.') : lower[i]).join('');
      for (let start = text.indexOf(needle); start !== -1; start = text.indexOf(needle, start + 1)) {
        for (const i of indices.slice(start, start + needle.length)) {
          if (i !== null) highlighted.add(i);
        }
      }
    }
  }
  const parts = [];
  for (let start = 0; start < name.length;) {
    const matched = highlighted.has(start);
    let end = start + 1;
    while (end < name.length && highlighted.has(end) === matched) end++;
    parts.push(element('span', {
      text: name.slice(start, end), className: matched ? 'comet-search__match' : ''
    }));
    start = end;
  }
  return element('span', {}, parts);
}

function renderCometSearch() {
  if (explorerState.networkPage !== 'urbit') return;
  const form = document.querySelector('[data-render-key="comet-search"]');
  if (form) reconcileNode(form, CometSearch(explorerState));
  else renderUrbitExplorer();
}

addEventListener('keydown', (event) => {
  if (explorerState.networkPage !== 'urbit' || event.key !== '/' ||
      event.defaultPrevented || event.isComposing || event.repeat ||
      event.ctrlKey || event.metaKey || event.altKey ||
      event.target?.isContentEditable || event.target?.closest?.('input, textarea, select')) return;
  event.preventDefault();
  if (!explorerState.cometSearchOpen) toggleCometSearch();
  else document.querySelector('.comet-search__input')?.focus({ preventScroll: true });
});

function toggleCometSearch() {
  explorerState.cometSearchOpen = !explorerState.cometSearchOpen;
  explorerState.cometSearchError = null;
  renderCometSearch();
  document.querySelector(explorerState.cometSearchOpen ? '.comet-search__input' : '.comet-search__toggle')
    ?.focus({ preventScroll: true });
}

function chooseCometSearchResult(patp) {
  explorerState.cometSearchOpen = false;
  explorerState.cometSearchQuery = '';
  explorerState.cometSearchError = null;
  explorerState.cometSearchActiveIndex = 0;
  selectComet(patp, { center: true });
  document.querySelector('.comet-search__toggle')?.focus({ preventScroll: true });
}

function submitCometSearch(event) {
  event.preventDefault();
  const matches = cometSearchMatches(explorerState.cometSearchQuery, explorerState).slice(0, 8);
  const match = matches[Math.min(explorerState.cometSearchActiveIndex, matches.length - 1)];
  if (match) chooseCometSearchResult(match.patp);
  else {
    explorerState.cometSearchError = 'No matching peer found.';
    renderCometSearch();
  }
}

function CometSearch(state) {
  const matches = state.cometSearchOpen && !state.cometSearchError
    ? cometSearchMatches(state.cometSearchQuery, state).slice(0, 8) : [];
  const active = Math.min(state.cometSearchActiveIndex, matches.length - 1);
  const input = element('input', {
    key: 'comet-search:input', className: 'comet-search__input',
    attributes: {
      id: 'comet-search-input', type: 'search', placeholder: 'Search for a peer',
      value: state.cometSearchQuery, autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false',
      role: 'combobox', 'aria-label': 'Search for a peer', 'aria-autocomplete': 'list',
      'aria-controls': 'comet-search-suggestions', 'aria-expanded': String(matches.length > 0),
      'aria-invalid': String(Boolean(state.cometSearchError)),
      ...(matches[active] ? { 'aria-activedescendant': `comet-search-option-${active}` } : {}),
      ...(state.cometSearchError ? { 'aria-describedby': 'comet-search-error' } : {}),
      ...(!state.cometSearchOpen ? { disabled: '' } : {})
    }
  });
  listen(input, 'input', (event) => {
    explorerState.cometSearchQuery = event.currentTarget.value;
    explorerState.cometSearchActiveIndex = 0;
    explorerState.cometSearchError = null;
    renderCometSearch();
  });
  listen(input, 'keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      toggleCometSearch();
    } else if (matches.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      explorerState.cometSearchActiveIndex = (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      renderCometSearch();
      document.getElementById(`comet-search-option-${explorerState.cometSearchActiveIndex}`)
        ?.scrollIntoView({ block: 'nearest' });
    }
  });
  return listen(element('form', {
    key: 'comet-search', className: `comet-search${state.cometSearchOpen ? ' comet-search--open' : ''}`,
    attributes: { role: 'search', 'aria-label': 'Comet search' }
  }, [
    listen(element('button', {
      key: 'comet-search:toggle', className: 'comet-graph-panel__button comet-search__toggle', text: '🔍︎',
      attributes: {
        type: 'button', 'aria-label': 'Toggle peer search', 'aria-controls': 'comet-search-input',
        'aria-expanded': String(state.cometSearchOpen)
      }
    }), 'click', toggleCometSearch),
    element('div', {
      key: 'comet-search:field', className: 'comet-search__field',
      attributes: { 'aria-hidden': String(!state.cometSearchOpen) }
    }, [input]),
    matches.length ? element('ul', {
      key: 'comet-search:suggestions', className: 'comet-search__suggestions',
      attributes: { id: 'comet-search-suggestions', role: 'listbox', 'aria-label': 'Matching peers' }
    }, matches.map((comet, index) => element('li', {
      key: `comet-search:result:${comet.patp}`, attributes: { role: 'presentation' }
    }, [listen(element('button', {
      className: 'comet-search__option',
      attributes: {
        id: `comet-search-option-${index}`, type: 'button', role: 'option', tabindex: '-1',
        'aria-selected': String(index === active)
      }
    }, [
      CometSearchName(comet.searchName, state.cometSearchQuery)
    ]), 'click', () => chooseCometSearchResult(comet.patp))]))) : null,
    state.cometSearchOpen && state.cometSearchError ? element('p', {
      key: 'comet-search:error', className: 'comet-search__error', text: state.cometSearchError,
      attributes: { id: 'comet-search-error', role: 'alert' }
    }) : null
  ]), 'submit', submitCometSearch);
}

function CometGraphPanel(state) {
  return element('section', {
    key: 'comet-graph-panel', className: 'panel comet-graph-panel',
    attributes: { 'aria-label': 'Comet sponsorship graph' }
  }, [
    CometSearch(state),
    element('div', { key: 'comet-graph:controls', className: 'comet-graph-panel__controls' }, [
      listen(element('button', {
        key: 'comet-graph:names', className: 'comet-graph-panel__button',
        attributes: {
          type: 'button', 'aria-label': 'Display mnemonym names',
          'aria-pressed': String(state.cometNameFormat === 'nym'),
          title: state.cometNameFormat === 'nym' ? 'Switch to patps' : 'Switch to nyms'
        }
      }, [element('span', {
        key: `comet-graph:name-icon:${state.cometNameTogglePulse}`,
        className: `comet-name-icon${state.cometNameTogglePulse ? ' comet-name-icon--pulse' : ''}`,
        text: state.cometNameFormat === 'nym' ? '•' : '~',
        attributes: { 'aria-hidden': 'true' }
      })]), 'click', toggleCometNameFormat),
      listen(element('button', {
        key: 'comet-graph:refresh', className: 'comet-graph-panel__button',
        attributes: {
          type: 'button', 'aria-label': 'Refresh comet graph',
          'aria-busy': String(state.cometRefreshState === 'loading'),
          title: state.cometRefreshState === 'loading' ? 'Refreshing comet graph…'
            : state.cometRefreshState === 'success' ? 'Comet graph refreshed' : 'Refresh comet graph',
          ...(state.cometRefreshState === 'loading' ? { disabled: '' } : {})
        }
      }, [element('span', {
        key: 'comet-graph:refresh-icon',
        className: `comet-refresh-icon comet-refresh-icon--${state.cometRefreshState}`,
        text: '↻', attributes: { 'aria-hidden': 'true' }
      })]), 'click', scryComets)
    ]),
    element('div', {
      key: 'comet-graph:zoom-controls', className: 'comet-graph-panel__zoom',
      attributes: { role: 'group', 'aria-label': 'Graph navigation' }
    }, [
      CometPanButton('up', '▲', 0, -1, !state.cometSponsorshipGraph?.length),
      CometPanButton('left', '◀', -1, 0, !state.cometSponsorshipGraph?.length),
      listen(element('button', {
        key: 'comet-graph:zoom', className: 'comet-graph-panel__button comet-graph-panel__zoom-button',
        text: state.cometGraphZoom === 'overview' ? '+' : '−',
        attributes: {
          type: 'button', 'aria-label': 'Sponsor overview',
          'aria-pressed': String(state.cometGraphZoom === 'overview'),
          title: state.cometGraphZoom === 'overview' ? 'Show full network' : 'Show sponsor overview',
          ...(!state.cometSponsorshipGraph?.length ? { disabled: '' } : {})
        }
      }), 'click', toggleCometGraphZoom),
      CometPanButton('right', '▶', 1, 0, !state.cometSponsorshipGraph?.length),
      CometPanButton('down', '▼', 0, 1, !state.cometSponsorshipGraph?.length)
    ]),
    state.cometSponsorshipGraph?.length
      ? CometNetworkGraph(state)
      : element('p', {
          key: 'comet-graph:status', className: 'comet-graph-panel__status',
          attributes: { role: 'status' },
          text: state.cometScryError ?? (state.cometSponsorshipGraph === null
            ? 'Loading comets…'
            : 'No comets found.')
        })
  ]);
}

function CometDetailsPanel(state) {
  const selectedPatp = state.selectedCometPatp;
  return element('section', {
    key: 'comet-details-panel', className: 'panel comet-details-panel',
    attributes: { 'aria-label': 'Selected comet details' }
  }, [
    element('p', {
      key: 'comet-details:selected-name', className: 'comet-details-panel__name',
      text: selectedPatp ? formatCometName(selectedPatp, state) : 'No comet selected.'
    }),
    CometPeerDetails(selectedPatp, state)
  ]);
}

function BitcoinNetworkPage(state) {
  const selectedBlock = getSelectedBlock(state);
  const blockData = selectedBlock
    ? state.blocks.get(selectedBlock.hash)
    : null;

  return element('div', {
    key: 'network-page:bitcoin', className: 'network-page',
    attributes: { id: 'network-page-bitcoin', role: 'tabpanel', 'aria-labelledby': 'network-page-tab-bitcoin' }
  }, [
    BlockHeaderPanel(visibleHeaders(state), selectedBlock),
    element('section', {
      key: 'explorer-lower-region',
      className: 'panel explorer-data-panel',
      attributes: { 'aria-label': 'Explorer data' }
    }, [
      element('header', {
        key: 'explorer-data-tabs',
        className: 'explorer-data-panel__tabs'
      }, [
        element('div', {
          key: 'network-tabs',
          className: 'peers-panel__tabs',
          attributes: { role: 'tablist', 'aria-label': 'Network data' }
        }, [
          PeerPanelTab('peers', 'Peers'),
          PeerPanelTab('addresses', 'Addresses'),
          PeerPanelTab('blacklist', 'Blacklist'),
          PeerPanelTab('config', 'Config')
        ]),
        element('div', {
          key: 'block-tabs',
          className: 'peers-panel__tabs explorer-data-panel__block-tabs',
          attributes: { role: 'tablist', 'aria-label': 'Open blocks' }
        }, Array.from(state.openBlocks.values(), (block) => BlockDataTab(block, state)))
      ]),
      element('div', {
        key: 'explorer-data-content',
        attributes: { id: 'explorer-data-content' }
      }, [selectedBlock
        ? BlockDataPanel(
            selectedBlock, blockData,
            state.blockTransactionPages.get(selectedBlock.hash) ?? 0, state.bestBlock
          )
        : state.selectedTab.type === 'config'
          ? ConfigPanel(state)
          : PeersPanel(state.peers, state.addresses, state.blacklist, state.selectedTab.type)
      ])
    ])
  ]);
}

function UrbitNetworkPage(state) {
  return element('div', {
    key: 'network-page:urbit', className: 'network-page',
    attributes: { id: 'network-page-urbit', role: 'tabpanel', 'aria-labelledby': 'network-page-tab-urbit' }
  }, [CometGraphPanel(state), CometDetailsPanel(state)]);
}

function ExplorerApp(state) {
  return element('main', { key: 'explorer', className: 'explorer' }, [
    CometIdentityPanel(state),
    state.networkPage === 'bitcoin' ? BitcoinNetworkPage(state) : UrbitNetworkPage(state)
  ]);
}
