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
  selectedBlock: null
};
const headerBatchSize = 20;
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

  explorerState.headers.set(height, {
    height,
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
  });

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

function BlockHeaderCard(header) {
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

  return element('article', {
    className: 'block-header-card',
    attributes: { 'data-block-hash': header.hash }
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
}

function BlockHeaderPanel(headers) {
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
        role: 'list',
        'aria-label': 'Recent block headers'
      }
    }, headers.map((header) => {
      const card = BlockHeaderCard(header);
      card.setAttribute('role', 'listitem');
      return card;
    }))
  ]);
}

function DataField(label, value) {
  return element('div', { className: 'block-data-field' }, [
    element('dt', { className: 'block-data-field__label', text: label }),
    element('dd', { className: 'block-data-field__value', text: value })
  ]);
}

function BlockDataPanel(block) {
  const content = block
    ? element('dl', { className: 'block-data-grid' }, [
        DataField('Height', Number(block.height).toLocaleString()),
        DataField('Hash', block.hash),
        DataField('Timestamp', block.time ?? 'Unavailable'),
        DataField('Transactions', String(block.transactionCount ?? 'Unavailable')),
        DataField('Size', block.size ?? 'Unavailable'),
        DataField('Weight', block.weight ?? 'Unavailable')
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
    attributes: { 'aria-labelledby': 'block-data-title' }
  }, [
    element('header', { className: 'panel__header' }, [
      element('div', {}, [
        element('p', { className: 'panel__eyebrow', text: 'Inspector' }),
        element('h2', {
          className: 'panel__title',
          text: 'Block data',
          attributes: { id: 'block-data-title' }
        })
      ])
    ]),
    content
  ]);
}

function ExplorerApp(state) {
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
    BlockHeaderPanel(recentHeaders(state)),
    BlockDataPanel(state.selectedBlock)
  ]);
}
