// 선행기구개발그룹 GWP 대시보드 — Cloudflare Worker (API)
// 정적 자산은 [assets] 바인딩이 먼저 서빙하고, /api/* 요청만 이 Worker가 처리한다.
// GitHub Pages(github.io)에서 호출할 수 있도록 CORS를 허용한다.

const MAX_NAME = 100;
const MAX_TEXT = 500;
const MAX_URL = 1000;

// 참석 현황 고정 파트 (이 목록 외 파트는 등록 불가)
const FIXED_PARTS = [
  "NE파트",
  "패키지파트",
  "선행CMF1파트",
  "선행CMF2파트",
  "선행CMF3파트",
  "Hinge개발.lab",
  "접합기술 파트",
];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

function err(message, status = 400) {
  return json({ error: message }, status);
}

function newSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(salt, password) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyPassword(row, password, env) {
  if (typeof password !== "string" || password.length === 0) return false;
  if (env.ADMIN_PASSWORD && timingSafeEqual(password, env.ADMIN_PASSWORD)) return true;
  const computed = await hashPassword(row.pw_salt, password);
  return timingSafeEqual(computed, row.pw_hash);
}

// 공통 텍스트 필드 검증
function checkText(val, { required, max, label }) {
  const s = typeof val === "string" ? val.trim() : "";
  if (required && !s) return { error: `${label}을(를) 입력해 주세요.` };
  if (s.length > max) return { error: `${label}은(는) ${max}자 이하로 입력해 주세요.` };
  return { value: s || null };
}

function checkUrl(val) {
  const s = typeof val === "string" ? val.trim() : "";
  if (!s) return { value: null };
  if (s.length > MAX_URL) return { error: "링크가 너무 깁니다." };
  if (!/^https?:\/\//i.test(s)) return { error: "링크는 http(s):// 로 시작해야 합니다." };
  return { value: s };
}

function checkInt(val, { min, max, label, allowEmpty, empty }) {
  if (allowEmpty && (val === undefined || val === null || val === "")) return { value: empty };
  const n = Number(val);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
    return { error: `${label}을(를) 올바르게 입력해 주세요.` };
  }
  return { value: n };
}

// ---------------- 선물(gifts) ----------------
function validateGift(body, partial) {
  const out = {};
  const set = (key, res) => {
    if (res.error) return res.error;
    out[key] = res.value;
    return null;
  };
  let e;
  if (!partial || body.name !== undefined)
    if ((e = set("name", checkText(body.name, { required: true, max: MAX_NAME, label: "제품명" })))) return { error: e };
  if (!partial || body.price !== undefined)
    if ((e = set("price", checkInt(body.price, { min: 0, max: 100000000, label: "가격" })))) return { error: e };
  if (!partial || body.quantity !== undefined)
    if ((e = set("quantity", checkInt(body.quantity, { min: 1, max: 100000, label: "수량", allowEmpty: true, empty: 1 })))) return { error: e };
  if (!partial || body.url !== undefined)
    if ((e = set("url", checkUrl(body.url)))) return { error: e };
  if (!partial || body.registrant !== undefined)
    if ((e = set("registrant", checkText(body.registrant, { required: false, max: MAX_NAME, label: "등록자" })))) return { error: e };
  if (!partial || body.note !== undefined)
    if ((e = set("note", checkText(body.note, { required: false, max: MAX_TEXT, label: "메모" })))) return { error: e };
  return { value: out };
}

function publicGift(r) {
  return {
    id: r.id, name: r.name, url: r.url, price: r.price, quantity: r.quantity,
    subtotal: r.price * r.quantity, registrant: r.registrant, note: r.note, created_at: r.created_at,
  };
}

// ---------------- 식당(restaurants) ----------------
function validateRestaurant(body, partial) {
  const out = {};
  const set = (key, res) => { if (res.error) return res.error; out[key] = res.value; return null; };
  let e;
  if (!partial || body.part !== undefined)
    if ((e = set("part", checkText(body.part, { required: true, max: MAX_NAME, label: "파트명" })))) return { error: e };
  if (!partial || body.restaurant !== undefined)
    if ((e = set("restaurant", checkText(body.restaurant, { required: true, max: MAX_NAME, label: "식당명" })))) return { error: e };
  if (!partial || body.category !== undefined)
    if ((e = set("category", checkText(body.category, { required: false, max: MAX_NAME, label: "메뉴/종류" })))) return { error: e };
  if (!partial || body.headcount !== undefined)
    if ((e = set("headcount", checkInt(body.headcount, { min: 0, max: 100000, label: "인원", allowEmpty: true, empty: null })))) return { error: e };
  if (!partial || body.url !== undefined)
    if ((e = set("url", checkUrl(body.url)))) return { error: e };
  if (!partial || body.note !== undefined)
    if ((e = set("note", checkText(body.note, { required: false, max: MAX_TEXT, label: "메모" })))) return { error: e };
  return { value: out };
}

