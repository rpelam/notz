"use strict";

const CFG = {
  url: "https://romjkgtvgktpysssagsf.supabase.co",
  key: "sb_publishable_jbWXopdldAED0cK_sSpT4w_DY8Kmc5k",
  vapid: "BF2-w_OIOt8kSg8iFZcDv-aYjjd0Wa0UVReNS48f5V6UZ0ZhubmY-67AIZHAy5aS08OnwnKhP1ff-JnOtby3OQ4",
  bucket: "notz"
};
const TAGS = ["LSO", "Macarel!", "Dtego", "Perso"];
const sb = supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true } });

const $ = (s) => document.querySelector(s);
const state = {
  user: null, notes: [], pending: [], tags: new Set(), view: "rem", filter: null, q: "",
  remindManual: false, saving: false, alerted: new Set(), interacted: false,
  urls: new Map(), channel: null, rec: null, focusId: null, setupMode: false
};

/* ---------- helpers ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : String(k));
  return el;
}
const pad = (n) => String(n).padStart(2, "0");
const toLocalInput = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmt = (ms) => new Date(ms).toLocaleString("fr-CA", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(",", " ·");
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const ms = (v) => (v == null ? null : +new Date(v));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></svg>';

function say(text, err) { const m = $("#msg"); m.textContent = text || ""; m.classList.toggle("err", !!err); }
function setStatus(text, bad) { const s = $("#status"); s.textContent = text || ""; s.classList.toggle("bad", !!bad); }
function cacheNotes() { try { localStorage.setItem("notz:notes", JSON.stringify(state.notes.slice(0, 300))); } catch (e) { /* storage full or blocked */ } }
function cachedNotes() { try { return JSON.parse(localStorage.getItem("notz:notes") || "[]"); } catch (e) { return []; } }

