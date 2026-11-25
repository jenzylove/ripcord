// Seeds a fresh n8n through its internal REST API (the same calls the editor makes).
// Usage: node seed.mjs [baseUrl]   default http://localhost:9941
const base = process.argv[2] || 'http://localhost:9941';
export const EMAIL = 'study@example.com';
export const PASSWORD = 'StudyPass#2026';
let cookie = '';

async function call(method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), 'browser-id': 'seed' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.getSetCookie?.() ?? [];
  const auth = sc.find((c) => c.startsWith('n8n-auth='));
  if (auth) cookie = auth.split(';')[0];
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

await call('POST', '/rest/owner/setup', { email: EMAIL, firstName: 'Study', lastName: 'Owner', password: PASSWORD });
await call('POST', '/rest/login', { emailOrLdapLoginId: EMAIL, password: PASSWORD });

const cred = await call('POST', '/rest/credentials', {
  name: 'Acme Billing API key',
  type: 'httpHeaderAuth',
  data: { name: 'X-Api-Key', value: 'sk_live_study_7f3a9c21d4' },
});
console.log('credential', cred.data.id, cred.data.name);

const wf = (name, nodes, connections) => ({ name, nodes, connections, settings: {}, active: false });
const w1 = await call('POST', '/rest/workflows', wf('Invoice reminder', [
  { id: 'a1', name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
  { id: 'a2', name: 'Fetch invoices', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [260, 0],
    parameters: { url: 'https://example.com/invoices', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth' },
    credentials: { httpHeaderAuth: { id: cred.data.id, name: cred.data.name } } },
], { 'Manual Trigger': { main: [[{ node: 'Fetch invoices', type: 'main', index: 0 }]] } }));
console.log('workflow', w1.data.id, w1.data.name);
const w2 = await call('POST', '/rest/workflows', wf('Weekly report digest', [
  { id: 'b1', name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
  { id: 'b2', name: 'Set digest', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [260, 0],
    parameters: { assignments: { assignments: [{ id: 'x1', name: 'digest', value: 'weekly', type: 'string' }] } } },
], { 'Manual Trigger': { main: [[{ node: 'Set digest', type: 'main', index: 0 }]] } }));
console.log('workflow', w2.data.id, w2.data.name);
console.log(`owner ${EMAIL} / ${PASSWORD} at ${base}`);
