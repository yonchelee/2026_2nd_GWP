// 2026 2분기 GWP 선물 대시보드 — Cloudflare Worker (API)
// 정적 자산은 [assets] 바인딩이 먼저 서빙하고, /api/* 요청만 이 Worker가 처리한다.

const MAX_NAME = 100;
const MAX_TEXT = 500;
const MAX_URL = 1000;

/** JSON 응답 헬퍼 */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function err(message, status = 400) {
  return json({ error: message }, status);
}

/** 16바이트 랜덤 salt를 hex 문자열로 */
function newSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256(salt + ":" + password) → hex */
async function hashPassword(salt, password) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 상수 시간 비교(타이밍 공격 완화) */
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 항목 비밀번호 검증 (관리자 비밀번호로 우회 가능) */
async function verifyPassword(row, password, env) {
  if (typeof password !== "string" || password.length === 0) return false;
  if (env.ADMIN_PASSWORD && timingSafeEqual(password, env.ADMIN_PASSWORD)) {
    return true;
  }
  const computed = await hashPassword(row.pw_salt, password);
  return timingSafeEqual(computed, row.pw_hash);
}

/** 입력 정규화 및 검증. 성공 시 {value}, 실패 시 {error} */
function validateGiftInput(body, { partial = false } = {}) {
  const out = {};

  // name
  if (!partial || body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return { error: "제품명을 입력해 주세요." };
    if (name.length > MAX_NAME) return { error: `제품명은 ${MAX_NAME}자 이하로 입력해 주세요.` };
    out.name = name;
  }

  // price
  if (!partial || body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || !Number.isInteger(price) || price < 0) {
      return { error: "가격은 0 이상의 정수(원)로 입력해 주세요." };
    }
    if (price > 100000000) return { error: "가격이 너무 큽니다." };
    out.price = price;
  }

  // quantity
  if (!partial || body.quantity !== undefined) {
    const quantity = body.quantity === undefined || body.quantity === "" ? 1 : Number(body.quantity);
    if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 1) {
      return { error: "수량은 1 이상의 정수로 입력해 주세요." };
    }
    if (quantity > 100000) return { error: "수량이 너무 큽니다." };
    out.quantity = quantity;
  }

  // url (선택)
  if (!partial || body.url !== undefined) {
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (url) {
      if (url.length > MAX_URL) return { error: "링크가 너무 깁니다." };
      if (!/^https?:\/\//i.test(url)) return { error: "링크는 http(s):// 로 시작해야 합니다." };
      out.url = url;
    } else {
      out.url = null;
    }
  }

  // registrant (선택)
  if (!partial || body.registrant !== undefined) {
    const registrant = typeof body.registrant === "string" ? body.registrant.trim() : "";
    if (registrant.length > MAX_NAME) return { error: `등록자는 ${MAX_NAME}자 이하로 입력해 주세요.` };
    out.registrant = registrant || null;
  }

  // note (선택)
  if (!partial || body.note !== undefined) {
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (note.length > MAX_TEXT) return { error: `메모는 ${MAX_TEXT}자 이하로 입력해 주세요.` };
    out.note = note || null;
  }

  return { value: out };
}

/** DB row → 외부 응답용(민감정보 제거) */
function publicGift(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    price: row.price,
    quantity: row.quantity,
    subtotal: row.price * row.quantity,
    registrant: row.registrant,
    note: row.note,
    created_at: row.created_at,
  };
}

async function getState(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, name, url, price, quantity, registrant, note, created_at FROM gifts ORDER BY created_at DESC, id DESC"
  ).all();

  const gifts = (results || []).map(publicGift);
  const total = Number(env.TOTAL_BUDGET) || 0;
  const headcount = Number(env.HEADCOUNT) || 0;
  const perPerson = Number(env.PER_PERSON) || 0;
  const spent = gifts.reduce((sum, g) => sum + g.subtotal, 0);

  return {
    budget: {
      total,
      headcount,
      perPerson,
      spent,
      remaining: total - spent,
      count: gifts.length,
      overBudget: spent > total,
    },
    gifts,
  };
}

async function createGift(req, env) {
  const body = await req.json().catch(() => null);
  if (!body) return err("잘못된 요청 형식입니다.");

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 1) return err("비밀번호를 설정해 주세요.");
  if (password.length > 200) return err("비밀번호가 너무 깁니다.");

  const v = validateGiftInput(body, { partial: false });
  if (v.error) return err(v.error);
  const g = v.value;

  const salt = newSalt();
  const pw_hash = await hashPassword(salt, password);

  const res = await env.DB.prepare(
    `INSERT INTO gifts (name, url, price, quantity, registrant, note, pw_salt, pw_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(g.name, g.url, g.price, g.quantity, g.registrant, g.note, salt, pw_hash)
    .run();

  const id = res.meta.last_row_id;
  const row = await env.DB.prepare(
    "SELECT id, name, url, price, quantity, registrant, note, created_at FROM gifts WHERE id = ?"
  )
    .bind(id)
    .first();

  return json({ gift: publicGift(row) }, 201);
}

async function updateGift(id, req, env) {
  const body = await req.json().catch(() => null);
  if (!body) return err("잘못된 요청 형식입니다.");

  const row = await env.DB.prepare("SELECT * FROM gifts WHERE id = ?").bind(id).first();
  if (!row) return err("해당 선물을 찾을 수 없습니다.", 404);

  if (!(await verifyPassword(row, body.password, env))) {
    return err("비밀번호가 일치하지 않습니다.", 401);
  }

  const v = validateGiftInput(body, { partial: true });
  if (v.error) return err(v.error);
  const g = v.value;

  // 변경할 필드만 동적으로 구성
  const fields = [];
  const values = [];
  for (const key of ["name", "url", "price", "quantity", "registrant", "note"]) {
    if (g[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(g[key]);
    }
  }
  if (fields.length === 0) return err("수정할 내용이 없습니다.");

  values.push(id);
  await env.DB.prepare(`UPDATE gifts SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  const updated = await env.DB.prepare(
    "SELECT id, name, url, price, quantity, registrant, note, created_at FROM gifts WHERE id = ?"
  )
    .bind(id)
    .first();

  return json({ gift: publicGift(updated) });
}

async function deleteGift(id, req, env) {
  const body = await req.json().catch(() => ({}));
  const row = await env.DB.prepare("SELECT * FROM gifts WHERE id = ?").bind(id).first();
  if (!row) return err("해당 선물을 찾을 수 없습니다.", 404);

  if (!(await verifyPassword(row, body && body.password, env))) {
    return err("비밀번호가 일치하지 않습니다.", 401);
  }

  await env.DB.prepare("DELETE FROM gifts WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // /api/* 만 처리. 그 외 경로는 정적 자산이 처리하므로 도달하지 않음.
    if (!path.startsWith("/api/")) {
      return new Response("Not Found", { status: 404 });
    }

    try {
      if (path === "/api/state" && request.method === "GET") {
        return json(await getState(env));
      }

      if (path === "/api/gifts" && request.method === "POST") {
        return await createGift(request, env);
      }

      const m = path.match(/^\/api\/gifts\/(\d+)$/);
      if (m) {
        const id = Number(m[1]);
        if (request.method === "PUT") return await updateGift(id, request, env);
        if (request.method === "DELETE") return await deleteGift(id, request, env);
      }

      return err("지원하지 않는 요청입니다.", 404);
    } catch (e) {
      return err("서버 오류가 발생했습니다.", 500);
    }
  },
};
