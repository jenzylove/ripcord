// Seeds a running Paperless-ngx through its real API. Usage: node seed.mjs [baseUrl] (default http://localhost:9963)
// Login study / StudyPass123! (created by PAPERLESS_ADMIN_* env). Uploads 3 generated text PDFs and waits until
// they are consumed and searchable.
const BASE = process.argv[2] || 'http://localhost:9963';
const USER = 'study', PASSWORD = 'StudyPass123!';

function pdf(lines) { // minimal one page PDF with a real text layer
  const stream = 'BT /F1 14 Tf 60 760 Td 18 TL ' + lines.map(l => `(${l.replace(/[()\]/g, '')}) Tj T*`).join(' ') + ' ET';
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const docs = [
  { title: 'Harmattan Electric Invoice', file: 'invoice-harmattan.pdf', word: 'harmattan', lines: ['INVOICE 2026-0417', 'Harmattan Electric Ltd', 'Amount due 48200 NGN', 'Due date 2026-12-05', 'Meter reading 18402 kWh'] },
  { title: 'Zanzibar Flat Lease', file: 'lease-zanzibar.pdf', word: 'zanzibar', lines: ['LEASE AGREEMENT', 'Zanzibar Court flat 12B', 'Term 12 months from 2026-01-01', 'Monthly rent 350000 NGN', 'Signed by tenant and landlord'] },
  { title: 'Quokka Vet Receipt', file: 'receipt-quokka.pdf', word: 'quokka', lines: ['RECEIPT 88231', 'Quokka Veterinary Clinic', 'Vaccination and checkup', 'Total paid 21500 NGN', 'Paid by card 2026-11-02'] },
];
async function req(method, path, { token, json, form } = {}) {
  const headers = { Accept: 'application/json; version=9' }; if (token) headers.Authorization = `Token ${token}`;
  let body; if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); } if (form) body = form;
  const res = await fetch(BASE + path, { method, headers, body }); const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
}
const { token } = await req('POST', '/api/token/', { json: { username: USER, password: PASSWORD } });
const tasks = [];
for (const d of docs) {
  const form = new FormData();
  form.append('document', new Blob([pdf(d.lines)], { type: 'application/pdf' }), d.file); form.append('title', d.title);
  tasks.push({ d, task: await req('POST', '/api/documents/post_document/', { token, form }) });
}
const ids = [];
for (const t of tasks) {
  for (let i = 0; i < 120; i++) {
    const r = await req('GET', `/api/tasks/?task_id=${t.task}`, { token });
    const s = Array.isArray(r) ? r[0] : r.results?.[0];
    if (s && s.status === 'SUCCESS') { ids.push({ title: t.d.title, id: Number(s.related_document), word: t.d.word }); break; }
    if (s && s.status === 'FAILURE') throw new Error('consume failed: ' + JSON.stringify(s));
    await new Promise(r => setTimeout(r, 3000));
  }
}
const found = [];
for (const d of ids) {
  for (let i = 0; i < 40; i++) {
    const r = await req('GET', `/api/documents/?query=${d.word}`, { token });
    if (r.count >= 1) { found.push({ ...d, search_count: r.count }); break; }
    await new Promise(r => setTimeout(r, 3000));
  }
}
console.log(JSON.stringify({ app: 'paperless-ngx', base: BASE, login: { username: USER, password: PASSWORD }, documents: ids, searchable: found }, null, 2));