/* ---------- French date detection ---------- */
const WD = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MO = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
const KEY = /(rappel|rappelle|penser a|pense a|n'oublie|oublie pas|relancer|appeler|rdv|rendez-vous|reunion|livraison|commander|payer|envoyer)/;
function parseFr(raw, now = new Date()) {
  const t = raw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/’/g, "'");
  let m;
  if ((m = t.match(/dans\s+(\d+|un|une)\s*(minutes?|mins?|heures?|h|jours?|semaines?)\b/))) {
    const n = /^\d/.test(m[1]) ? +m[1] : 1, u = m[2][0], d = new Date(now);
    if (u === "m") d.setMinutes(d.getMinutes() + n); else if (u === "h") d.setHours(d.getHours() + n);
    else if (u === "j") d.setDate(d.getDate() + n); else d.setDate(d.getDate() + 7 * n);
    return d;
  }
  let day = null, defH = 9, hasDay = false;
  const base = new Date(now); base.setSeconds(0, 0);
  if (/apres-demain|apres demain/.test(t)) { day = new Date(base); day.setDate(day.getDate() + 2); hasDay = true; }
  else if (/\bdemain\b/.test(t)) { day = new Date(base); day.setDate(day.getDate() + 1); hasDay = true; if (/demain soir/.test(t)) defH = 19; if (/demain apres-midi/.test(t)) defH = 14; }
  else if (/ce soir/.test(t)) { day = new Date(base); defH = 19; hasDay = true; }
  else if (/cet apres-midi|cet aprem/.test(t)) { day = new Date(base); defH = 14; hasDay = true; }
  else if (/ce matin|aujourd'hui|aujourd hui/.test(t)) { day = new Date(base); hasDay = true; }
  if (!day) {
    for (let i = 0; i < 7; i++) {
      if (new RegExp("\\b" + WD[i] + "\\b").test(t)) { let diff = (i - base.getDay() + 7) % 7; if (diff === 0) diff = 7; day = new Date(base); day.setDate(day.getDate() + diff); hasDay = true; break; }
    }
  }
  if (!day && (m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : base.getFullYear();
    day = new Date(y, +m[2] - 1, +m[1]); if (!m[3] && day < new Date(base.toDateString())) day.setFullYear(y + 1); hasDay = true;
  }
  if (!day && (m = t.match(new RegExp("\\b(\\d{1,2})(?:er)?\\s+(" + MO.join("|") + ")\\b")))) {
    const y = base.getFullYear(); day = new Date(y, MO.indexOf(m[2]), +m[1]); if (day < new Date(base.toDateString())) day.setFullYear(y + 1); hasDay = true;
  }
  let hh = null, mm = 0;
  if ((m = t.match(/\b(?:a\s+)?(\d{1,2})\s*h\s*(\d{2})?\b/)) && +m[1] < 24) { hh = +m[1]; mm = m[2] ? +m[2] : 0; }
  else if ((m = t.match(/\b(\d{1,2}):(\d{2})\b/)) && +m[1] < 24) { hh = +m[1]; mm = +m[2]; }
  else if (/\bmidi\b/.test(t)) { hh = 12; }
  if (!hasDay && hh == null) return null;
  if (!hasDay && !KEY.test(t)) return null; // a lone "3h" in a recipe is not a reminder
  if (!day) { day = new Date(base); day.setHours(hh, mm, 0, 0); if (day <= now) day.setDate(day.getDate() + 1); return day; }
  day.setHours(hh == null ? defH : hh, hh == null ? 0 : mm, 0, 0);
  return day;
}

/* ---------- Auth ---------- */
async function showAuth() {
  $("#mainView").hidden = true; $("#settingsView").hidden = true; $("#settingsBtn").hidden = true;
  $("#authView").hidden = false;
  setStatus("");
  let configured = true;
  try {
    const { data } = await sb.functions.invoke("notz-setup", { body: { check: true } });
    configured = !!data?.configured;
  } catch (e) { /* offline: assume sign-in */ }
  state.setupMode = !configured;
  $("#authTitle").textContent = configured ? "Connexion" : "Créer ton compte Notz";
  $("#authIntro").textContent = configured
    ? "Connecte-toi une fois sur chaque appareil. Notz reste ensuite ouvert."
    : "Première ouverture : choisis le courriel et le mot de passe de ton compte. Ce compte sera le seul à pouvoir utiliser Notz.";
  $("#confirmWrap").hidden = configured;
  $("#authPass").autocomplete = configured ? "current-password" : "new-password";
  $("#authBtn").textContent = configured ? "Se connecter" : "Créer le compte";
}
$("#authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#authEmail").value.trim(), pass = $("#authPass").value;
  const msg = $("#authMsg"); msg.classList.add("err");
  if (!email || pass.length < 8) { msg.textContent = "Entre ton courriel et un mot de passe d'au moins 8 caractères."; return; }
  if (state.setupMode && pass !== $("#authPass2").value) { msg.textContent = "Les deux mots de passe ne sont pas identiques."; return; }
  $("#authBtn").disabled = true; msg.classList.remove("err"); msg.textContent = state.setupMode ? "Création du compte…" : "Connexion…";
  try {
    if (state.setupMode) {
      const { data, error } = await sb.functions.invoke("notz-setup", { body: { email, password: pass } });
      if (error || !data?.ok) throw new Error("setup");
    }
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    msg.textContent = "";
  } catch (err) {
    msg.classList.add("err");
    msg.textContent = state.setupMode ? "La création du compte a échoué. Vérifie ta connexion et réessaie." : "Courriel ou mot de passe incorrect.";
  } finally { $("#authBtn").disabled = false; }
});

