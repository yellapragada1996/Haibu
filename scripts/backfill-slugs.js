// One-off backfill: assign a public @handle to every creator that predates
// slug generation (slug IS NULL). Mirrors src/lib/slug.ts exactly.
// Usage: node scripts/backfill-slugs.js   (run with Node 22+, from repo root)
const fs = require('fs');
const { Client } = require('pg');
const url = fs.readFileSync('.env.local', 'utf8').match(/^DATABASE_URL=(.+)$/m)[1].trim();

function slugify(name) {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

(async () => {
  const c = new Client({ connectionString: url });
  await c.connect();
  const rows = await c.query(`
    SELECT cp.id, u.display_name, u.email
    FROM creator_profiles cp
    JOIN users u ON u.id = cp.user_id
    WHERE cp.slug IS NULL OR cp.slug = ''
  `);

  let count = 0;
  for (const r of rows.rows) {
    const base =
      slugify(r.display_name) ||
      slugify((r.email || '').split('@')[0]) ||
      'creator';
    let candidate = base;
    let n = 2;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await c.query('SELECT id FROM creator_profiles WHERE slug = $1 LIMIT 1', [candidate]);
      if (existing.rows.length === 0) break;
      candidate = `${base}-${n}`;
      n += 1;
    }
    await c.query('UPDATE creator_profiles SET slug = $1 WHERE id = $2', [candidate, r.id]);
    console.log(`backfilled "${r.display_name || r.email}" (${r.id.slice(0, 8)}…) -> @${candidate}`);
    count += 1;
  }
  console.log(`\nDone. Backfilled ${count} creator(s).`);
  await c.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
