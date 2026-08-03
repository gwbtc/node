const app = 'bitcoin-client';
const subPathsToActIds = {};
const channelId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const channelPath = `${window.location.origin}/~/channel/${channelId}`;
let our;
let eventSource;
let channelActId = 0;
let suppressHeaderScroll = false;

const explorerState = {
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
const headerBatchSize = 20;
const headerWindowSize = 60;
const transactionBatchSize = 5;
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
  await sendActions([
    makeSubscribe('/best-block'),
    makeSubscribe('/is-synced')
  ]);
  eventSource = new EventSource(channelPath);
  eventSource.addEventListener('message', handleChannelStream);
}

async function handleChannelStream(event) {
  const msg = JSON.parse(event.data);
  sendActions([makeAck(msg.id)]);
  //if (msg.response === 'quit') // TODO: resubscribe to the subPath associated with msg.id
  if (msg.response !== 'diff') return;

  // console.log(msg.mark);

  if (msg.mark === 'bitcoin-client-best-block') {
    handleBestBlock(msg.json);
  }

  if (msg.mark === 'bitcoin-client-block-header-by-height') {
    handleBlockHeader(msg.json);
  }

  if (msg.mark === 'bitcoin-client-block-header-by-hash') {
    handleBlockHeader(msg.json);
  }

  if (msg.mark === 'bitcoin-client-block-by-height') {
    handleBlock(msg.json);
  }
}

function handleBestBlock(bestBlockJson) {
  const previousBestBlock = explorerState.bestBlock;
  explorerState.bestBlock = {
    height: Number(bestBlockJson['block-height']),
    hash: bestBlockJson['block-hash']
  };

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
    previousBestBlock?.height;

  if (wasAtTip) {
    const highestHeight = explorerState.bestBlock.height;
    let lowestHeight = explorerState.headerWindow.lowestHeight > highestHeight
      ? Math.max(0, highestHeight - headerBatchSize + 1)
      : explorerState.headerWindow.lowestHeight;

    if (highestHeight - lowestHeight + 1 > headerWindowSize) {
      lowestHeight = highestHeight - headerWindowSize + 1;
    }

    setHeaderWindow({ highestHeight, lowestHeight });
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

function requestHeaderRange(lowestHeight, highestHeight, force = false) {
  const headerSubscriptions = [];

  for (let height = highestHeight; height >= lowestHeight; height--) {
    if (explorerState.pendingHeaderHeights.has(height)) continue;
    if (!force && getHeaderByHeight(explorerState, height)) continue;

    explorerState.pendingHeaderHeights.add(height);
    const hoonHeight = formatHoonDecimal(height);
    headerSubscriptions.push(
      makeSubscribe(`/block-header/height/${hoonHeight}`)
    );
  }

  if (headerSubscriptions.length > 0) sendActions(headerSubscriptions);
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
    sendActions([
      makeSubscribe(`/block-header/hash/${formatHoonHex(value)}`)
    ]);
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
  let root = document.getElementById('explorer-root');

  if (!root) {
    root = element('div', {
      attributes: { id: 'explorer-root' }
    });
  }

  document.body.replaceChildren(root);
  root.replaceChildren(ExplorerApp(explorerState));
  restoreHeaderScrollAnchor(scrollAnchor);
}

function element(tagName, options = {}, children = []) {
  const node = document.createElement(tagName);
  const { className, text, attributes = {} } = options;

  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;

  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }

  node.append(...children.filter(Boolean));
  return node;
}

function BlockHeaderCard(header, selectedBlock) {
  if (header.isPlaceholder) {
    return element('article', {
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
  const card = element('article', {
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
      className: 'block-header-card__height',
      text: Number(header.height).toLocaleString()
    }),
    element('p', {
      className: 'block-header-card__hash',
      text: header.hash
    }),
    element('p', {
      className: 'block-header-card__meta',
      text: formatBlockTime(header.time)
    })
  ]);

  card.addEventListener('click', () => selectBlock(header));
  card.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    selectBlock(header);
  });

  return card;
}

