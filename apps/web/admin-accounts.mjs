const search = document.querySelector('#search');
const status = document.querySelector('#status');
const viewers = document.querySelector('#viewers');
const nextPage = document.querySelector('#next');
const audit = document.querySelector('#audit');
const events = document.querySelector('#events');
let nextCursor = null;
let email = '';

async function adminRequest(path, method = 'GET') {
  const result = await fetch(path, {
    method, headers: { Authorization: 'Bearer ' + document.querySelector('#admin-token').value },
  });
  if (!result.ok) throw new Error('Account support request failed');
  return result.json();
}

async function showHistory(viewer) {
  const { events: history } = await adminRequest('/admin/user-audit?' + new URLSearchParams({ id: viewer.id }));
  const title = document.querySelector('#audit-heading');
  title.textContent = 'Support history for ' + viewer.email;
  events.replaceChildren();
  if (!history.length) {
    const item = document.createElement('li');
    item.textContent = 'No support actions recorded.';
    events.append(item);
  }
  for (const event of history) {
    const item = document.createElement('li');
    item.textContent = new Date(event.created_at).toLocaleString() + ' · ' + event.actor + ' · ' + event.action;
    events.append(item);
  }
  audit.hidden = false;
  title.focus();
}

function viewerRow(viewer) {
  const row = document.createElement('li');
  const description = document.createElement('span');
  description.textContent = viewer.email + ' · ' + (viewer.disabled ? 'Suspended' : 'Active') + ' ';
  const history = document.createElement('button');
  history.textContent = 'Support history';
  history.addEventListener('click', async () => {
    try { await showHistory(viewer); }
    catch { status.textContent = 'Could not load support history.'; }
  });
  const change = document.createElement('button');
  change.textContent = viewer.disabled ? 'Restore' : 'Suspend';
  change.addEventListener('click', async () => {
    if (!window.confirm(change.textContent + ' ' + viewer.email + '?')) return;
    change.disabled = true;
    try {
      const { users: [updated] } = await adminRequest('/admin/users?' +
        new URLSearchParams({ id: viewer.id, disabled: String(!viewer.disabled) }), 'PATCH');
      row.replaceWith(viewerRow(updated));
      status.textContent = updated.disabled ? 'Viewer suspended.' : 'Viewer restored.';
      await showHistory(updated);
    } catch {
      status.textContent = 'Could not complete the support request.';
    } finally {
      change.disabled = false;
    }
  });
  row.append(description, change, ' ', history);
  return row;
}

async function load(after = '') {
  nextPage.disabled = true;
  try {
    const { users, nextCursor: cursor } = await adminRequest('/admin/users?' +
      new URLSearchParams({ email, after }));
    viewers.replaceChildren(...users.map(viewerRow));
    nextCursor = cursor;
    nextPage.hidden = !cursor;
    audit.hidden = true;
    status.textContent = users.length ? '' : 'No viewers found.';
  } catch {
    viewers.replaceChildren();
    audit.hidden = true;
    nextPage.hidden = true;
    status.textContent = 'Could not load viewers. Check the admin token.';
  } finally {
    nextPage.disabled = false;
  }
}

search.addEventListener('submit', event => {
  event.preventDefault();
  email = search.elements.email.value;
  void load();
});
nextPage.addEventListener('click', () => { if (nextCursor) void load(nextCursor); });
