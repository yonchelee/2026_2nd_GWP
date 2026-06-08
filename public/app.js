"use strict";

// ---------- 유틸 ----------
const $ = (sel, root = document) => root.querySelector(sel);

/** 사용자 입력을 안전하게 텍스트로 표시(XSS 방지) */
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  const res = await fetch(path, opts);
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    /* no-op */
  }
  if (!res.ok) {
    throw new Error((data && data.error) || `요청 실패 (${res.status})`);
  }
  return data;
}

// ---------- 렌더링 ----------
function renderBudget(b) {
  $("#b-total").textContent = won(b.total);
  $("#b-formula").textContent = `${b.headcount.toLocaleString("ko-KR")}명 × ${won(b.perPerson)}`;
  $("#b-spent").textContent = won(b.spent);
  $("#b-count").textContent = `등록 ${b.count}건`;
  $("#b-remaining").textContent = won(b.remaining);

  const remainCard = $("#card-remaining");
  remainCard.classList.toggle("over", b.overBudget);
  remainCard.classList.toggle("ok", !b.overBudget);
  $("#b-status").textContent = b.overBudget ? "예산 초과!" : "예산 내";

  const pct = b.total > 0 ? (b.spent / b.total) * 100 : 0;
  const bar = $("#progress-bar");
  bar.style.width = Math.min(pct, 100).toFixed(1) + "%";
  bar.classList.toggle("over", b.overBudget);
  $("#progress-text").textContent =
    `예산의 ${pct.toFixed(1)}% 사용` + (b.overBudget ? ` · ${won(b.spent - b.total)} 초과` : "");
}

function giftCardHtml(g) {
  const nameHtml = g.url
    ? `<a href="${escapeHtml(g.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(g.name)}</a>`
    : escapeHtml(g.name);

  const metaParts = [];
  if (g.registrant) metaParts.push(`등록자: ${escapeHtml(g.registrant)}`);
  metaParts.push(`단가 ${won(g.price)} × ${g.quantity}개`);
  const meta = metaParts.join(" · ");

  const note = g.note ? `<div class="gift-note">${escapeHtml(g.note)}</div>` : "";

  return `
    <div class="gift" data-id="${g.id}">
      <div class="gift-main">
        <div class="gift-name">${nameHtml}</div>
        <div class="gift-meta">${meta}</div>
        ${note}
      </div>
      <div class="gift-right">
        <div class="gift-subtotal">${won(g.subtotal)}</div>
        <div class="gift-unit">소계</div>
        <div class="gift-actions">
          <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${g.id}">수정</button>
          <button class="btn btn-danger btn-sm" data-action="delete" data-id="${g.id}">삭제</button>
        </div>
      </div>
    </div>`;
}

let GIFTS = [];

function renderGifts(gifts) {
  GIFTS = gifts;
  const list = $("#gift-list");
  $("#list-count").textContent = gifts.length;
  if (!gifts.length) {
    list.innerHTML = `<p class="empty" id="empty">아직 등록된 선물이 없어요. 첫 번째 후보를 추가해 보세요!</p>`;
    return;
  }
  list.innerHTML = gifts.map(giftCardHtml).join("");
}

async function refresh() {
  const state = await api("/api/state");
  renderBudget(state.budget);
  renderGifts(state.gifts);
}

// ---------- 등록 ----------
$("#add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const msg = $("#add-msg");
  const fd = new FormData(form);
  const payload = {
    name: fd.get("name"),
    price: fd.get("price"),
    quantity: fd.get("quantity") || 1,
    registrant: fd.get("registrant"),
    url: fd.get("url"),
    note: fd.get("note"),
    password: fd.get("password"),
  };

  const btn = $("button[type=submit]", form);
  btn.disabled = true;
  showMsg(msg, "등록 중...", "");
  try {
    await api("/api/gifts", "POST", payload);
    form.reset();
    $("input[name=quantity]", form).value = "1";
    showMsg(msg, "등록되었습니다 ✓", "ok");
    await refresh();
    setTimeout(() => showMsg(msg, "", ""), 2500);
  } catch (err) {
    showMsg(msg, err.message, "error");
  } finally {
    btn.disabled = false;
  }
});

// ---------- 수정 모달 ----------
const overlay = $("#edit-overlay");
const editForm = $("#edit-form");

function openEdit(id) {
  const g = GIFTS.find((x) => x.id === id);
  if (!g) return;
  editForm.id.value = g.id;
  editForm.name.value = g.name;
  editForm.price.value = g.price;
  editForm.quantity.value = g.quantity;
  editForm.registrant.value = g.registrant || "";
  editForm.url.value = g.url || "";
  editForm.note.value = g.note || "";
  editForm.password.value = "";
  showMsg($("#edit-msg"), "", "");
  overlay.hidden = false;
  editForm.password.focus();
}

function closeEdit() {
  overlay.hidden = true;
}

$("#edit-cancel").addEventListener("click", closeEdit);
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeEdit();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !overlay.hidden) closeEdit();
});

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#edit-msg");
  const id = Number(editForm.id.value);
  const payload = {
    name: editForm.name.value,
    price: editForm.price.value,
    quantity: editForm.quantity.value || 1,
    registrant: editForm.registrant.value,
    url: editForm.url.value,
    note: editForm.note.value,
    password: editForm.password.value,
  };
  const btn = $("button[type=submit]", editForm);
  btn.disabled = true;
  showMsg(msg, "저장 중...", "");
  try {
    await api(`/api/gifts/${id}`, "PUT", payload);
    closeEdit();
    await refresh();
  } catch (err) {
    showMsg(msg, err.message, "error");
  } finally {
    btn.disabled = false;
  }
});

// ---------- 삭제 ----------
async function deleteGift(id) {
  const g = GIFTS.find((x) => x.id === id);
  const label = g ? `'${g.name}'` : "이 선물";
  const password = window.prompt(`${label}을(를) 삭제하려면 등록 시 설정한 비밀번호를 입력하세요.`);
  if (password === null) return; // 취소
  try {
    await api(`/api/gifts/${id}`, "DELETE", { password });
    await refresh();
  } catch (err) {
    window.alert(err.message);
  }
}

// 목록 내 버튼 이벤트 위임
$("#gift-list").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  if (btn.dataset.action === "edit") openEdit(id);
  else if (btn.dataset.action === "delete") deleteGift(id);
});

// ---------- 초기 로드 ----------
refresh().catch((err) => {
  $("#progress-text").textContent = "데이터를 불러오지 못했습니다: " + err.message;
});
