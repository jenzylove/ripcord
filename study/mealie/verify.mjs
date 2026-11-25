// API level look (no browser agent). Usage: node verify.mjs <baseUrl>
const BASE = process.argv[2];
const out = { base: BASE };
try {
  const about = await fetch(BASE + '/api/app/about'); out.http_about = about.status;
} catch (e) { out.http_about = 'ERR ' + e.message; console.log(JSON.stringify(out, null, 1)); process.exit(0); }
const r = await fetch(BASE + '/api/auth/token', { method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({ username: 'study@example.com', password: 'StudyPass123!' }) });
out.login_status = r.status;
if (!r.ok) { out.login_body = (await r.text()).slice(0, 200); console.log(JSON.stringify(out, null, 1)); process.exit(0); }
const token = (await r.json()).access_token; const H = { Authorization: `Bearer ${token}` };
const list = await (await fetch(BASE + '/api/recipes?perPage=100', { headers: H })).json();
out.recipe_count = list.items?.length; out.recipes = [];
for (const slug of ['party-jollof-rice', 'egusi-soup', 'suya-skewers']) {
  const rr = await fetch(`${BASE}/api/recipes/${slug}`, { headers: H });
  if (!rr.ok) { out.recipes.push({ slug, status: rr.status }); continue; }
  const rec = await rr.json();
  const img = await fetch(`${BASE}/api/media/recipes/${rec.id}/images/original.webp`, { headers: H });
  const buf = Buffer.from(await img.arrayBuffer());
  out.recipes.push({ slug, status: rr.status, servings: rec.recipeServings, ingredients: rec.recipeIngredient.length, image_field: rec.image, image_status: img.status, image_type: img.headers.get('content-type'), image_bytes: buf.length });
}
console.log(JSON.stringify(out, null, 1));
