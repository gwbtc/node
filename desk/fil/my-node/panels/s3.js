// S3 / Jars settings panel.
//
// Talks to %s3-server's HTTP API at /jars, authenticated by the Eyre session
// cookie (same origin, so fetch sends it automatically). Responses follow the
// S3 REST API: listings and errors are XML, objects are raw bytes.
//
// The bucket list comes from a scry instead (/~/scry/s3-server/buckets.json),
// because GET /jars with cookie auth returns the config HTML page, and S3
// ListBuckets there needs SigV4.

import { scry, el, statusLine, runWithStatus, cardHeader, isShown, copyText } from '../lib.js';

const BASE = '/jars';
const LAST_BUCKET_KEY = 'my-node.s3.bucket';

// --- API client ---

class S3Error extends Error {
  constructor(status, code, message) {
    super(`${code || status}: ${message || 'request failed'}`);
    this.code = code;
  }
}

// Keys may contain '/', so encode each segment separately.
function objectUrl(bucket, key) {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${BASE}/${encodeURIComponent(bucket)}/${encodedKey}`;
}

function bucketUrl(bucket) {
  return `${BASE}/${encodeURIComponent(bucket)}`;
}

function parseXml(text) {
  return new DOMParser().parseFromString(text, 'application/xml');
}

function xmlText(parent, tag) {
  return parent.getElementsByTagName(tag)[0]?.textContent ?? '';
}

// Throws S3Error for non-2xx, using the <Error> XML body when there is one.
async function check(res) {
  if (res.ok) return res;
  let code = '';
  let message = res.statusText;
  const text = await res.text().catch(() => '');
  if (text.includes('<Error>')) {
    const doc = parseXml(text);
    code = xmlText(doc, 'Code');
    message = xmlText(doc, 'Message') || message;
  } else if (text.trim().startsWith('{')) {
    try {
      message = JSON.parse(text).error ?? message;
    } catch {}
  }
  throw new S3Error(res.status, code, message);
}

// Scry /x/buckets (mark %s3-buckets, converted to json by Gall) -> sorted names
async function listBuckets() {
  return scry('s3-server', '/buckets');
}

// GET /jars/<bucket>?prefix= -> { isTruncated, objects: [{ key, size, lastModified }] }
async function listObjects(bucket, prefix) {
  const query = prefix ? `?${new URLSearchParams({ prefix })}` : '';
  const res = await check(await fetch(`${bucketUrl(bucket)}${query}`));
  const doc = parseXml(await res.text());
  return {
    isTruncated: xmlText(doc, 'IsTruncated') === 'true',
    objects: [...doc.getElementsByTagName('Contents')].map((c) => ({
      key: xmlText(c, 'Key'),
      size: Number(xmlText(c, 'Size')),
      lastModified: new Date(xmlText(c, 'LastModified'))
    }))
  };
}

// PUT /jars/<bucket> (no-op if it already exists)
async function createBucket(bucket) {
  await check(await fetch(bucketUrl(bucket), { method: 'PUT' }));
}

// PUT /jars/<bucket>/<key> with the file bytes
async function putObject(bucket, key, blob) {
  await check(
    await fetch(objectUrl(bucket, key), {
      method: 'PUT',
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob
    })
  );
}

// DELETE /jars/<bucket>/<key>
async function deleteObject(bucket, key) {
  await check(await fetch(objectUrl(bucket, key), { method: 'DELETE' }));
}

// POST /jars {action: 'configure-storage', url}
// Points %storage at <url>/jars with this s3-server's credentials,
// and creates + selects the 'default' bucket.
async function configureStorage(url) {
  await check(
    await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'configure-storage', url })
    })
  );
}

// --- Rendering ---

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function readLastBucket() {
  try {
    return localStorage.getItem(LAST_BUCKET_KEY) || 'default';
  } catch {
    return 'default';
  }
}

function saveLastBucket(bucket) {
  try {
    localStorage.setItem(LAST_BUCKET_KEY, bucket);
  } catch {}
}

export function render(root) {
  const state = {
    buckets: [],
    bucket: readLastBucket(),
    prefix: '',
    listing: null,
    error: null
  };

  // Each card reports its own actions under its own form.
  const setupStatus = statusLine();
  const bucketsStatus = statusLine();
  const uploadStatus = statusLine();

  // Runs an action on a card's status line. fn may return a string to show
  // instead of "done".
  const run = (status, label, fn) => runWithStatus(status, label, fn);

  // Storage setup
  const urlInput = el('input', {
    type: 'url',
    value: window.location.origin,
    placeholder: 'https://your-ship.example.com',
    required: true
  });
  const setupForm = el('form', {
    className: 'mn-row',
    onsubmit: (e) => {
      e.preventDefault();
      // configure-storage also creates the 'default' bucket
      run(setupStatus, 'Configure storage', async () => {
        await configureStorage(urlInput.value.trim());
        await loadBuckets();
      });
    }
  }, [
    el('label', {}, ['Public URL ', urlInput]),
    el('button', { type: 'submit' }, ['Configure storage'])
  ]);

  // Bucket selection (from the buckets scry)
  const bucketSelect = el('select', {
    onchange: () => openBucket(bucketSelect.value)
  });

  function renderBucketOptions() {
    bucketSelect.replaceChildren(
      ...state.buckets.map((name) => el('option', { value: name }, [name]))
    );
    bucketSelect.disabled = state.buckets.length === 0;
    if (state.bucket) bucketSelect.value = state.bucket;
  }

  // New bucket
  const newBucketInput = el('input', {
    type: 'text',
    placeholder: 'new-bucket-name',
    required: true,
    pattern: '[a-z0-9.\\-]+',
    title: 'lowercase letters, digits, dots and hyphens'
  });
  const newBucketForm = el('form', {
    className: 'mn-row',
    onsubmit: (e) => {
      e.preventDefault();
      const name = newBucketInput.value.trim();
      run(bucketsStatus, `Create bucket ${name}`, async () => {
        await createBucket(name);
        newBucketForm.reset();
        await loadBuckets(name);
      });
    }
  }, [newBucketInput, el('button', { type: 'submit' }, ['Create bucket'])]);

  const bucketRow = el('div', { className: 'mn-row' }, [
    el('label', {}, ['Bucket ', bucketSelect]),
    el('button', { type: 'button', onclick: () => loadBuckets() }, ['Reload'])
  ]);

  // Prefix filter
  const prefixInput = el('input', { type: 'search', placeholder: 'Filter by name' });
  prefixInput.addEventListener('change', () => {
    state.prefix = prefixInput.value;
    refresh();
  });

  // Upload: a drop area for one or more files (or a click to pick them),
  // an optional key for a single file, and the Upload button
  const fileInput = el('input', { type: 'file', multiple: true, className: 'mn-drop__input' });
  const dropText = el('span');
  const dropArea = el('label', { className: 'mn-drop' }, [fileInput, dropText]);
  const keyInput = el('input', { type: 'text', placeholder: 'File name' });
  const uploadButton = el('button', { type: 'submit' }, ['Upload']);

  // what the drop area says, and whether a key can be typed
  function showChosen() {
    const files = Array.from(fileInput.files || []);
    if (!files.length) {
      dropText.replaceChildren(
        el('strong', {}, ['Drop files here']),
        ...(state.bucket ? [' to upload them to ', el('strong', {}, [state.bucket])] : []),
        ' or click to choose'
      );
    } else {
      const total = files.reduce((n, f) => n + f.size, 0);
      dropText.replaceChildren(
        el('strong', {}, [files.length === 1 ? files[0].name : `${files.length} files`]),
        ` · ${formatSize(total)} · drop or click to change`
      );
    }
    dropArea.classList.toggle('mn-drop--chosen', files.length > 0);
    // several files go up under their own names
    keyInput.disabled = files.length > 1;
    keyInput.placeholder = files.length > 1 ? 'Each file keeps its own name' : 'Name';
    // one file: its name goes in the key, unless the owner typed a key of
    // their own; a key filled in from an earlier file is replaced
    const typed = keyInput.value !== '' && keyInput.value !== autoKey;
    if (files.length > 1 || (!files.length && !typed)) keyInput.value = '';
    else if (files.length === 1 && !typed) keyInput.value = files[0].name;
    autoKey = keyInput.value === files[0]?.name ? keyInput.value : '';
  }
  let autoKey = ''; // the key showChosen filled in, to tell it from a typed one
  fileInput.addEventListener('change', showChosen);

  // drag and drop onto the area: highlight while over it, take the files
  let dragDepth = 0; // dragenter/leave fire for children too
  dropArea.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    dropArea.classList.add('mn-drop--over');
  });
  dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  dropArea.addEventListener('dragleave', () => {
    if (--dragDepth <= 0) {
      dragDepth = 0;
      dropArea.classList.remove('mn-drop--over');
    }
  });
  dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropArea.classList.remove('mn-drop--over');
    if (e.dataTransfer?.files?.length) {
      fileInput.files = e.dataTransfer.files;
      showChosen();
    }
  });
  // a file dropped next to the area would make the browser open it and
  // leave the page, so ignore drops elsewhere while this panel is on screen
  for (const type of ['dragover', 'drop']) {
    window.addEventListener(type, (e) => {
      if (!dropArea.contains(e.target) && e.dataTransfer?.types?.includes('Files') && isShown(dropArea)) {
        e.preventDefault();
      }
    });
  }

  const uploadForm = el('form', {
    className: 'mn-upload',
    onsubmit: (e) => {
      e.preventDefault();
      const files = Array.from(fileInput.files || []);
      if (!files.length) {
        uploadStatus.set('Choose or drop a file first', { error: true });
        return;
      }
      if (!state.bucket) {
        uploadStatus.set('Create or select a bucket first', { error: true });
        return;
      }
      const bucket = state.bucket;
      const one = files.length === 1;
      const label = one ? `Upload ${keyInput.value.trim() || files[0].name}` : `Upload ${files.length} files`;
      uploadButton.disabled = true;
      run(uploadStatus, label, async () => {
        for (const [i, file] of files.entries()) {
          const key = (one && keyInput.value.trim()) || file.name;
          if (!one) uploadStatus.set(`Uploading ${i + 1} of ${files.length}: ${key}…`);
          try {
            await putObject(bucket, key, file);
          } catch (err) {
            throw new Error(one ? err.message : `${key} (${i} of ${files.length} uploaded before it): ${err.message}`);
          }
        }
        uploadForm.reset();
        showChosen();
        await refresh();
        return one ? `${label}: done` : `Uploaded ${files.length} files to ${bucket}`;
      }).finally(() => {
        uploadButton.disabled = false;
      });
    }
  }, [dropArea, el('div', { className: 'mn-row' }, [keyInput, uploadButton])]);
  showChosen();

  const listing = el('div');

  // Copy URL: the file's full address on this ship, as this page reaches it
  // (files are publicly readable there). Says "Copied" for a moment.
  function copyUrlButton(key) {
    const url = new URL(objectUrl(state.bucket, key), location.origin).href;
    const button = el('button', {
      type: 'button',
      title: url,
      onclick: async () => {
        if (await copyText(url)) {
          button.textContent = 'Copied';
          setTimeout(() => { button.textContent = 'Copy URL'; }, 2500);
        } else {
          bucketsStatus.set(`Couldn’t copy the URL — open the file and copy it from the address bar: ${url}`, { error: true });
        }
      }
    }, ['Copy URL']);
    return button;
  }

  function renderListing() {
    if (state.error) {
      listing.replaceChildren(el('p', { className: 'mn-empty mn-error' }, [state.error]));
      return;
    }
    if (!state.listing) {
      listing.replaceChildren(el('p', { className: 'mn-empty' }, ['Loading…']));
      return;
    }
    const { objects, isTruncated } = state.listing;
    if (objects.length === 0) {
      listing.replaceChildren(el('p', { className: 'mn-empty' }, [state.prefix ? 'No objects match this prefix.' : 'This bucket is empty.']));
      return;
    }
    const rows = objects.map((obj) =>
      el('tr', {}, [
        el('td', { className: 'mn-truncate' }, [
          el('a', { href: objectUrl(state.bucket, obj.key), target: '_blank', rel: 'noopener', title: obj.key }, [obj.key])
        ]),
        el('td', { className: 'mn-num' }, [formatSize(obj.size)]),
        el('td', {}, [obj.lastModified.toLocaleString()]),
        el('td', { className: 'mn-actions' }, [
          copyUrlButton(obj.key),
          el('button', {
            type: 'button',
            className: 'mn-button--danger',
            onclick: () => {
              if (!confirm(`Delete ${obj.key} from ${state.bucket}?`)) return;
              run(bucketsStatus, `Delete ${obj.key}`, async () => {
                await deleteObject(state.bucket, obj.key);
                await refresh();
              });
            }
          }, ['Delete'])
        ])
      ])
    );
    // more than 5 files: the list scrolls inside the card, 5 rows tall, with
    // its headings pinned (see fitScroll)
    const table = el('table', { className: 'mn-table' }, [
      el('thead', {}, [
        el('tr', {}, ['Name', 'Size', 'Last modified', ''].map((h) => el('th', {}, [h])))
      ]),
      el('tbody', {}, rows)
    ]);
    const scroll = objects.length > 5;
    listing.replaceChildren(
      scroll ? el('div', { className: 'mn-scroll' }, [table]) : table,
      ...(isTruncated ? [el('p', { className: 'mn-hint mn-note' }, ['Showing the first 1000 objects — narrow with a prefix.'])] : [])
    );
    if (scroll) fitScroll();
  }

  // Make the scrolling list exactly 5 rows tall (plus its headings), from
  // the rows' real height. While the panel is hidden nothing has a height,
  // so the CSS fallback (about 5 rows) holds until it is shown again.
  const SCROLL_ROWS = 5;
  function fitScroll() {
    const box = listing.querySelector('.mn-scroll');
    if (!box) return;
    const head = box.querySelector('thead');
    const rows = Array.from(box.querySelectorAll('tbody tr')).slice(0, SCROLL_ROWS);
    const height = (head ? head.offsetHeight : 0) + rows.reduce((h, r) => h + r.offsetHeight, 0);
    if (height > 0) box.style.setProperty('--mn-scroll-height', `${height}px`);
  }
  // measure once laid out, and again whenever the panel comes into view
  // or the window changes size
  new ResizeObserver(fitScroll).observe(listing);

  async function refresh() {
    state.error = null;
    if (!state.bucket) {
      state.listing = null;
      state.error = 'No buckets yet — create one below or configure storage.';
      renderListing();
      return;
    }
    try {
      state.listing = await listObjects(state.bucket, state.prefix);
    } catch (err) {
      state.listing = null;
      state.error = err.code === 'NoSuchBucket'
        ? `Bucket "${state.bucket}" no longer exists — press Reload.`
        : `Could not list "${state.bucket}" — ${err.message}`;
    }
    renderListing();
  }

  async function openBucket(name) {
    state.bucket = name || null;
    state.listing = null;
    if (name) saveLastBucket(name);
    renderBucketOptions();
    renderListing();
    showChosen(); // the drop area names the bucket
    await refresh();
  }

  // Fetch bucket names, then open `select` if given, else keep the current
  // bucket if it still exists, else the first one.
  async function loadBuckets(select) {
    try {
      state.buckets = await listBuckets();
    } catch (err) {
      state.buckets = [];
      state.bucket = null;
      renderBucketOptions();
      state.listing = null;
      state.error = `Could not load buckets — ${err.message}`;
      renderListing();
      return;
    }
    const pick = [select, state.bucket].find((b) => b && state.buckets.includes(b));
    await openBucket(pick ?? state.buckets[0]);
  }

  // Layout mirrors the explorer: bordered cards (.panel) with a header row
  // (.panel__header) and small uppercase section titles.
  const card = (heading, help, body, status) =>
    el('section', { className: 'mn-card' }, [
      cardHeader(heading, help),
      ...body,
      status.node
    ]);

  root.replaceChildren(
    el('div', { className: 'mn-page' }, [
      card('Storage setup', [
        'File storage settings, apps upload files with, at this ship’s own S3 server: https://example.groundwire.me/jars.',
        'It also creates the "default" bucket and makes it the one uploads go to. Enter the address other devices reach this ship at.'
      ], [
        el('div', { className: 'mn-card__body' }, [setupForm])
      ], setupStatus),
      card('Buckets', [
        'A bucket is a folder of files on this ship. Pick one to see its files, or create a new one.'
      ], [
        // create a bucket on top; under it, pick the bucket and filter it
        el('div', { className: 'mn-card__body mn-card__body--ruled' }, [
          newBucketForm,
          el('div', { className: 'mn-row mn-row--spread' }, [bucketRow, prefixInput])
        ]),
        listing
      ], bucketsStatus),
      card('Upload', [
        'Upload files to a selected s3 bucket.',
        'One file goes up under the key you type, or its file name; Uploading to a key that already exists replaces that file.',
        'Files are publicly readable by anyone who knows their URL.'
      ], [
        el('div', { className: 'mn-card__body' }, [uploadForm])
      ], uploadStatus)
    ])
  );

  loadBuckets();
}