/* ---------- Composer ---------- */
function renderTagChips() {
  $("#tagChips").replaceChildren(...TAGS.map((tg) => h("button", { type: "button", class: "chip", "aria-pressed": state.tags.has(tg) ? "true" : "false", onclick: () => { state.tags.has(tg) ? state.tags.delete(tg) : state.tags.add(tg); renderTagChips(); } }, tg)));
  $("#filterChips").replaceChildren(...[null, ...TAGS].map((tg) => h("button", { type: "button", class: "chip", "aria-pressed": state.filter === tg ? "true" : "false", onclick: () => { state.filter = tg; renderTagChips(); render(); } }, tg || "Toutes")));
}
function setReminder(t, why) {
  $("#remindRow").hidden = t == null;
  $("#remindBtn").classList.toggle("on", t != null);
  $("#remindAt").value = t == null ? "" : toLocalInput(t);
  $("#detected").textContent = why || "";
}
let detectTimer;
$("#noteText").addEventListener("input", () => {
  clearTimeout(detectTimer);
  detectTimer = setTimeout(() => {
    if (state.remindManual) return;
    const d = parseFr($("#noteText").value);
    if (d) setReminder(+d, "détecté dans le texte"); else if ($("#detected").textContent) setReminder(null);
  }, 300);
});
$("#remindBtn").onclick = () => {
  if (!$("#remindRow").hidden) { $("#remindAt").focus(); return; }
  const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); state.remindManual = true; setReminder(+d, ""); $("#remindAt").focus();
};
$("#remindAt").addEventListener("change", () => { state.remindManual = true; $("#detected").textContent = ""; });
$("#clearRemind").onclick = () => { state.remindManual = true; setReminder(null); };

function renderPending() {
  $("#attachPreview").replaceChildren(...state.pending.map((p, i) => h("div", { class: "thumb" },
    p.kind === "photo" ? h("img", { src: p.preview, alt: "" }) : "Vocal\n" + p.label,
    h("button", { type: "button", "aria-label": "Retirer", onclick: () => { if (p.preview) URL.revokeObjectURL(p.preview); state.pending.splice(i, 1); renderPending(); } }, "×"))));
}
async function shrinkImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
    return blob || file;
  } catch (e) { return file; }
}
$("#photoInput").addEventListener("change", async (e) => {
  for (const f of e.target.files) { const blob = await shrinkImage(f); state.pending.push({ kind: "photo", blob, preview: URL.createObjectURL(blob) }); }
  e.target.value = ""; renderPending();
});

/* ---------- Voice recording ---------- */
function pickMime() {
  for (const t of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"]) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
  return "";
}
async function startRec() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { say("L'enregistrement vocal n'est pas disponible sur ce navigateur.", true); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { say("Accès au micro refusé. Autorise-le dans les réglages de l'appareil pour Notz.", true); return; }
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  const t0 = Date.now();
  state.rec = { rec, stream, chunks, t0, cancelled: false, timer: setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); $("#recTime").textContent = `${Math.floor(s / 60)}:${pad(s % 60)}`; if (s >= 600) stopRec(); }, 250) };
  rec.onstop = () => {
    const r = state.rec; state.rec = null;
    clearInterval(r.timer); r.stream.getTracks().forEach((t) => t.stop());
    $("#recBar").hidden = true; $("#voiceBtn").classList.remove("live");
    if (r.cancelled || !r.chunks.length) return;
    const type = (rec.mimeType || mime || "audio/mp4").split(";")[0];
    const blob = new Blob(r.chunks, { type });
    const secs = Math.max(1, Math.round((Date.now() - r.t0) / 1000));
    state.pending.push({ kind: "audio", blob, label: `${Math.floor(secs / 60)}:${pad(secs % 60)}`, duration: secs });
    renderPending();
  };
  rec.start(1000);
  $("#recTime").textContent = "0:00"; $("#recBar").hidden = false; $("#voiceBtn").classList.add("live");
}
function stopRec(cancel) { if (!state.rec) return; state.rec.cancelled = !!cancel; try { state.rec.rec.stop(); } catch (e) { /* already stopped */ } }
$("#voiceBtn").onclick = () => { state.interacted = true; state.rec ? stopRec() : startRec(); };
$("#recStop").onclick = () => stopRec();
$("#recCancel").onclick = () => stopRec(true);

