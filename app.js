"use strict";

// GitHub Pages(github.io)에서 열리면 Cloudflare Worker API를 절대경로로 호출하고,
// Worker(workers.dev)에서 열리면 동일 출처(상대경로)로 호출한다.
const API_BASE = location.hostname.endsWith("workers.dev") ? "" : "https://gwp-2026-q2.yonchelee.workers.dev";

const $ = (sel, root = document) => root.querySelector(sel);

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const won = (n) => `${Number(n).toLocaleString("ko-KR")}원`;

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = "form-msg" + (type ? " " + type : "");
}

async function api(path, method = "GET", body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["content-type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(API_BASE + path, opts);
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error((data && data.error) || `요청 실패 (${res.status})`);
  return data;
}

// ---------- 리소스 정의 ----------
const RESOURCES = {
  gifts: {
    path: "/api/gifts",
    fields: [
      { name: "name", label: "제품명", type: "text", required: true, maxlength: 100 },
      { name: "price", label: "가격(원)", type: "number", required: true, min: 0 },
      { name: "quantity", label: "수량", type: "number", min: 1 },
      { name: "registrant", label: "추천자", type: "text", maxlength: 100 },
      { name: "url", label: "구매 링크", type: "url", maxlength: 1000, wide: true },
      { name: "note", label: "메모", type: "text", maxlength: 500, wide: true },
    ],
  },
  restaurants: {
    path: "/api/restaurants",
    fields: [
      { name: "part", label: "파트명", type: "text", required: true, maxlength: 100 },
      { name: "restaurant", label: "식당명", type: "text", required: true, maxlength: 100 },
      { name: "category", label: "메뉴/종류", type: "text", maxlength: 100 },
      { name: "headcount", label: "인원", type: "number", min: 0 },
      { name: "url", label: "위치/예약 링크", type: "url", maxlength: 1000, wide: true },
      { name: "note", label: "메모", type: "text", maxlength: 500, wide: true },
    ],
  },
};

let GIFTS = [];
let RESTS = [];

// ---------- 렌더링: 예산 ----------
function renderBudget(b) {
  $("#b-total").textContent = won(b.total);
  $("#b-formula").textContent = `${b.headcount.toLocaleString("ko-KR")}명 × ${won(b.perPerson)}`;
  $("#b-spent").textContent = won(b.spent);
  $("#b-count").textContent = `등록 ${b.count}건`;
  $("#b-remaining").textContent = won(b.remaining);

  const card = $("#card-remaining");
  card.classList.toggle("over", b.overBudget);
  card.classList.toggle("ok", !b.overBudget);
  $("#b-status").textContent = b.overBudget ? "예산 초과!" : "예산 내";

  const pct = b.total > 0 ? (b.spent / b.total) * 100 : 0;
  const bar = $("#progress-bar");
  bar.style.width = Math.min(pct, 100).toFixed(1) + "%";
  bar.classList.toggle("over", b.overBudget);
  $("#progress-text").textContent =
    `예산의 ${pct.toFixed(1)}% 사용` + (b.overBudget ? ` · ${won(b.spent - b.total)} 초과` : "");
}

// ---------- 렌더링: 선물 ----------
function giftHtml(g) {
  const name = g.url
    ? `<a href="${escapeHtml(g.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(g.name)}</a>`
    : escapeHtml(g.name);
  const meta = [];
  if (g.registrant) meta.push(`추천: ${escapeHtml(g.registrant)}`);
  meta.push(`단가 ${won(g.price)} × ${g.quantity}개`);
  const note = g.note ? `<div class="item-note">${escapeHtml(g.note)}</div>` : "";
  return `
    <div class="item">
      <div class="item-main">
        <div class="item-title">${name}</div>
        <div class="item-meta">${meta.join(" · ")}</div>
        ${note}
      </div>
      <div class="item-right">
        <div class="item-amount">${won(g.subtotal)}</div>
        <div class="item-amount-label">소계</div>
        <div class="item-actions">
          <button class="btn btn-ghost btn-sm" data-kind="gifts" data-action="edit" data-id="${g.id}">수정</button>
          <button class="btn btn-danger btn-sm" data-kind="gifts" data-action="delete" data-id="${g.id}">삭제</button>
        </div>
      </div>
    </div>`;
}

// ---------- 렌더링: 식당 ----------
function restHtml(r) {
  const title = r.url
    ? `<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.restaurant)}</a>`
    : escapeHtml(r.restaurant);
  const meta = [];
  if (r.category) meta.push(escapeHtml(r.category));
  if (r.headcount != null) meta.push(`${r.headcount}명`);
  const metaHtml = meta.length ? `<div class="item-meta">${meta.join(" · ")}</div>` : "";
  const note = r.note ? `<div class="item-note">${escapeHtml(r.note)}</div>` : "";
  return `
    <div class="item">
      <div class="item-main">
        <div class="item-title"><span class="part-tag">${escapeHtml(r.part)}</span> ${title}</div>
        ${metaHtml}
        ${note}
      </div>
      <div class="item-right">
        <div class="item-actions">
          <button class="btn btn-ghost btn-sm" data-kind="restaurants" data-action="edit" data-id="${r.id}">수정</button>
          <button class="btn btn-danger btn-sm" data-kind="restaurants" data-action="delete" data-id="${r.id}">삭제</button>
        </div>
      </div>
    </div>`;
}

function renderGifts(gifts) {
  GIFTS = gifts;
  $("#gift-listcount").textContent = gifts.length;
  const list = $("#gift-list");
  list.innerHTML = gifts.length
    ? gifts.map(giftHtml).join("")
    : `<p class="empty">아직 등록된 선물이 없어요. 첫 추천을 남겨보세요!</p>`;
}

function renderRests(rests) {
  RESTS = rests;
  $("#rest-listcount").textContent = rests.length;
  const list = $("#rest-list");
  list.innerHTML = rests.length
    ? rests.map(restHtml).join("")
    : `<p class="empty">아직 등록된 식당이 없어요. 파트별 만찬 장소를 등록해 주세요!</p>`;
}

async function refresh() {
  const s = await api("/api/state");
  renderBudget(s.budget);
  renderGifts(s.gifts);
  renderRests(s.restaurants);
}

// ---------- 등록 폼 ----------
function collect(form, kind) {
  const fd = new FormData(form);
  const payload = { password: fd.get("password") };
  for (const f of RESOURCES[kind].fields) {
    let v = fd.get(f.name);
    if (f.name === "quantity" && (v === "" || v == null)) v = 1;
    payload[f.name] = v;
  }
  return payload;
}

function bindCreateForm(formId, msgId, kind) {
  const form = $(formId);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $(msgId);
    const btn = $("button[type=submit]", form);
    btn.disabled = true;
    showMsg(msg, "등록 중...", "");
    try {
      await api(RESOURCES[kind].path, "POST", collect(form, kind));
      form.reset();
      const q = $("input[name=quantity]", form);
      if (q) q.value = "1";
      showMsg(msg, "등록되었습니다 ✓", "ok");
      await refresh();
      setTimeout(() => showMsg(msg, "", ""), 2500);
    } catch (err) {
      showMsg(msg, err.message, "error");
    } finally {
      btn.disabled = false;
    }
  });
}

