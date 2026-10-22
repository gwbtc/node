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

const explorerState = {
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
  const hasValidNetwork = await scryNetwork();
  if (hasValidNetwork) connectToShip();
});

function handleConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return;
  explorerState.config = config;
  if (explorerState.selectedTab.type === 'config') renderExplorer();
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
    renderExplorer();
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
    renderExplorer();
  });
  eventSource.addEventListener('open', () => {
    refreshIsSynced();
    if (!explorerState.shipReconnecting) return;
    explorerState.shipReconnecting = false;
    renderExplorer();
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

function scheduleNetworkPanelRender(tabs) {
  for (const tab of tabs) dirtyNetworkTabs.add(tab);
  if (networkPanelFrame !== null) return;
  networkPanelFrame = requestAnimationFrame(() => {
    networkPanelFrame = null;
    const tab = explorerState.selectedTab.type;
    const needsRender = dirtyNetworkTabs.has(tab);
    if (dirtyNetworkTabs.has('peers')) {
      const status = document.querySelector('[data-render-key="status-module"]');
      if (status) reconcileNode(status, StatusModule());
    }
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
  if (syncStatusChanged) renderExplorer();
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
    renderExplorer();
  } catch {
    // A later poll will retry until syncing is complete and both tips match.
  } finally {
    bestFilterHeaderPollInFlight = false;
    scheduleBestFilterHeaderPoll();
  }
}

function headerRowIsAtStart() {
  const row = document.querySelector('.block-header-row');
  return !row || row.scrollLeft <= 1;
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
    renderExplorer();
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
    renderExplorer(pendingSearch?.scrollAnchor ?? null);
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

  if (headerWindowHasHeight(height)) renderExplorer();
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
  renderExplorer(pendingSearch.scrollAnchor ?? null);
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
  renderExplorer(scrollAnchor);
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
  renderExplorer(null);

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
    renderExplorer();
  }
}

function getSelectedBlock(state = explorerState) {
  return state.selectedTab.type === 'block'
    ? state.openBlocks.get(state.selectedTab.hash) ?? null
    : null;
}

function selectBlock(header) {
  setSelectedBlock(header);
  renderExplorer();
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
  if (headerViewedFrame !== null) return;
  headerViewedFrame = requestAnimationFrame(() => {
    headerViewedFrame = null;
    updateViewedHeaderHeight();
  });
}

function updateViewedHeaderHeight() {
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
    renderExplorer(null);
    requestHeaderRange(bestBlock.height, bestBlock.height);
    return;
  }

  setSelectedBlock(header);

  if (explorerState.headerWindow?.highestHeight === bestBlock.height) {
    renderExplorer(null);
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
      ban.error = 'Choose a future expiration time or select No expiration.';
      renderExplorer();
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
  renderExplorer();

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
    renderExplorer();
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

function renderExplorer(scrollAnchor = captureHeaderScrollAnchor()) {
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
  const currentChildren = Array.from(currentElement.childNodes);
  const usedChildren = new Set();
  const nextChildren = Array.from(nextElement.childNodes);

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
  renderExplorer();
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
    element('header', {
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
        text: String(transactions.length)
      })
    ]),
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
  return element('div', {
    key: `block:${blockHash}:loading`,
    className: 'block-data-loading',
    attributes: {
      role: 'status',
      'aria-live': 'polite'
    }
  }, [
    element('span', {
      key: `block:${blockHash}:loading:spinner`,
      className: 'block-data-loading__spinner',
      attributes: { 'aria-hidden': 'true' }
    }),
    element('span', {
      key: `block:${blockHash}:loading:label`,
      text: 'Loading transactions…'
    })
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
      renderExplorer();
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
    renderExplorer();
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
  renderExplorer();
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
    renderExplorer();
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
      ban.error = 'Choose a future expiration time or select No expiration.';
      renderExplorer();
      return;
    }
    action = 'ban-peer';
    payload = { 'earth-address': payload, reason: ban.reason, expiration };
  }

  explorerState.pendingAddressRemovals.add(entry.key);
  renderExplorer();
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
    renderExplorer();
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
    renderExplorer();
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
  renderExplorer();
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
    renderExplorer();
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
    renderExplorer();
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
  renderExplorer();
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
      text: source === null ? 'Waiting for data…' : emptyText
    })
  ]);
}

function changePeerPanelPage(tab, page, pageCount) {
  explorerState[peerPageStateKey(tab)] = Math.max(
    0,
    Math.min(page, pageCount - 1)
  );
  renderExplorer();
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
    renderExplorer();
    return;
  }
  const key = peerKey(address);
  if (explorerState.peers?.has(key) || explorerState.pendingPeerConnects.has(key)) {
    explorerState.peerConnectError = 'Already connected or connecting to this address.';
    renderExplorer();
    return;
  }

  explorerState.peerConnectPending = true;
  explorerState.pendingPeerConnects.add(key);
  renderExplorer();
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
    renderExplorer();
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
  renderExplorer();
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

const configActionFields = ['verb', 'target-addresses', 'target-peers', 'target-priority-peers'];

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
        explorerState.configSaveError = 'Targets must be non-negative whole numbers within the supported range.';
        renderExplorer();
        return;
      }
      values[name] = Number(input);
    }
  }
  explorerState.configSaving = true;
  renderExplorer();
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
    renderExplorer();
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
      renderExplorer();
    }),
    button(state.configSaving ? 'Saving…' : 'Save', null, 'submit')
  ] : [button('Edit', () => {
    explorerState.configDraft = Object.fromEntries(configActionFields.map((name) => [
      name, name === 'verb' ? state.config.verb === true : String(state.config[name])
    ]));
    explorerState.configSaveError = null;
    renderExplorer();
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
            const label = name === 'verb' ? 'verbosity' : name.replaceAll('-', ' ');
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
              renderExplorer();
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

function ExplorerApp(state) {
  const selectedBlock = getSelectedBlock(state);
  const blockData = selectedBlock
    ? state.blocks.get(selectedBlock.hash)
    : null;

  return element('main', {
    key: 'explorer',
    className: 'explorer'
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