/* ---------- Save ---------- */
const extOf = (type) => ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "audio/mp4": "m4a", "audio/webm": "webm", "audio/ogg": "ogg" }[type] || "bin");
$("#saveBtn").onclick = async () => {
  state.interacted = true;
  if (state.rec) { say("Termine d'abord l'enregistrement vocal.", true); return; }
  const text = $("#noteText").value.trim();
  if (!text && !state.pending.length) { say("Écris quelque chose, dicte un vocal ou ajoute une photo.", true); return; }
  state.saving = true; $("#saveBtn").disabled = true;
  const id = uuid();
  const uploaded = [];
  try {
    const media = [];
    let i = 0;
    for (const p of state.pending) {
      const type = (p.blob.type || (p.kind === "photo" ? "image/jpeg" : "audio/mp4")).split(";")[0];
      const path = `${state.user.id}/${id}/${++i}.${extOf(type)}`;
      say(p.kind === "photo" ? `Envoi de la photo ${i}…` : "Envoi du vocal…");
      const { error } = await sb.storage.from(CFG.bucket).upload(path, p.blob, { contentType: type, upsert: false });
      if (error) throw Object.assign(new Error("upload"), { detail: error.message });
      uploaded.push(path);
      media.push({ path, kind: p.kind, type, duration: p.duration || null });
    }
    const remindAt = $("#remindRow").hidden || !$("#remindAt").value ? null : new Date($("#remindAt").value).toISOString();
    const row = { id, user_id: state.user.id, text, media, tags: [...state.tags], remind_at: remindAt };
    const { data, error } = await sb.from("notz_notes").insert(row).select().single();
    if (error) throw error;
    upsertLocal(data);
    state.pending.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
    $("#noteText").value = ""; state.pending = []; state.tags.clear(); state.remindManual = false;
    setReminder(null); renderPending(); renderTagChips();
    say(remindAt ? "Enregistré. Rappel le " + fmt(ms(remindAt)) + "." : "Enregistré.");
    if (remindAt) maybeNudgePush();
  } catch (e) {
    if (uploaded.length) sb.storage.from(CFG.bucket).remove(uploaded).catch(() => {});
    say(navigator.onLine === false ? "Pas de réseau : la note est restée dans le champ, réessaie dès que tu as du signal." : "L'enregistrement a échoué. Ta note est toujours là, réessaie.", true);
  } finally { state.saving = false; $("#saveBtn").disabled = false; }
};

