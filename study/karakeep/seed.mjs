// Seeds Karakeep through its real API: tRPC users.create + apiKeys.exchange, then REST /api/v1.
// Usage: node seed.mjs [baseUrl]  default http://localhost:9942
const base = process.argv[2] || 'http://localhost:9942';
const EMAIL = 'study@example.com', PASSWORD = 'StudyPass#2026';

async function trpc(path, input) {
  const r = await fetch(`${base}/api/trpc/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ json: input }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${t.slice(0, 300)}`);
  return JSON.parse(t).result.data.json;
}
await trpc('users.create', { name: 'Study Owner', email: EMAIL, password: PASSWORD, confirmPassword: PASSWORD });
const key = (await trpc('apiKeys.exchange', { keyName: 'seed', email: EMAIL, password: PASSWORD })).key;
const H = { authorization: `Bearer ${key}` };
async function api(method, path, body, extra = {}) {
  const r = await fetch(`${base}/api/v1${path}`, { method, headers: { ...H, ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : {};
}

const items = [
  { url: 'https://example.com/', title: 'Example Domain', note: 'Reference page for the quarterly zebrafish migration plan', tags: ['reference', 'planning'] },
  { url: 'https://www.iana.org/domains/reserved', title: 'IANA reserved domains', note: 'Check the zebrafish rollout checklist before Friday', tags: ['reference', 'infrastructure'] },
  { url: 'https://www.rfc-editor.org/rfc/rfc2606', title: 'RFC 2606 reserved names', note: 'Naming rules for test domains, read with the marmalade review', tags: ['standards'] },
  { url: 'https://example.org/', title: 'Example Org', note: 'Vendor shortlist: pricing call booked for Tuesday', tags: ['vendors', 'planning'] },
  { url: 'https://example.net/', title: 'Example Net', note: 'Backup idea: marmalade test for the weekend project', tags: ['ideas'] },
];
const ids = [];
for (const it of items) {
  const b = await api('POST', '/bookmarks', { type: 'link', url: it.url, title: it.title, note: it.note });
  await api('POST', `/bookmarks/${b.id}/tags`, { tags: it.tags.map((tagName) => ({ tagName })) });
  ids.push(b.id);
  console.log('bookmark', b.id, it.title, '| note:', it.note, '| tags:', it.tags.join(','));
}
// one uploaded image asset bookmark
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGP8z8Dwn4EIwDiqEAAmHQIB5mGyYQAAAABJRU5ErkJggg==', 'base64');
const fd = new FormData();
fd.append('file', new Blob([png], { type: 'image/png' }), 'study-diagram.png');
const asset = await api('POST', '/assets', fd);
const ab = await api('POST', '/bookmarks', { type: 'asset', assetType: 'image', assetId: asset.assetId, fileName: 'study-diagram.png', title: 'Study diagram image', note: 'Whiteboard photo from the zebrafish kickoff' });
await api('POST', `/bookmarks/${ab.id}/tags`, { tags: [{ tagName: 'image' }] });
console.log('asset', asset.assetId, 'bookmark', ab.id, 'Study diagram image');
console.log(`user ${EMAIL} / ${PASSWORD} at ${base}; api key printed once: ${key.slice(0, 8)}...`);