bindCreateForm("#gift-form", "#gift-msg", "gifts");
bindCreateForm("#rest-form", "#rest-msg", "restaurants");

// ---------- 수정 모달 ----------
const overlay = $("#edit-overlay");
const editForm = $("#edit-form");

function openEdit(kind, id) {
  const item = (kind === "gifts" ? GIFTS : RESTS).find((x) => x.id === id);
  if (!item) return;
  $("#edit-title").textContent = kind === "gifts" ? "선물 수정" : "식당 수정";
  editForm.id.value = id;
  editForm.kind.value = kind;

  const fieldsHtml = RESOURCES[kind].fields.map((f) => {
    const val = item[f.name] == null ? "" : item[f.name];
    const attrs = [
      `name="${f.name}"`,
      `type="${f.type}"`,
      f.required ? "required" : "",
      f.maxlength ? `maxlength="${f.maxlength}"` : "",
      f.min != null ? `min="${f.min}"` : "",
      f.type === "number" ? 'step="1"' : "",
    ].join(" ");
    return `<label class="field ${f.wide ? "field-wide" : ""}">
        <span>${f.label}${f.required ? ' <em>*</em>' : ""}</span>
        <input ${attrs} value="${escapeHtml(val)}" />
      </label>`;
  }).join("");

  $("#edit-fields").innerHTML = fieldsHtml +
    `<label class="field"><span>비밀번호 <em>*</em></span>
       <input name="password" type="password" maxlength="200" required placeholder="등록 시 설정한 비밀번호" /></label>`;

  showMsg($("#edit-msg"), "", "");
  overlay.hidden = false;
  $("input[name=password]", editForm).focus();
}

function closeEdit() { overlay.hidden = true; }

$("#edit-cancel").addEventListener("click", closeEdit);
overlay.addEventListener("click", (e) => { if (e.target === overlay) closeEdit(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) closeEdit(); });

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#edit-msg");
  const kind = editForm.kind.value;
  const id = Number(editForm.id.value);
  const fd = new FormData(editForm);
  const payload = { password: fd.get("password") };
  for (const f of RESOURCES[kind].fields) payload[f.name] = fd.get(f.name);

  const btn = $("button[type=submit]", editForm);
  btn.disabled = true;
  showMsg(msg, "저장 중...", "");
  try {
    await api(`${RESOURCES[kind].path}/${id}`, "PUT", payload);
    closeEdit();
    await refresh();
  } catch (err) {
    showMsg(msg, err.message, "error");
  } finally {
    btn.disabled = false;
  }
});

// ---------- 삭제 ----------
async function removeItem(kind, id) {
  const arr = kind === "gifts" ? GIFTS : RESTS;
  const item = arr.find((x) => x.id === id);
  const label = item ? `'${item.name || item.restaurant}'` : "이 항목";
  const password = window.prompt(`${label}을(를) 삭제하려면 비밀번호를 입력하세요.`);
  if (password === null) return;
  try {
    await api(`${RESOURCES[kind].path}/${id}`, "DELETE", { password });
    await refresh();
  } catch (err) {
    window.alert(err.message);
  }
}

// 목록 버튼 이벤트 위임
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const { kind, action, id } = btn.dataset;
  if (action === "edit") openEdit(kind, Number(id));
  else if (action === "delete") removeItem(kind, Number(id));
});

// ---------- 초기 로드 ----------
refresh().catch((err) => {
  const t = $("#progress-text");
  if (t) t.textContent = "데이터를 불러오지 못했습니다: " + err.message;
});