function BlockHeaderPanel(headers, selectedBlock) {
  const searchInput = element('input', {
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
  searchInput.addEventListener('input', (event) => {
    explorerState.headerSearchQuery = event.currentTarget.value;
    explorerState.headerSearchError = null;
    event.currentTarget.setAttribute('aria-invalid', 'false');
    const error = document.getElementById('block-search-error');
    if (error) error.textContent = '';
  });

  const searchForm = element('form', {
    className: 'block-search-form',
    attributes: { role: 'search' }
  }, [
    searchInput,
    element('span', {
      className: 'block-search-error',
      text: explorerState.headerSearchError ?? '',
      attributes: {
        id: 'block-search-error',
        'aria-live': 'polite'
      }
    })
  ]);
  searchForm.addEventListener('submit', handleHeaderSearch);

  const headerRow = element('div', {
    className: 'block-header-row',
    attributes: {
      role: 'group',
      'aria-label': 'Block headers'
    }
  }, headers.map((header) => BlockHeaderCard(header, selectedBlock)));
  const bestBlockButton = element('button', {
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
      className: 'block-header-tip-button__arrow',
      text: '←',
      attributes: { 'aria-hidden': 'true' }
    }),
    element('span', {
      className: 'block-header-tip-button__height',
      text: explorerState.bestBlock
        ? Number(explorerState.bestBlock.height).toLocaleString()
        : '—'
    })
  ]);
  bestBlockButton.addEventListener('click', selectBestBlock);
  headerRow.addEventListener(
    'scroll',
    () => {
      handleHeaderPanelScroll(headerRow);
      updateBestBlockButtonVisibility(headerRow, bestBlockButton);
    },
    { passive: true }
  );
  requestAnimationFrame(() => {
    if (headerRow.isConnected) {
      updateBestBlockButtonVisibility(headerRow, bestBlockButton);
    }
  });

  const headerViewport = element('div', {
    className: 'block-header-viewport'
  }, [
    headerRow,
    bestBlockButton
  ]);

  return element('section', {
    className: 'panel block-header-panel',
    attributes: { 'aria-label': 'Block headers' }
  }, [
    element('header', { className: 'panel__header' }, [
      searchForm,
      element('div', { className: 'network-badge', text: 'Bitcoin network' })
    ]),
    headerViewport
  ]);
}

function BlockDetailField(label, value) {
  return element('div', { className: 'block-detail-field' }, [
    element('dt', { className: 'block-detail-field__label', text: label }),
    element('dd', { className: 'block-detail-field__value', text: value })
  ]);
}

function BlockHeaderData(block) {
  return element('div', { className: 'block-details' }, [
    element('section', {
      className: 'block-details__section block-details__section--chain',
      attributes: { 'aria-label': 'Chain data' }
    }, [
      element('dl', { className: 'block-detail-list' }, [
        BlockDetailField(
          'Confirmations',
          String(block.confirmations ?? 'Unavailable')
        ),
        BlockDetailField('Chainwork', block.chainwork)
      ])
    ]),
    element('section', {
      className: 'block-details__section',
      attributes: { 'aria-labelledby': 'block-header-fields-title' }
    }, [
      element('h3', {
        className: 'block-details__title',
        text: 'Block header',
        attributes: { id: 'block-header-fields-title' }
      }),
      element('dl', { className: 'block-detail-list' }, [
        BlockDetailField('Version', block.version),
        BlockDetailField('Previous block hash', block.previousBlockHash),
        BlockDetailField('Merkle root', block.merkleRoot),
        BlockDetailField(
          'Time',
          `${block.time} · ${formatBlockTime(block.time)}`
        ),
        BlockDetailField('Bits', block.bits),
        BlockDetailField('Nonce', block.nonce)
      ])
    ])
  ]);
}

function TransactionInput(input, index) {
  return element('li', { className: 'transaction-io__item' }, [
    element('span', {
      className: 'transaction-io__index',
      text: `Input ${index + 1}`
    }),
    element('code', {
      className: 'transaction-io__value',
      text: `${input.txid}:${input.vout}`
    })
  ]);
}

function TransactionOutput(output, index) {
  return element('li', { className: 'transaction-io__item' }, [
    element('span', {
      className: 'transaction-io__index',
      text: `Output ${index + 1} · ${Number(output.value).toLocaleString()} sats`
    }),
    element('code', {
      className: 'transaction-io__value',
      text: output['script-pubkey']
    })
  ]);
}

function TransactionCard(transaction, index) {
  const inputs = transaction.inputs ?? [];
  const outputs = transaction.outputs ?? [];

  return element('details', { className: 'transaction-card' }, [
    element('summary', { className: 'transaction-card__summary' }, [
      element('span', {
        className: 'transaction-card__title',
        text: `Transaction ${index + 1}`
      }),
      element('span', {
        className: 'transaction-card__counts',
        text: `${inputs.length} inputs · ${outputs.length} outputs`
      })
    ]),
    element('div', { className: 'transaction-card__body' }, [
      element('p', {
        className: 'transaction-card__meta',
        text: `Version ${transaction.version} · Locktime ${transaction.locktime}`
      }),
      element('h4', { className: 'transaction-io__title', text: 'Inputs' }),
      element('ul', { className: 'transaction-io' },
        inputs.map(TransactionInput)),
      element('h4', { className: 'transaction-io__title', text: 'Outputs' }),
      element('ul', { className: 'transaction-io' },
        outputs.map(TransactionOutput))
    ])
  ]);
}