/* ---------- Data ---------- */
function upsertLocal(n) {
  const i = state.notes.findIndex((x) => x.id === n.id);
  if (i >= 0) state.notes[i] = n; else state.notes.unshift(n);
  state.notes.sort((a, b) => ms(b.created_at) - ms(a.created_at));
  cacheNotes(); render();
}
async function loadNotes() {
  const { data, error } = await sb.from("notz_notes").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) { setStatus("Hors ligne", true); return; }
  state.notes = data; cacheNotes(); setStatus("");
  await signMedia(); render();
}
async function signMedia() {
  const paths = [];
  for (const n of state.notes) for (const m of n.media || []) if (!state.urls.has(m.path)) paths.push(m.path);
  for (let i = 0; i < paths.length; i += 100) {
    const { data } = await sb.storage.from(CFG.bucket).createSignedUrls(paths.slice(i, i + 100), 60 * 60 * 24);
    for (const r of data || []) if (r.signedUrl) state.urls.set(r.path, r.signedUrl);
  }
}
function subscribe() {
  if (state.channel) sb.removeChannel(state.channel);
  state.channel = sb.channel("notz-notes")
    .on("postgres_changes", { event: "*", schema: "public", table: "notz_notes", filter: `user_id=eq.${state.user.id}` }, async (p) => {
      if (p.eventType === "DELETE") { state.notes = state.notes.filter((n) => n.id !== p.old.id); cacheNotes(); render(); return; }
      if (p.new) { upsertLocal(p.new); await signMedia(); render(); }
    })
    .subscribe();
}
async function patch(n, data) {
  const { data: row, error } = await sb.from("notz_notes").update(data).eq("id", n.id).select().single();
  if (error) { say("La modification n'a pas été enregistrée. Vérifie ta connexion.", true); return; }
  upsertLocal(row);
}
function snooze(n, kind) {
  let d = new Date();
  if (kind === "1h") d = new Date(Math.max(Date.now(), ms(n.remind_at) || 0) + 3600000);
  else { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
  state.alerted.delete(n.id);
  patch(n, { remind_at: d.toISOString(), done: false });
}
async function removeNote(n, btn) {
  if (btn.dataset.armed !== "1") { btn.dataset.armed = "1"; btn.textContent = "Confirmer la suppression"; setTimeout(() => { btn.dataset.armed = ""; btn.textContent = "Supprimer"; }, 3500); return; }
  const { error } = await sb.from("notz_notes").delete().eq("id", n.id);
  if (error) { say("Suppression impossible. Vérifie ta connexion.", true); return; }
  const paths = (n.media || []).map((m) => m.path);
  if (paths.length) sb.storage.from(CFG.bucket).remove(paths).catch(() => {});
  state.notes = state.notes.filter((x) => x.id !== n.id); cacheNotes(); render();
}

/* ---------- List ---------- */
function remState(n, now = Date.now()) {
  const r = ms(n.remind_at);
  if (r == null) return null;
  if (n.done) return { cls: "done", label: "Fait" };
  if (r <= now) return { cls: "late", label: "À faire maintenant" };
  if (sameDay(r, now)) return { cls: "today", label: "Aujourd'hui" };
  return { cls: "soon", label: "À venir" };
}
function card(n) {
  const rs = remState(n);
  const photos = (n.media || []).filter((m) => m.kind === "photo"), audios = (n.media || []).filter((m) => m.kind === "audio");
  const el = h("article", { class: "note" + (rs?.cls === "late" ? " late" : "") + (n.done ? " done" : ""), id: "n-" + n.id },
    h("div", { class: "meta" }, h("time", { datetime: n.created_at }, fmt(ms(n.created_at))), (n.tags || []).map((t) => h("span", { class: "tag" }, t))),
    n.text ? h("p", { class: "text" }, n.text) : null,
    photos.length ? h("div", { class: "photos" }, photos.map((m) => { const u = state.urls.get(m.path); return u ? h("a", { href: u, target: "_blank", rel: "noopener" }, h("img", { src: u, alt: "Photo de la note", loading: "lazy" })) : h("a", {}, ""); })) : null,
    audios.map((m) => { const u = state.urls.get(m.path); return u ? h("audio", { controls: true, preload: "metadata", src: u }) : null; }),
    rs ? h("div", { class: "rem" }, h("span", { class: "bell", "aria-hidden": "true" }), h("time", {}, fmt(ms(n.remind_at))), h("span", { class: "pill " + rs.cls }, rs.label)) : null,
    h("div", { class: "acts" },
      rs && !n.done ? h("button", { type: "button", class: "act", onclick: () => patch(n, { done: true }) }, "Fait") : null,
      rs && n.done ? h("button", { type: "button", class: "act", onclick: () => patch(n, { done: false }) }, "Rouvrir") : null,
      rs && !n.done ? h("button", { type: "button", class: "act", onclick: () => snooze(n, "1h") }, "+1 h") : null,
      rs && !n.done ? h("button", { type: "button", class: "act", onclick: () => snooze(n, "demain") }, "Demain 9 h") : null,
      !rs ? h("button", { type: "button", class: "act", onclick: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); patch(n, { remind_at: d.toISOString(), done: false }); } }, "Rappel demain 9 h") : null,
      h("button", { type: "button", class: "act warn", onclick: (e) => removeNote(n, e.currentTarget) }, "Supprimer")));
  const b = el.querySelector(".bell"); if (b) b.innerHTML = BELL;
  return el;
}
function render() {
  const q = state.q.toLowerCase();
  let items = state.notes.filter((n) => (!state.filter || (n.tags || []).includes(state.filter)) && (!q || (n.text || "").toLowerCase().includes(q)));
  const open = state.notes.filter((n) => n.remind_at && !n.done);
  $("#cntR").textContent = open.length || "";
  $("#cntA").textContent = state.notes.length || "";
  if (state.view === "rem") {
    const o = items.filter((n) => n.remind_at && !n.done).sort((a, b) => ms(a.remind_at) - ms(b.remind_at));
    const d = items.filter((n) => n.remind_at && n.done).sort((a, b) => ms(b.remind_at) - ms(a.remind_at)).slice(0, 10);
    items = [...o, ...d];
  }
  $("#list").replaceChildren(...items.map(card));
  const e = $("#empty");
  e.hidden = items.length > 0;
  e.textContent = state.notes.length === 0 ? "Rien ici pour l'instant. Écris, dicte ou photographie, puis touche « Enregistrer »."
    : state.view === "rem" && !q && !state.filter ? "Aucun rappel en cours. Mets une date dans une note (« demain 14h », « jeudi ») pour en créer un."
    : "Aucune note ne correspond.";
  checkDue();
  if (state.focusId) { const el = document.getElementById("n-" + state.focusId); if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 2500); state.focusId = null; } }
}
function setView(v) {
  state.view = v;
  $("#tabRem").setAttribute("aria-selected", v === "rem" ? "true" : "false");
  $("#tabAll").setAttribute("aria-selected", v === "all" ? "true" : "false");
  render();
}
$("#tabRem").onclick = () => setView("rem");
$("#tabAll").onclick = () => setView("all");
$("#search").addEventListener("input", (e) => { state.q = e.target.value; render(); });
document.addEventListener("pointerdown", () => { state.interacted = true; }, { once: true });