function publicRestaurant(r) {
  return {
    id: r.id, part: r.part, restaurant: r.restaurant, category: r.category,
    headcount: r.headcount, url: r.url, note: r.note, created_at: r.created_at,
  };
}

// ---------------- 참석 현황(attendance) ----------------
function validateAttendance(body, partial) {
  const out = {};
  const set = (key, res) => { if (res.error) return res.error; out[key] = res.value; return null; };
  let e;
  if (!partial || body.part !== undefined) {
    const p = typeof body.part === "string" ? body.part.trim() : "";
    if (!FIXED_PARTS.includes(p)) return { error: "유효한 파트를 선택해 주세요." };
    out.part = p;
  }
  if (!partial || body.attendance !== undefined)
    if ((e = set("attendance", checkInt(body.attendance, { min: 0, max: 100000, label: "당일 참석 인원", allowEmpty: true, empty: 0 })))) return { error: e };
  if (!partial || body.absent_count !== undefined)
    if ((e = set("absent_count", checkInt(body.absent_count, { min: 0, max: 100000, label: "미참자 인원수", allowEmpty: true, empty: 0 })))) return { error: e };
  if (!partial || body.absent_names !== undefined)
    if ((e = set("absent_names", checkText(body.absent_names, { required: false, max: MAX_TEXT, label: "미참자 성명" })))) return { error: e };
  return { value: out };
}

function publicAttendance(r) {
  return {
    id: r.id, part: r.part, attendance: r.attendance,
    absent_count: r.absent_count, absent_names: r.absent_names, created_at: r.created_at,
  };
}

// 리소스별 설정
const RESOURCES = {
  gifts: {
    table: "gifts",
    cols: "id, name, url, price, quantity, registrant, note, created_at",
    insertCols: ["name", "url", "price", "quantity", "registrant", "note"],
    updatable: ["name", "url", "price", "quantity", "registrant", "note"],
    validate: validateGift,
    toPublic: publicGift,
    order: "created_at DESC, id DESC",
  },
  restaurants: {
    table: "restaurants",
    cols: "id, part, restaurant, category, headcount, url, note, created_at",
    insertCols: ["part", "restaurant", "category", "headcount", "url", "note"],
    updatable: ["part", "restaurant", "category", "headcount", "url", "note"],
    validate: validateRestaurant,
    toPublic: publicRestaurant,
    order: "part ASC, created_at ASC, id ASC",
  },
  attendance: {
    table: "attendance",
    cols: "id, part, attendance, absent_count, absent_names, created_at",
    insertCols: ["part", "attendance", "absent_count", "absent_names"],
    updatable: ["attendance", "absent_count", "absent_names"], // 파트명은 변경 불가
    validate: validateAttendance,
    toPublic: publicAttendance,
    order: "created_at ASC, id ASC",
    unique: "part",        // 파트당 1행
    uniqueLabel: "파트",
  },
};

async function listRows(env, cfg) {
  const { results } = await env.DB.prepare(
    `SELECT ${cfg.cols} FROM ${cfg.table} ORDER BY ${cfg.order}`
  ).all();
  return (results || []).map(cfg.toPublic);
}

async function getState(env) {
  const [gifts, restaurants, attendance] = await Promise.all([
    listRows(env, RESOURCES.gifts),
    listRows(env, RESOURCES.restaurants),
    listRows(env, RESOURCES.attendance),
  ]);

  const perPersonEvent = Number(env.PER_PERSON_EVENT) || 100000;
  const perPersonGift = Number(env.PER_PERSON_GIFT) || 20000;
  const plannedHeadcount = Number(env.PLANNED_HEADCOUNT) || 0;

  // 선물 예산 = 파트별 당일 참석 인원 합계 × 인당 선물비 (동적)
  const attendees = attendance.reduce((s, a) => s + a.attendance, 0);
  const absentTotal = attendance.reduce((s, a) => s + a.absent_count, 0);
  const total = attendees * perPersonGift;
  const eventTotal = attendees * perPersonEvent;
  const spent = gifts.reduce((s, g) => s + g.subtotal, 0);

  return {
    budget: {
      total, spent, remaining: total - spent, count: gifts.length, overBudget: spent > total,
      attendees, absentTotal, plannedHeadcount,
      perPersonEvent, perPersonGift, eventTotal,
    },
    gifts,
    restaurants,
    attendance,
  };
}

