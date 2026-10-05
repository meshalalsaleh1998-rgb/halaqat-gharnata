// حلقات جامع غرناطة — واجهة البيانات (Netlify Function + Netlify Blobs)
//   GET    /api/c/:collection          كل المستندات
//   POST   /api/c/:collection          مستند جديد
//   PUT    /api/c/:collection/:id      استبدال/إنشاء مستند
//   PATCH  /api/c/:collection/:id      تعديل حقول
//   DELETE /api/c/:collection/:id      حذف
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import seed from "../../data/seed.mjs"; // خارج مجلد الدوال حتى لا يعتبره Netlify دالة مستقلة

const COLLECTIONS = ["students", "attendance"];
const store = (name) => getStore({ name: "c-" + name, consistency: "strong" });
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const validId = (id) => /^[A-Za-z0-9_\-.:@+~]{1,200}$/.test(id);

// أول تشغيل فقط: ينقل البيانات الحالية من seed.mjs
async function ensureSeeded() {
  const meta = getStore({ name: "meta", consistency: "strong" });
  if (await meta.get("seeded")) return;
  await meta.set("seeded", new Date().toISOString());
  for (const c of COLLECTIONS) {
    const s = store(c);
    const { blobs } = await s.list();
    if (blobs.length) continue;
    for (const [id, data] of Object.entries(seed[c] || {})) await s.setJSON(id, data);
  }
}

async function listAll(c) {
  const s = store(c);
  const { blobs } = await s.list();
  const docs = await Promise.all(blobs.map(async (b) => {
    const data = await s.get(b.key, { type: "json" });
    return data ? { id: b.key, data } : null;
  }));
  return docs.filter(Boolean);
}

export default async (req) => {
  const parts = new URL(req.url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [route, c, id] = parts;
  try {
    if (route !== "c" || !COLLECTIONS.includes(c)) return json({ error: "not found" }, 404);
    if (id !== undefined && !validId(id)) return json({ error: "bad id" }, 400);
    const s = store(c);
    if (!id && req.method === "GET") { await ensureSeeded(); return json({ docs: await listAll(c) }); }
    if (!id && req.method === "POST") {
      const newId = randomUUID().replace(/-/g, "").slice(0, 20);
      await s.setJSON(newId, await req.json());
      return json({ id: newId });
    }
    if (id && req.method === "PUT") { await s.setJSON(id, await req.json()); return json({ id }); }
    if (id && req.method === "PATCH") {
      const cur = await s.get(id, { type: "json" });
      if (!cur) return json({ error: "غير موجود — ربما حُذف قبل قليل." }, 404);
      await s.setJSON(id, { ...cur, ...(await req.json()) });
      return json({ id });
    }
    if (id && req.method === "DELETE") { await s.delete(id); return json({ id }); }
    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
};

export const config = { path: "/api/*" };
