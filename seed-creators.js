// Seed: 9 new categories + 100 test creators (unique names/avatars/category combos).
// 30+ creators get 24/7 daily availability; the rest get partial or none.
const { Pool } = require("pg");
const fs = require("fs");

const db = fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)[1].trim();
const pool = new Pool({ connectionString: db });
const uuid = require("crypto").randomUUID;

const CATEGORIES = [
  ["comedy", "Comedy", 4],
  ["storytelling", "Storytelling", 5],
  ["gaming", "Gaming", 6],
  ["spiritual", "Spiritual", 7],
  ["fitness", "Fitness", 8],
  ["art", "Art", 9],
  ["cooking", "Cooking", 10],
  ["study-with-me", "Study With Me", 11],
  ["dance", "Dance", 12],
];

const FIRST = ["Ava","Leo","Zoe","Max","Ivy","Noah","Mia","Kai","Ella","Finn","Ruby","Oscar","Luna","Theo","Nina","Eli","Jade","Rex","Iris","Sam","Cleo","Jude","Sky","Remy","Nia","Cole","Wren","Milo","Gia","Ari","Zane","Rhea","Troy","Sage","Nova","Dax","Faye","Bo","Tess","Rio"];
const SECOND = ["Laughs","Tales","Plays","Glow","Flex","Brush","Whisk","Study","Spin","Vibes","Waves","Sparks","Craft","Flow","Tone","Spark","Canvas","Beat","Roots","Bloom","Lift","Chill","Mix","Echo","Rise","Zest","Muse","Pulse","Snap","Drift","Chef","Stretch","Story","Groove","Zen","Draw","Knead","Quiz","Pose","Strum"];

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function pick(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function bioFor(cats) {
  return `Live ${cats.map(c => c[1]).join(" · ")} sessions. Join me for a real 1:1 session — every time is personal.`;
}

(async () => {
  // 1. Categories
  for (const [slug, label, order] of CATEGORIES) {
    await pool.query(
      `INSERT INTO categories (slug, display_label, sort_order) VALUES ($1,$2,$3)
       ON CONFLICT (slug) DO NOTHING`,
      [slug, label, order],
    );
  }
  const cats = (await pool.query("SELECT slug, display_label FROM categories ORDER BY sort_order")).rows;
  console.log("categories:", cats.length);

  // 2. Creators
  const usedNames = new Set();
  const usedSlugs = new Set();
  const creators = [];
  for (let i = 0; i < 100; i++) {
    let name;
    do { name = `${FIRST[i % FIRST.length]} ${SECOND[Math.floor(Math.random() * SECOND.length)]}`; } while (usedNames.has(name));
    usedNames.add(name);
    let slug = slugify(name);
    if (usedSlugs.has(slug)) slug = `${slug}-${Math.floor(Math.random() * 900 + 100)}`;
    usedSlugs.add(slug);
    creators.push({ name, slug, i });
  }

  let availCount = 0;
  for (const c of creators) {
    const id = uuid();
    const userId = uuid();
    const email = `seed-${c.slug}@haibu.test`;
    const avatar = `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(c.slug)}`;
    // 1–3 category combo (weighted: mostly 2)
    const comboN = Math.random() < 0.3 ? 1 : Math.random() < 0.7 ? 2 : 3;
    const combo = pick(cats, comboN);
    const primary = combo[0].slug;

    // auth.users first — the on_auth_user_created trigger builds public.users
    await pool.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
       VALUES ($1,$2,$3::jsonb, now(), now(), now())`,
      [userId, email, JSON.stringify({ display_name: c.name })],
    );
    await pool.query(
      `UPDATE public.users
       SET avatar_url=$1, timezone='America/Toronto', timezone_confirmed=true
       WHERE id=$2`,
      [avatar, userId],
    );
    await pool.query(
      `INSERT INTO creator_profiles (id, user_id, bio, category, is_published, slug, created_at)
       VALUES ($1,$2,$3,$4,true,$5,now())`,
      [id, userId, bioFor(combo), primary, c.slug],
    );
    // Offerings — one per combo category
    for (const cat of combo) {
      const price = [1500, 2000, 2500, 3000, 3500, 4000][Math.floor(Math.random() * 6)];
      const dur = [15, 30, 45, 60][Math.floor(Math.random() * 4)];
      const title = `${cat.display_label} Session`;
      await pool.query(
        `INSERT INTO offerings (creator_id, title, category, duration_minutes, price_cents, is_active, created_at)
         VALUES ($1,$2,$3,$4,$5,true,now())`,
        [id, title, cat.slug, dur, price],
      );
    }
    // Availability — first 30 get 24/7 every day; next 20 get a few days; rest none
    if (c.i < 30) {
      for (let dow = 0; dow < 7; dow++) {
        await pool.query(
          `INSERT INTO availability_windows (creator_id, day_of_week, start_minute, end_minute)
           VALUES ($1,$2,0,1440)`,
          [id, dow],
        );
      }
      availCount++;
    } else if (c.i < 50) {
      for (let dow of [1, 3, 5]) {
        await pool.query(
          `INSERT INTO availability_windows (creator_id, day_of_week, start_minute, end_minute)
           VALUES ($1,$2,480,1080)`,
          [id, dow],
        );
      }
    }
  }

  const counts = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM categories) AS cats,
       (SELECT COUNT(*) FROM creator_profiles WHERE is_published) AS creators,
       (SELECT COUNT(*) FROM offerings WHERE is_active AND deleted_at IS NULL) AS offerings,
       (SELECT COUNT(*) FROM availability_windows) AS windows`);
  console.log("final:", JSON.stringify(counts.rows[0]));
  console.log("24/7 creators:", availCount);
  await pool.end();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
