const app = 'bitcoin-client';
const subPathsToActIds = {};
const channelId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const channelPath = `${window.location.origin}/~/channel/${channelId}`;
let our;
let eventSource;
let channelActId = 0;

const explorerState = {
  bestBlock: null,
  headers: new Map(),
  blocks: new Map(),
  pendingBlocks: new Set(),
  selectedBlock: null,
  transactionPage: 0
};
const headerBatchSize = 20;
const transactionBatchSize = 5;
const headerPlaceholders = Array.from({ length: 6 }, (_, index) => ({
  id: `header-placeholder-${index}`,
  isPlaceholder: true
}));

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

  console.log(msg.mark);

  if (msg.mark === 'bitcoin-client-best-block') {
    handleBestBlock(msg.json);
  }

  if (msg.mark === 'bitcoin-client-block-header-by-height') {
    handleBlockHeader(msg.json);
  }

  if (msg.mark === 'bitcoin-client-block-by-height') {
    handleBlock(msg.json);
  }
}

function handleBestBlock(bestBlockJson) {
  explorerState.bestBlock = {
    height: Number(bestBlockJson['block-height']),
    hash: bestBlockJson['block-hash']
  };

  const firstHeight = Math.max(
    0,
    explorerState.bestBlock.height - headerBatchSize + 1
  );
  const headerSubscriptions = [];

  for (let height = explorerState.bestBlock.height; height >= firstHeight; height--) {
    const hoonHeight = formatHoonDecimal(height);
    headerSubscriptions.push(makeSubscribe(`/block-header/height/${hoonHeight}`));
  }

  sendActions(headerSubscriptions);
}

function formatHoonDecimal(number) {
  return String(number).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function handleBlockHeader(headerJson) {
  const blockInfo = headerJson['block-info'];
  const blockHeader = headerJson['block-header'];
  const height = Number(blockInfo['block-height']);

  explorerState.headers.set(height, normalizeBlockHeader(blockInfo, blockHeader));

  renderExplorer();
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
  explorerState.transactionPage = 0;

  const isSelected = explorerState.selectedBlock?.height === header.height &&
    explorerState.selectedBlock.hash === header.hash;

  if (isSelected) {
    explorerState.selectedBlock = null;
    renderExplorer();
    return;
  }

  explorerState.selectedBlock = header;

  if (!explorerState.blocks.has(header.hash) &&
      !explorerState.pendingBlocks.has(header.hash)) {
    explorerState.pendingBlocks.add(header.hash);
    const hoonHeight = formatHoonDecimal(header.height);
    sendActions([makeSubscribe(`/block/height/${hoonHeight}`)]);
  }

  renderExplorer();
}

function recentHeaders(state) {
  if (!state.bestBlock) return headerPlaceholders;

  const firstHeight = Math.max(
    0,
    state.bestBlock.height - headerBatchSize + 1
  );
  const headers = [];

  for (let height = state.bestBlock.height; height >= firstHeight; height--) {
    const header = state.headers.get(height);
    if (header) headers.push(header);
  }

  return headers.length > 0 ? headers : headerPlaceholders;
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

function renderExplorer() {
  let root = document.getElementById('explorer-root');

  if (!root) {
    root = element('div', {
      attributes: { id: 'explorer-root' }
    });
  }

  document.body.replaceChildren(root);
  root.replaceChildren(ExplorerApp(explorerState));
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
      attributes: { 'aria-hidden': 'true' }
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
  return element('section', {
    className: 'panel block-header-panel',
    attributes: { 'aria-label': 'Recent block headers' }
  }, [
    element('header', { className: 'panel__header' }, [
      element('input', {
        className: 'block-search',
        attributes: {
          type: 'search',
          placeholder: 'Search by block height or block hash',
          'aria-label': 'Search by block height or block hash',
          autocomplete: 'off',
          spellcheck: 'false'
        }
      }),
      element('div', { className: 'network-badge', text: 'Bitcoin network' })
    ]),
    element('div', {
      className: 'block-header-row',
      attributes: {
        role: 'group',
        'aria-label': 'Recent block headers'
      }
    }, headers.map((header) => BlockHeaderCard(header, selectedBlock)))
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
          element('code', {
            className: 'block-data-panel__hash',
            text: block.hash
          }),
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
    BlockHeaderPanel(recentHeaders(state), state.selectedBlock),
    BlockDataPanel(state.selectedBlock, blockData, state.transactionPage)
  ]);
}
