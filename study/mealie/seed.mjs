// Seeds a running Mealie through its real API (never the database).
// Usage: node seed.mjs [baseUrl]   default http://localhost:9961
// Creates user study@example.com, 3 recipes with structured ingredients and a generated PNG photo each.
import zlib from 'node:zlib';
const BASE = process.argv[2] || 'http://localhost:9961';
const EMAIL = 'study@example.com', PASSWORD = 'StudyPass123!';

// --- tiny PNG encoder: a solid colour with a diagonal stripe, so each photo is a real, distinct picture
function crc32(buf){let c,crc=~0;for(let n=0;n<buf.length;n++){c=(crc^buf[n])&0xff;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crc=(crc>>>8)^c;}return ~crc>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));return Buffer.concat([len,td,crc]);}
function png(w,h,[r,g,b],[r2,g2,b2]){const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;for(let x=0;x<w;x++){const s=((x+y)%60)<20;const o=y*(w*3+1)+1+x*3;raw[o]=s?r2:r;raw[o+1]=s?g2:g;raw[o+2]=s?b2:b;}}
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}

async function api(method, path, {token, json, form, raw} = {}) {
  const headers = {}; if (token) headers.Authorization = `Bearer ${token}`;
  let body; if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); } if (form) body = form;
  if (raw) { body = raw.body; Object.assign(headers, raw.headers); }
  const res = await fetch(BASE + path, { method, headers, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0,300)}`);
  try { return JSON.parse(text); } catch { return text; }
}
async function login(username, password) {
  const r = await fetch(BASE + '/api/auth/token', { method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({ username, password }) });
  if (!r.ok) return null; return (await r.json()).access_token;
}

// 1. user: log in with the study user, else create it via the default admin and the admin API
let token = await login(EMAIL, PASSWORD);
if (!token) {
  const admin = await login('changeme@example.com', 'MyPassword');
  if (!admin) throw new Error('cannot log in as default admin');
  await api('POST', '/api/admin/users', { token: admin, json: { username: 'study', fullName: 'Study User', email: EMAIL, password: PASSWORD, admin: true, group: 'Home', household: 'Family', canInvite: true, canManage: true, canOrganize: true } });
  token = await login(EMAIL, PASSWORD);
}
if (!token) throw new Error('study user login failed');

// 2. units and foods
async function ensure(kind, name) {
  const found = await api('GET', `/api/${kind}?queryFilter=${encodeURIComponent(`name="${name}"`)}`, { token });
  if (found.items?.length) return found.items[0];
  return api('POST', `/api/${kind}`, { token, json: { name } });
}
const recipes = [
  { name: 'Party Jollof Rice', colors: [[200,80,20],[250,160,60]], servings: 6, ing: [[3,'cup','rice'],[0.5,'teaspoon','salt'],[6,null,'tomatoes'],[2,'cup','water']] },
  { name: 'Egusi Soup', colors: [[40,120,50],[120,200,90]], servings: 4, ing: [[1.5,'cup','egusi seeds'],[2,'tablespoon','palm oil'],[4,null,'scotch bonnet peppers']] },
  { name: 'Suya Skewers', colors: [[120,40,30],[220,120,80]], servings: 8, ing: [[2,'pound','beef'],[3,'tablespoon','suya spice'],[1,null,'onion']] },
];
const out = [];
for (const r of recipes) {
  const existing = await api('GET', `/api/recipes?queryFilter=${encodeURIComponent(`name="${r.name}"`)}`, { token });
  if (existing.items?.length) { out.push({ name: r.name, slug: existing.items[0].slug, existed: true }); continue; }
  const slug = await api('POST', '/api/recipes', { token, json: { name: r.name } });
  const recipeIngredient = [];
  for (const [quantity, unitName, foodName] of r.ing) {
    const unit = unitName ? await ensure('units', unitName) : null;
    const food = await ensure('foods', foodName);
    recipeIngredient.push({ quantity, unit: unit && { id: unit.id, name: unit.name }, food: { id: food.id, name: food.name }, note: '', disableAmount: false });
  }
  await api('PATCH', `/api/recipes/${slug}`, { token, json: { recipeServings: r.servings, recipeYield: `${r.servings} servings`, recipeIngredient,
    recipeInstructions: [{ title: '', text: 'Cook until done.' }], description: `${r.name} from the study seed` } });
  const form = new FormData();
  form.append('image', new Blob([png(480, 320, r.colors[0], r.colors[1])], { type: 'image/png' }), 'photo.png');
  form.append('extension', 'png');
  await api('PUT', `/api/recipes/${slug}/image`, { token, form });
  out.push({ name: r.name, slug, servings: r.servings, ingredients: r.ing.length });
}
console.log(JSON.stringify({ app: 'mealie', base: BASE, login: { email: EMAIL, password: PASSWORD }, recipes: out }, null, 2));