function changeTransactionPage(page, pageCount) {
  explorerState.transactionPage = Math.max(0, Math.min(page, pageCount - 1));
  renderExplorer();
}

function TransactionPaginationButton(label, text, disabled, onClick) {
  const button = element('button', {
    className: 'transaction-pagination__button',
    text,
    attributes: {
      type: 'button',
      'aria-label': label,
      ...(disabled ? { disabled: '' } : {})
    }
  });

  if (!disabled) button.addEventListener('click', onClick);
  return button;
}

function TransactionList(transactions, currentPage) {
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
    className: 'block-transactions',
    attributes: { 'aria-labelledby': 'block-transactions-title' }
  }, [
    element('header', { className: 'block-transactions__header' }, [
      element('h3', {
        className: 'block-transactions__title',
        text: 'Transactions',
        attributes: { id: 'block-transactions-title' }
      }),
      element('span', {
        className: 'block-transactions__count',
        text: String(transactions.length)
      })
    ]),
    element('div', { className: 'transaction-list' },
      visibleTransactions.map((transaction, index) =>
        TransactionCard(transaction, firstTransaction + index))),
    element('nav', {
      className: 'transaction-pagination',
      attributes: { 'aria-label': 'Transaction pages' }
    }, [
      TransactionPaginationButton(
        'Previous transactions',
        '←',
        page === 0,
        () => changeTransactionPage(page - 1, pageCount)
      ),
      element('span', {
        className: 'transaction-pagination__status',
        text: `${page + 1} / ${pageCount}`,
        attributes: { 'aria-live': 'polite' }
      }),
      TransactionPaginationButton(
        'Next transactions',
        '→',
        page === pageCount - 1,
        () => changeTransactionPage(page + 1, pageCount)
      )
    ])
  ]);
}

function BlockLoadingIndicator() {
  return element('div', {
    className: 'block-data-loading',
    attributes: {
      role: 'status',
      'aria-live': 'polite'
    }
  }, [
    element('span', {
      className: 'block-data-loading__spinner',
      attributes: { 'aria-hidden': 'true' }
    }),
    element('span', { text: 'Loading transactions…' })
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
    className: 'block-data-panel__copy',
    text: 'Copy',
    attributes: {
      type: 'button',
      'aria-label': 'Copy block hash',
      'aria-live': 'polite'
    }
  });

  button.addEventListener('click', async () => {
    try {
      await copyTextToClipboard(blockHash);
      button.textContent = 'Copied';
    } catch (error) {
      button.textContent = 'Copy failed';
    }

    setTimeout(() => {
      if (button.isConnected) button.textContent = 'Copy';
    }, 1_500);
  });

  return button;
}

function BlockDataPanel(block, blockData, transactionPage) {
  const content = block
    ? element('div', { className: 'block-data-content' }, [
        BlockHeaderData(block),
        blockData
          ? TransactionList(blockData.transactions, transactionPage)
          : BlockLoadingIndicator()
      ])
    : element('div', { className: 'block-data-empty' }, [
        element('div', {
          className: 'block-data-empty__icon',
          text: '₿',
          attributes: { 'aria-hidden': 'true' }
        }),
        element('h3', {
          className: 'block-data-empty__title',
          text: 'No block selected'
        }),
        element('p', {
          className: 'block-data-empty__copy',
          text: 'Select a header above to inspect its block data.'
        })
      ]);

  return element('section', {
    className: 'panel block-data-panel',
    attributes: block
      ? { 'aria-labelledby': 'block-data-title' }
      : { 'aria-label': 'Block data' }
  }, [
    block
      ? element('header', {
          className: 'panel__header block-data-panel__header'
        }, [
          element('h2', {
            className: 'block-data-panel__title',
            text: 'Block',
            attributes: { id: 'block-data-title' }
          }),
          element('div', { className: 'block-data-panel__hash-group' }, [
            element('code', {
              className: 'block-data-panel__hash',
              text: block.hash
            }),
            CopyBlockHashButton(block.hash)
          ]),
          element('span', {
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

  return element('main', { className: 'explorer' }, [
    element('header', { className: 'explorer__header' }, [
      element('h1', { className: 'explorer__title' }, [
        element('span', {
          className: 'explorer__initials',
          text: 'GW'
        }),
        element('span', { text: '%explorer' })
      ])
    ]),
    BlockHeaderPanel(visibleHeaders(state), state.selectedBlock),
    BlockDataPanel(state.selectedBlock, blockData, state.transactionPage)
  ]);
}