/* ---------- Due reminders while open ---------- */
function chime() {
  if (!state.interacted) return;
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.22].forEach((t, i) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = i ? 880 : 660; g.gain.setValueAtTime(0.0001, a.currentTime + t); g.gain.exponentialRampToValueAtTime(0.2, a.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t + 0.3); o.connect(g).connect(a.destination); o.start(a.currentTime + t); o.stop(a.currentTime + t + 0.32); });
  } catch (e) { /* no audio */ }
}
function checkDue() {
  const now = Date.now();
  const due = state.notes.filter((n) => n.remind_at && !n.done && ms(n.remind_at) <= now).sort((a, b) => ms(a.remind_at) - ms(b.remind_at));
  $("#dueBanner").hidden = !due.length;
  $("#dueTitle").textContent = due.length > 1 ? due.length + " rappels à traiter" : "Rappel à traiter";
  $("#dueList").replaceChildren(...due.slice(0, 4).map((n) => h("li", {}, (n.text || "Note avec média").split("\n")[0].slice(0, 80))));
  let fresh = false;
  for (const n of due) if (!state.alerted.has(n.id)) { state.alerted.add(n.id); if (now - ms(n.remind_at) < 5 * 60000) fresh = true; }
  if (fresh) chime();
}
setInterval(checkDue, 20000);