async function createRow(req, env, cfg) {
  const body = await req.json().catch(() => null);
  if (!body) return err("잘못된 요청 형식입니다.");
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 1) return err("비밀번호를 설정해 주세요.");
  if (password.length > 200) return err("비밀번호가 너무 깁니다.");

  const v = cfg.validate(body, false);
  if (v.error) return err(v.error);

  // 유니크 제약(예: 파트당 1행) 사전 확인
  if (cfg.unique) {
    const dup = await env.DB.prepare(`SELECT id FROM ${cfg.table} WHERE ${cfg.unique} = ?`)
      .bind(v.value[cfg.unique]).first();
    if (dup) return err(`이미 등록된 ${cfg.uniqueLabel || cfg.unique}입니다. 수정해 주세요.`, 409);
  }

  const salt = newSalt();
  const pw_hash = await hashPassword(salt, password);
  const cols = [...cfg.insertCols, "pw_salt", "pw_hash"];
  const placeholders = cols.map(() => "?").join(", ");
  const values = [...cfg.insertCols.map((c) => v.value[c] ?? null), salt, pw_hash];

  const res = await env.DB.prepare(
    `INSERT INTO ${cfg.table} (${cols.join(", ")}) VALUES (${placeholders})`
  ).bind(...values).run();

  const row = await env.DB.prepare(`SELECT ${cfg.cols} FROM ${cfg.table} WHERE id = ?`)
    .bind(res.meta.last_row_id).first();
  return json({ item: cfg.toPublic(row) }, 201);
}

async function updateRow(id, req, env, cfg) {
  const body = await req.json().catch(() => null);
  if (!body) return err("잘못된 요청 형식입니다.");
  const row = await env.DB.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).bind(id).first();
  if (!row) return err("항목을 찾을 수 없습니다.", 404);
  if (!(await verifyPassword(row, body.password, env))) return err("비밀번호가 일치하지 않습니다.", 401);

  const v = cfg.validate(body, true);
  if (v.error) return err(v.error);

  const fields = [], values = [];
  for (const key of cfg.updatable) {
    if (v.value[key] !== undefined) { fields.push(`${key} = ?`); values.push(v.value[key]); }
  }
  if (!fields.length) return err("수정할 내용이 없습니다.");
  values.push(id);
  await env.DB.prepare(`UPDATE ${cfg.table} SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();

  const updated = await env.DB.prepare(`SELECT ${cfg.cols} FROM ${cfg.table} WHERE id = ?`).bind(id).first();
  return json({ item: cfg.toPublic(updated) });
}

async function deleteRow(id, req, env, cfg) {
  const body = await req.json().catch(() => ({}));
  const row = await env.DB.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).bind(id).first();
  if (!row) return err("항목을 찾을 수 없습니다.", 404);
  if (!(await verifyPassword(row, body && body.password, env))) return err("비밀번호가 일치하지 않습니다.", 401);
  await env.DB.prepare(`DELETE FROM ${cfg.table} WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (!path.startsWith("/api/")) {
      // UI는 GitHub Pages에서 서빙한다. 루트 접속 시 대시보드로 안내.
      return Response.redirect("https://yonchelee.github.io/2026_2nd_GWP/", 302);
    }

    try {
      if (path === "/api/state" && request.method === "GET") {
        return json(await getState(env));
      }

      // /api/{gifts|restaurants}  또는  /api/{...}/:id
      const m = path.match(/^\/api\/(gifts|restaurants|attendance)(?:\/(\d+))?$/);
      if (m) {
        const cfg = RESOURCES[m[1]];
        const id = m[2] ? Number(m[2]) : null;
        if (id === null && request.method === "POST") return await createRow(request, env, cfg);
        if (id !== null && request.method === "PUT") return await updateRow(id, request, env, cfg);
        if (id !== null && request.method === "DELETE") return await deleteRow(id, request, env, cfg);
      }

      return err("지원하지 않는 요청입니다.", 404);
    } catch (e) {
      return err("서버 오류가 발생했습니다.", 500);
    }
  },
};
