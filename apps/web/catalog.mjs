const byId = id => document.getElementById(id);
const form = byId('filters');
const status = byId('status');
const more = byId('more');
const titles = byId('titles');
const details = byId('details');
const dialog = byId('login');
const credentials = byId('credentials');
let pending;
let filters = new URLSearchParams();
let cursor;
let listings = 0;
let listVersion = 0;
let detailVersion = 0;

async function read(path, params = new URLSearchParams()) {
  const response = await fetch(path + '?' + params);
  if (!response.ok) throw new Error('Catalog request failed');
  return response.json();
}

async function openFixture(button, title, episode, kind, version) {
  button.disabled = true;
  try {
    const params = new URLSearchParams({
      titleId: title.id, locale: title.locale, episodeId: episode.id, kind,
    });
    const response = await fetch('/v1/fixture-playback?' + params, { method: 'POST' });
    if (version !== detailVersion) return;
    if (response.status === 401) {
      pending = () => openFixture(button, title, episode, kind, version);
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (!response.ok) throw new Error('Media unavailable');
    const { url } = await response.json();
    if (version !== detailVersion) return;
    if (kind === 'download') location.assign(url);
    else location.assign('/fixture-watch#' + new URLSearchParams({ grant: url }));
  } catch {
    if (version === detailVersion) status.textContent = 'Media unavailable for this episode.';
  } finally {
    button.disabled = false;
  }
}

async function showTitle(title) {
  const version = ++detailVersion;
  details.hidden = true;
  try {
    const data = await read('/v1/title', new URLSearchParams({
      source: title.source, locale: title.locale, id: title.id,
    }));
    if (version !== detailVersion) return;
    byId('title').textContent = data.name;
    byId('synopsis').textContent = data.synopsis;
    byId('episodes').replaceChildren(...data.episodes.map(episode => {
      const item = document.createElement('li');
      item.value = episode.number;
      item.textContent = episode.name;
      if (data.source === 'fixture') {
        for (const [kind, label] of [['playback', 'Watch'], ['download', 'Download']]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = label;
          button.setAttribute('aria-label', label + ' ' + episode.name);
          button.addEventListener('click', () => openFixture(button, data, episode, kind, version));
          item.append(' ', button);
        }
      }
      return item;
    }));
    status.textContent = data.episodes.length ? '' : 'Episode list unavailable.';
    details.hidden = false;
    byId('title').focus();
  } catch {
    if (version === detailVersion) status.textContent = 'Could not load title details.';
  }
}

async function loadTitles(reset = false) {
  const version = ++listVersion;
  if (reset) {
    detailVersion++;
    details.hidden = true;
    filters = new URLSearchParams([...new FormData(form)].filter(([, value]) => value.trim()));
    titles.replaceChildren();
    cursor = null;
    listings = 0;
  }
  more.disabled = true;
  more.hidden = true;
  status.textContent = 'Loading catalog…';
  try {
    const params = new URLSearchParams(filters);
    if (cursor) params.set('cursor', cursor);
    const result = await read('/v1/titles', params);
    if (version !== listVersion) return;
    for (const title of result.titles) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = title.name + ' · ' + title.locale;
      button.addEventListener('click', () => showTitle(title));
      item.append(button);
      titles.append(item);
    }
    listings += result.titles.length;
    cursor = result.nextCursor;
    status.textContent = listings ? '' : 'No titles match these filters.';
  } catch {
    if (version === listVersion) status.textContent = 'Could not load the catalog.';
  } finally {
    if (version === listVersion) {
      more.disabled = false;
      more.hidden = !cursor;
    }
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  loadTitles(true);
});
more.addEventListener('click', () => loadTitles());
read('/v1/providers').then(({ providers }) => {
  for (const provider of providers) form.elements.source.add(new Option(provider, provider));
}).catch(() => {});
loadTitles(true);

function showAccount(user) {
  byId('account').hidden = Boolean(user);
  byId('logout').hidden = !user;
}
byId('account').addEventListener('click', () => dialog.showModal());
byId('close-login').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  pending = undefined;
  credentials.reset();
  byId('account-status').textContent = '';
});
credentials.addEventListener('submit', async event => {
  event.preventDefault();
  const submitter = event.submitter;
  if (!submitter) return;
  const action = submitter.value;
  const body = Object.fromEntries(new FormData(credentials));
  const buttons = [...credentials.querySelectorAll('button')];
  buttons.forEach(button => { button.disabled = true; });
  try {
    const response = await fetch('/v1/account/' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error();
    showAccount((await response.json()).user);
    const next = dialog.open ? pending : undefined;
    dialog.close();
    next?.();
  } catch {
    byId('account-status').textContent = 'Could not complete this request. Check your details and try again.';
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
});
byId('logout').addEventListener('click', async () => {
  try {
    const response = await fetch('/v1/account/logout', { method: 'POST' });
    if (!response.ok) throw new Error();
    showAccount(null);
  } catch {
    status.textContent = 'Could not log out. Try again.';
  }
});
fetch('/v1/account/session').then(response => response.json()).then(({ user }) => showAccount(user)).catch(() => {});