/* ---------- Push notifications ---------- */
function b64ToBytes(b64) {
  const p = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function pushStatus() {
  const st = $("#pushState"), btn = $("#pushBtn"), test = $("#pushTest");
  $("#installHint").hidden = !(isIOS() && !isStandalone());
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    st.textContent = isIOS() && !isStandalone() ? "Installe d'abord Notz sur l'écran d'accueil." : "Ce navigateur ne gère pas les notifications.";
    btn.hidden = true; test.hidden = true; return null;
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (Notification.permission === "denied") { st.textContent = "Bloquées. Réautorise-les dans les réglages de notifications de l'appareil, pour Notz."; btn.hidden = true; test.hidden = true; return null; }
  st.textContent = sub ? "Actives sur cet appareil." : "Désactivées sur cet appareil.";
  btn.hidden = !!sub; test.hidden = !sub;
  return sub;
}
async function enablePush() {
  const st = $("#pushState");
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { await pushStatus(); return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CFG.vapid) });
    const j = sub.toJSON();
    const { error } = await sb.from("notz_push_subs").upsert({ endpoint: j.endpoint, user_id: state.user.id, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 200) });
    if (error) throw error;
    try { localStorage.setItem("notz:push", "1"); } catch (e) { /* ignore */ }
    await pushStatus();
  } catch (e) { st.textContent = "L'activation a échoué. Réessaie."; }
}
async function syncPushSub() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const j = sub.toJSON();
    await sb.from("notz_push_subs").upsert({ endpoint: j.endpoint, user_id: state.user.id, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 200) });
  } catch (e) { /* best effort */ }
}
function maybeNudgePush() {
  let asked = false; try { asked = localStorage.getItem("notz:push") === "1"; } catch (e) { /* ignore */ }
  if (asked || !("Notification" in window) || Notification.permission !== "default") return;
  say("Rappel enregistré. Active les notifications dans les réglages pour être prévenu app fermée.");
}
$("#pushBtn").onclick = enablePush;
$("#pushTest").onclick = async () => {
  const st = $("#pushState"); st.textContent = "Envoi d'une notification de test…";
  const { data, error } = await sb.functions.invoke("notz-push", { body: { test: true } });
  st.textContent = error ? "Le test a échoué." : data?.sent ? "Notification envoyée. Elle doit arriver dans quelques secondes." : "Aucun appareil abonné. Touche « Activer sur cet appareil ».";
};

/* ---------- Settings ---------- */
$("#settingsBtn").onclick = async () => {
  const v = $("#settingsView"); v.hidden = !v.hidden;
  if (!v.hidden) { $("#whoami").textContent = state.user?.email || ""; await pushStatus(); v.scrollIntoView({ behavior: "smooth" }); }
};
$("#closeSettings").onclick = () => { $("#settingsView").hidden = true; };
$("#logoutBtn").onclick = async () => {
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) { await sb.from("notz_push_subs").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); } } catch (e) { /* ignore */ }
  try { localStorage.removeItem("notz:notes"); localStorage.removeItem("notz:push"); } catch (e) { /* ignore */ }
  await sb.auth.signOut();
};

/* ---------- Boot ---------- */
function showMain() {
  $("#authView").hidden = true; $("#mainView").hidden = false; $("#settingsBtn").hidden = false;
}
async function onSession(session) {
  if (!session) { state.user = null; state.notes = []; if (state.channel) { sb.removeChannel(state.channel); state.channel = null; } await showAuth(); return; }
  if (state.user && state.user.id === session.user.id) return;
  state.user = session.user;
  showMain();
  state.notes = cachedNotes(); render();
  await loadNotes();
  subscribe();
  syncPushSub();
}
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.type === "open-note" && e.data.noteId) { state.focusId = e.data.noteId; setView("rem"); } });
}
if (location.hash.startsWith("#n-")) state.focusId = location.hash.slice(3);
document.addEventListener("visibilitychange", () => { if (!document.hidden && state.user) loadNotes(); });
window.addEventListener("online", () => { if (state.user) loadNotes(); });
renderTagChips();
sb.auth.onAuthStateChange((_evt, session) => { setTimeout(() => onSession(session), 0); });
sb.auth.getSession().then(({ data }) => onSession(data.session));
