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

const explorerState = {
  isSynced: null,
  bestBlock: null,
  headers: new Map(),
  headerHashesByHeight: new Map(),
  headerWindow: null,
  pendingHeaderHeights: new Set(),
  blocks: new Map(),
  pendingBlocks: new Set(),
  selectedBlock: null,
  transactionPage: 0,
  headerSearchQuery: '',
  headerSearchError: null,
  pendingHeaderSearch: null
};
let suppressHeaderScroll = false;
const headerBatchSize = 20;
const headerWindowSize = 60;
const transactionBatchSize = 5;
const bestBlockPollInterval = 3000;
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

addEventListener('DOMContentLoaded', () => {
  our = document.documentElement.getAttribute('our');
  renderExplorer();
  connectToShip();
});

async function connectToShip() {
  await sendActions([makeSubscribe('/is-synced')]);
  eventSource = new EventSource(channelPath);
  eventSource.addEventListener('message', handleChannelStream);
}

async function handleChannelStream(event) {
  const msg = JSON.parse(event.data);
  sendActions([makeAck(msg.id)]);
  //if (msg.response === 'quit') // TODO: resubscribe to the subPath associated with msg.id
  if (msg.response !== 'diff') return;

  // console.log(msg.mark);

  if (msg.mark === 'bitcoin-client-is-synced') {
    handleIsSynced(msg.json);
  }

  if (msg.mark === 'bitcoin-client-best-block' && bestBlockSubscribed) {
    handleBestBlock(msg.json);
  }

  if (msg.mark === 'bitcoin-client-block-by-height') {
    handleBlock(msg.json);
  }
}

function handleIsSynced(isSynced) {
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

async function pollBestBlock() {
  if (explorerState.isSynced || bestBlockPollInFlight) return;

  bestBlockPollInFlight = true;

  try {
    const response = await fetch(`${scryBasePath}/best-block.json`);
    if (!response.ok) {
      throw new Error(`Best block scry failed with status ${response.status}`);
    }

    const bestBlockJson = await response.json();
    if (!explorerState.isSynced) {
      handleBestBlock(bestBlockJson, { requireVisibleTip: true });
    }
  } catch {
    // A later poll will retry while the light client is still syncing.
  } finally {
    bestBlockPollInFlight = false;
    scheduleBestBlockPoll();
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
  return response.json();
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
    handleBlockHeader(headerJson);
  } catch {
    handleHeaderScryError('hash', blockHash);
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
    confirmations: blockInfo.confirmations,
    nextBlockHash: blockInfo['next-block-hash'],
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

  if (explorerState.selectedBlock?.hash === blockInfo['block-hash']) {
    renderExplorer();
  }
}

function selectBlock(header) {
  const isSelected = explorerState.selectedBlock?.height === header.height &&
    explorerState.selectedBlock.hash === header.hash;

  if (isSelected) {
    explorerState.selectedBlock = null;
    explorerState.transactionPage = 0;
    renderExplorer();
    return;
  }

  setSelectedBlock(header);
  renderExplorer();
}

function setSelectedBlock(header) {
  explorerState.selectedBlock = header;
  explorerState.transactionPage = 0;

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

  suppressHeaderScroll = true;
  row.scrollLeft = anchorCard.offsetLeft - scrollAnchor.offset;
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

function handleHeaderPanelScroll(row) {
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

function makePoke(mark, jsonData) {
  channelActId++;
  return {
    id: channelActId,
    action: 'poke',
    ship: our,
    app: app,
    mark: mark,
    json: jsonData
  };
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
  const cardKey = `block-header:${header.hash}`;
  const card = element('article', {
    key: cardKey,
    className: `block-header-card${isSelected ? ' block-header-card--selected' : ''}`,
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
    element('p', {
      key: `${cardKey}:hash`,
      className: 'block-header-card__hash',
      text: header.hash
    }),
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
      text: '←',
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
      element('div', {
        key: 'status-module',
        className: 'status-module',
        attributes: {
          role: 'status',
          'aria-live': 'polite'
        }
      }, [
        element('span', {
          key: 'status-module:network',
          className: 'status-module__item status-module__item--network',
          text: 'Bitcoin network'
        }),
        element('span', {
          key: 'status-module:sync',
          className: `status-module__item status-module__item--${
            explorerState.isSynced ? 'synced' : 'syncing'
          }`,
          text: explorerState.isSynced ? 'Synced' : 'Syncing'
        })
      ])
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

function BlockHeaderData(block) {
  const blockKey = `block:${block.hash}`;

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
          String(block.confirmations ?? 'Unavailable'),
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
        text: `Transaction ${index + 1}`
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
  explorerState.transactionPage = Math.max(0, Math.min(page, pageCount - 1));
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

function BlockDataPanel(block, blockData, transactionPage) {
  const blockKey = block ? `block:${block.hash}` : 'block:none';
  const content = block
    ? element('div', {
        key: `${blockKey}:content`,
        className: 'block-data-content'
      }, [
        BlockHeaderData(block),
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
    className: 'panel block-data-panel',
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

function ExplorerApp(state) {
  const blockData = state.selectedBlock
    ? state.blocks.get(state.selectedBlock.hash)
    : null;

  return element('main', {
    key: 'explorer',
    className: 'explorer'
  }, [
    element('header', {
      key: 'explorer-header',
      className: 'explorer__header'
    }, [
      element('h1', {
        key: 'explorer-title',
        className: 'explorer__title'
      }, [
        element('span', {
          key: 'explorer-title:initials',
          className: 'explorer__initials',
          text: 'GW'
        }),
        element('span', {
          key: 'explorer-title:name',
          text: '%explorer'
        })
      ])
    ]),
    BlockHeaderPanel(visibleHeaders(state), state.selectedBlock),
    BlockDataPanel(state.selectedBlock, blockData, state.transactionPage)
  ]);
}
