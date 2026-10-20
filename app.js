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
  user: null, notes: [], view: "rem", q: "", urls: new Map(), channel: null,
  alerted: new Set(), interacted: false, focusId: null, setupMode: false
};
let ed = null; // editor state
let rec = null; // recorder state

/* ---------- helpers ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : String(k));
  return el;
}
const pad = (n) => String(n).padStart(2, "0");
const ms = (v) => (v == null ? null : +new Date(v));
const toLocalInput = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const hm = (t) => { const d = new Date(t); return `${d.getHours()} h ${pad(d.getMinutes())}`; };
function when(t) {
  const d = new Date(t), now = new Date();
  const tom = new Date(now); tom.setDate(tom.getDate() + 1);
  const yes = new Date(now); yes.setDate(yes.getDate() - 1);
  if (sameDay(d, now)) return "Aujourd'hui, " + hm(d);
  if (sameDay(d, tom)) return "Demain, " + hm(d);
  if (sameDay(d, yes)) return "Hier, " + hm(d);
  const diff = (d - now) / 86400000;
  if (diff > 0 && diff < 6) return d.toLocaleDateString("fr-CA", { weekday: "long" }).replace(/^./, (c) => c.toUpperCase()) + ", " + hm(d);
  return d.toLocaleDateString("fr-CA", { weekday: "short", day: "numeric", month: "short" }).replace(/^./, (c) => c.toUpperCase()) + ", " + hm(d);
}
function created(t) {
  const d = new Date(t), now = new Date();
  if (sameDay(d, now)) return hm(d);
  const yes = new Date(now); yes.setDate(yes.getDate() - 1);
  if (sameDay(d, yes)) return "Hier";
  return d.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
}
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const ICON = {
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5"/></svg>',
  photo: '<svg viewBox="0 0 24 24"><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.6l1.6-2.2h6.6L16.9 7h2.6A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/><circle cx="12" cy="12.8" r="3.6"/></svg>'
};
function setStatus(text, bad) { const s = $("#status"); s.textContent = text || ""; s.classList.toggle("bad", !!bad); }
function cacheNotes() { try { localStorage.setItem("notz:notes", JSON.stringify(state.notes.slice(0, 300))); } catch (e) { /* ignore */ } }
function cachedNotes() { try { return JSON.parse(localStorage.getItem("notz:notes") || "[]"); } catch (e) { return []; } }
function titleOf(n) {
  const lines = (n.text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length) return { title: lines[0], rest: lines.slice(1).join(" "), plain: false };
  const m = n.media || [];
  if (m.some((x) => x.kind === "audio")) return { title: "Note vocale", rest: "", plain: true };
  if (m.some((x) => x.kind === "photo")) return { title: "Photo", rest: "", plain: true };
  return { title: "Note vide", rest: "", plain: true };
}

/* Keep full-screen sheets above the iOS keyboard */
function fitViewport() {
  const vv = window.visualViewport;
  const hgt = vv ? vv.height : window.innerHeight;
  document.documentElement.style.setProperty("--vvh", hgt + "px");
  document.body.classList.toggle("keyboard-open", vv ? vv.height < window.innerHeight - 120 : false);
  for (const s of document.querySelectorAll(".sheet")) s.style.transform = vv && vv.offsetTop ? `translateY(${vv.offsetTop}px)` : "";
}
if (window.visualViewport) { visualViewport.addEventListener("resize", fitViewport); visualViewport.addEventListener("scroll", fitViewport); }
window.addEventListener("resize", fitViewport);
fitViewport();

/* ---------- Auth ---------- */
async function showAuth() {
  for (const id of ["#homeView", "#toolbar", "#editor", "#settings"]) $(id).hidden = true;
  $("#authView").hidden = false;
  let configured = true;
  try { const { data } = await sb.functions.invoke("notz-setup", { body: { check: true } }); configured = !!data?.configured; } catch (e) { /* offline */ }
  state.setupMode = !configured;
  $("#authTitle").textContent = configured ? "Notz" : "Bienvenue dans Notz";
  $("#authIntro").textContent = configured ? "Connecte-toi une fois sur cet appareil. Notz reste ensuite ouvert." : "Crée ton compte. Il sera le seul à pouvoir utiliser Notz.";
  $("#confirmWrap").hidden = configured;
  $("#authPass").autocomplete = configured ? "current-password" : "new-password";
  $("#authBtn").textContent = configured ? "Se connecter" : "Créer mon compte";
}
$("#authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#authEmail").value.trim(), pass = $("#authPass").value, msg = $("#authMsg");
  if (!email || pass.length < 8) { msg.textContent = "Entre ton courriel et un mot de passe d'au moins 8 caractères."; return; }
  if (state.setupMode && pass !== $("#authPass2").value) { msg.textContent = "Les deux mots de passe ne sont pas identiques."; return; }
  $("#authBtn").disabled = true; msg.textContent = "";
  try {
    if (state.setupMode) {
      const { data, error } = await sb.functions.invoke("notz-setup", { body: { email, password: pass } });
      if (error || !data?.ok) throw new Error("setup");
    }
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
  } catch (err) {
    msg.textContent = state.setupMode ? "La création du compte a échoué. Vérifie ta connexion et réessaie." : "Courriel ou mot de passe incorrect.";
  } finally { $("#authBtn").disabled = false; }
});

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
  if (error) { setStatus("Modification non enregistrée", true); return null; }
  upsertLocal(row); return row;
}

/* ---------- List ---------- */
function remState(n, now = Date.now()) {
  const r = ms(n.remind_at);
  if (r == null) return null;
  if (n.done) return "done";
  if (r <= now) return "late";
  if (sameDay(r, now)) return "today";
  return "soon";
}
function row(n) {
  const rs = remState(n);
  const { title, rest, plain } = titleOf(n);
  const photo = (n.media || []).find((m) => m.kind === "photo");
  const hasAudio = (n.media || []).some((m) => m.kind === "audio");
  const sub = h("div", { class: "row-sub" });
  if (rs) sub.append(h("span", { class: "when " + (rs === "late" ? "late" : rs === "today" ? "today" : "") }, when(ms(n.remind_at))));
  else sub.append(h("span", { class: "when" }, created(n.created_at)));
  if (rest) sub.append(h("span", { class: "snippet" }, rest));
  else if ((n.tags || []).length) sub.append(h("span", { class: "snippet" }, n.tags.join(" · ")));
  const el = h("div", { class: "row" + (n.done ? " done" : ""), id: "n-" + n.id, role: "button", tabindex: "0" },
    rs ? h("button", { type: "button", class: "check-hit", "aria-label": n.done ? "Rouvrir le rappel" : "Marquer comme fait", onclick: (e) => { e.stopPropagation(); patch(n, { done: !n.done }); } }, h("span", { class: "check" + (n.done ? " on" : "") })) : null,
    h("div", { class: "row-main" },
      h("div", { class: "row-text" }, h("div", { class: "row-title" + (plain ? " plain" : "") }, title), sub),
      hasAudio && !photo ? h("span", { class: "row-icon", html: ICON.mic }) : null,
      photo && state.urls.get(photo.path) ? h("img", { class: "row-thumb", src: state.urls.get(photo.path), alt: "", loading: "lazy" }) : null));
  el.addEventListener("click", () => openEditor(n));
  el.addEventListener("keydown", (e) => { if (e.key === "Enter") openEditor(n); });
  return el;
}
function section(title, items, cls, count) {
  if (!items.length) return [];
  return [h("h2", { class: "section-title" + (cls ? " " + cls : "") }, title, count ? h("small", {}, String(items.length)) : null), h("div", { class: "group" }, items.map(row))];
}
function render() {
  if (!state.user) return;
  const q = state.q.trim().toLowerCase();
  const match = (n) => !q || (n.text || "").toLowerCase().includes(q) || (n.tags || []).some((t) => t.toLowerCase().includes(q));
  const notes = state.notes.filter(match);
  const open = state.notes.filter((n) => n.remind_at && !n.done);
  $("#countLabel").textContent = state.notes.length ? (state.notes.length === 1 ? "1 note" : state.notes.length + " notes") : "";
  $("#tabRem").textContent = open.length ? `Rappels (${open.length})` : "Rappels";
  const parts = [];
  if (state.view === "rem") {
    const now = Date.now();
    const o = notes.filter((n) => n.remind_at && !n.done).sort((a, b) => ms(a.remind_at) - ms(b.remind_at));
    parts.push(...section("En retard", o.filter((n) => ms(n.remind_at) <= now), "red", true));
    parts.push(...section("Aujourd'hui", o.filter((n) => ms(n.remind_at) > now && sameDay(ms(n.remind_at), now))));
    parts.push(...section("Plus tard", o.filter((n) => ms(n.remind_at) > now && !sameDay(ms(n.remind_at), now))));
    parts.push(...section("Faits", notes.filter((n) => n.remind_at && n.done).sort((a, b) => ms(b.remind_at) - ms(a.remind_at)).slice(0, 15)));
  } else {
    const now = new Date(); const yes = new Date(now); yes.setDate(yes.getDate() - 1);
    const wk = new Date(now); wk.setDate(wk.getDate() - 7);
    parts.push(...section("Aujourd'hui", notes.filter((n) => sameDay(ms(n.created_at), now))));
    parts.push(...section("Hier", notes.filter((n) => sameDay(ms(n.created_at), yes))));
    parts.push(...section("7 derniers jours", notes.filter((n) => ms(n.created_at) < +yes && !sameDay(ms(n.created_at), yes) && ms(n.created_at) >= +wk)));
    parts.push(...section("Plus ancien", notes.filter((n) => ms(n.created_at) < +wk)));
  }
  $("#list").replaceChildren(...parts);
  const empty = !parts.length;
  $("#empty").hidden = !empty;
  if (empty) {
    $("#emptyText").innerHTML = q ? "Aucune note ne correspond à ta recherche."
      : state.notes.length === 0 ? "Aucune note pour l'instant.<br><br>Touche le <b>crayon</b> en bas à droite pour écrire, le <b>micro</b> pour un vocal, l'<b>appareil photo</b> pour une photo."
      : state.view === "rem" ? "Aucun rappel en cours.<br><br>Écris une heure dans une note, par exemple « appel fournisseur jeudi 10h », et le rappel se crée tout seul."
      : "Aucune note.";
  }
  checkDue();
  if (state.focusId) {
    const el = document.getElementById("n-" + state.focusId);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("flash"); const n = state.notes.find((x) => x.id === state.focusId); state.focusId = null; if (n) setTimeout(() => openEditor(n), 400); }
  }
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
  const due = state.notes.filter((n) => n.remind_at && !n.done && ms(n.remind_at) <= now);
  $("#dueBanner").hidden = !due.length || state.view === "rem";
  $("#dueText").textContent = due.length > 1 ? `${due.length} rappels en retard` : "1 rappel en retard";
  let fresh = false;
  for (const n of due) if (!state.alerted.has(n.id)) { state.alerted.add(n.id); if (now - ms(n.remind_at) < 5 * 60000) fresh = true; }
  if (fresh) chime();
}
$("#dueBanner").onclick = () => setView("rem");
setInterval(() => { if (state.user && $("#editor").hidden) render(); }, 30000);

/* ---------- Editor ---------- */
function openSheet(el) { el.hidden = false; el.classList.remove("opening"); void el.offsetWidth; el.classList.add("opening"); fitViewport(); }
function closeSheet(el) { el.hidden = true; }

function openEditor(note, opts = {}) {
  ed = {
    note: note || null, id: note ? note.id : uuid(),
    pending: [], removed: [], tags: new Set(note?.tags || []),
    remindAt: note ? ms(note.remind_at) : null, remindSrc: "", remindManual: false, saving: false
  };
  $("#edTitle").textContent = note ? "Note" : "Nouvelle note";
  $("#edText").value = note ? note.text || "" : "";
  $("#edMsg").textContent = ""; $("#edMsg").classList.remove("err");
  $("#edDanger").hidden = !note;
  renderEditor();
  openSheet($("#editor"));
  if (opts.voice) { startRec(); return; }
  if (opts.photo) { $("#photoInput").click(); return; }
  if (!note) $("#edText").focus(); // opening the keyboard must happen inside the tap
}
function renderEditor() {
  // reminder chip
  const r = ed.remindAt;
  $("#edRemind").hidden = r == null;
  if (r != null) { $("#edRemindLabel").textContent = when(r); $("#edRemindAt").value = toLocalInput(r); }
  $("#edRemindSrc").textContent = ed.remindSrc;
  $("#accRemind").classList.toggle("on", r != null);
  // media
  const box = $("#edMedia"); box.replaceChildren();
  const existing = (ed.note?.media || []).filter((m) => !ed.removed.includes(m.path));
  const photos = [
    ...existing.filter((m) => m.kind === "photo").map((m) => ({ src: state.urls.get(m.path), href: state.urls.get(m.path), drop: () => { ed.removed.push(m.path); renderEditor(); } })),
    ...ed.pending.filter((p) => p.kind === "photo").map((p) => ({ src: p.preview, drop: () => { ed.pending.splice(ed.pending.indexOf(p), 1); renderEditor(); } }))
  ];
  if (photos.length) box.append(h("div", { class: "ed-photos" }, photos.map((p) => h("div", { class: "ph" },
    p.href ? h("a", { href: p.href, target: "_blank", rel: "noopener" }, h("img", { src: p.src || "", alt: "Photo" })) : h("img", { src: p.src || "", alt: "Photo" }),
    h("button", { type: "button", class: "x-btn", "aria-label": "Retirer la photo", onclick: p.drop }, "×")))));
  const audios = [
    ...existing.filter((m) => m.kind === "audio").map((m) => ({ src: state.urls.get(m.path), drop: () => { ed.removed.push(m.path); renderEditor(); } })),
    ...ed.pending.filter((p) => p.kind === "audio").map((p) => ({ src: p.preview, drop: () => { ed.pending.splice(ed.pending.indexOf(p), 1); renderEditor(); } }))
  ];
  for (const a of audios) box.append(h("div", { class: "au" }, h("audio", { controls: true, preload: "metadata", src: a.src || "" }), h("button", { type: "button", class: "x-btn", "aria-label": "Retirer le vocal", onclick: a.drop }, "×")));
  // tags
  $("#edTags").replaceChildren(...TAGS.map((t) => h("button", { type: "button", class: "tag", "aria-pressed": ed.tags.has(t) ? "true" : "false", onclick: () => { ed.tags.has(t) ? ed.tags.delete(t) : ed.tags.add(t); renderEditor(); } }, t)));
  // done toggle
  if (ed.note) { $("#edDone").hidden = !ed.note.remind_at; $("#edDone").textContent = ed.note.done ? "Rouvrir le rappel" : "Marquer le rappel comme fait"; }
}
let detectTimer;
$("#edText").addEventListener("input", () => {
  clearTimeout(detectTimer);
  detectTimer = setTimeout(() => {
    if (!ed || ed.remindManual) return;
    const d = parseFr($("#edText").value);
    if (d) { ed.remindAt = +d; ed.remindSrc = "lu dans ta note"; }
    else if (ed.remindSrc) { ed.remindAt = null; ed.remindSrc = ""; }
    renderEditor();
  }, 250);
});
$("#edRemindAt").addEventListener("change", (e) => { if (!e.target.value) return; ed.remindAt = +new Date(e.target.value); ed.remindManual = true; ed.remindSrc = ""; renderEditor(); });
$("#edRemindClear").onclick = () => { ed.remindAt = null; ed.remindManual = true; ed.remindSrc = ""; renderEditor(); };
$("#accRemind").onclick = () => {
  if (ed.remindAt == null) { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); ed.remindAt = +d; ed.remindManual = true; ed.remindSrc = "touche la date pour la changer"; renderEditor(); }
  const inp = $("#edRemindAt");
  try { inp.showPicker ? inp.showPicker() : inp.focus(); } catch (e) { inp.focus(); }
};
$("#accPhoto").onclick = () => $("#photoInput").click();
$("#accVoice").onclick = () => { state.interacted = true; rec ? stopRec() : startRec(); };
$("#edCancel").onclick = () => {
  if (rec) stopRec(true);
  ed.pending.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
  ed = null; closeSheet($("#editor"));
};
$("#edDone").onclick = async () => { const n = ed.note; const r = await patch(n, { done: !n.done }); if (r) { ed = null; closeSheet($("#editor")); } };
$("#edDelete").onclick = async (e) => {
  const btn = e.currentTarget;
  if (btn.dataset.armed !== "1") { btn.dataset.armed = "1"; btn.textContent = "Toucher encore pour supprimer définitivement"; setTimeout(() => { btn.dataset.armed = ""; btn.textContent = "Supprimer la note"; }, 4000); return; }
  const n = ed.note;
  const { error } = await sb.from("notz_notes").delete().eq("id", n.id);
  if (error) { edSay("Suppression impossible. Vérifie ta connexion.", true); return; }
  const paths = (n.media || []).map((m) => m.path);
  if (paths.length) sb.storage.from(CFG.bucket).remove(paths).catch(() => {});
  state.notes = state.notes.filter((x) => x.id !== n.id); cacheNotes(); render();
  btn.dataset.armed = ""; btn.textContent = "Supprimer la note";
  ed = null; closeSheet($("#editor"));
};
function edSay(t, err) { const m = $("#edMsg"); m.textContent = t || ""; m.classList.toggle("err", !!err); }

/* Photos */
async function shrinkImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return (await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82))) || file;
  } catch (e) { return file; }
}
$("#photoInput").addEventListener("change", async (e) => {
  const files = [...e.target.files]; e.target.value = "";
  if (!ed) return;
  for (const f of files) { const blob = await shrinkImage(f); ed.pending.push({ kind: "photo", blob, preview: URL.createObjectURL(blob) }); }
  renderEditor();
});

/* Voice */
function pickMime() {
  for (const t of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"]) if (window.MediaRecorder?.isTypeSupported?.(t)) return t;
  return "";
}
async function startRec() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { edSay("L'enregistrement vocal n'est pas disponible sur ce navigateur.", true); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { edSay("Notz n'a pas accès au micro. Autorise-le dans Réglages > Notz (ou Safari) sur ton appareil.", true); return; }
  const mime = pickMime();
  const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [], t0 = Date.now();
  r.ondataavailable = (ev) => { if (ev.data?.size) chunks.push(ev.data); };
  rec = { r, stream, chunks, t0, cancelled: false, timer: setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); $("#recTime").textContent = `${Math.floor(s / 60)}:${pad(s % 60)}`; if (s >= 600) stopRec(); }, 250) };
  r.onstop = () => {
    const cur = rec; rec = null;
    clearInterval(cur.timer); cur.stream.getTracks().forEach((t) => t.stop());
    $("#recBar").hidden = true; $("#accVoice").classList.remove("on");
    if (cur.cancelled || !cur.chunks.length || !ed) return;
    const type = (r.mimeType || mime || "audio/mp4").split(";")[0];
    const blob = new Blob(cur.chunks, { type });
    ed.pending.push({ kind: "audio", blob, preview: URL.createObjectURL(blob), duration: Math.max(1, Math.round((Date.now() - cur.t0) / 1000)) });
    renderEditor();
  };
  r.start(1000);
  $("#recTime").textContent = "0:00"; $("#recBar").hidden = false; $("#accVoice").classList.add("on");
  edSay("");
}
function stopRec(cancel) { if (!rec) return; rec.cancelled = !!cancel; try { rec.r.stop(); } catch (e) { /* stopped */ } }
$("#recStop").onclick = () => stopRec();
$("#recCancel").onclick = () => stopRec(true);

/* Save */
const extOf = (type) => ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "audio/mp4": "m4a", "audio/webm": "webm", "audio/ogg": "ogg" }[type] || "bin");
$("#edSave").onclick = async () => {
  if (!ed || ed.saving) return;
  if (rec) { stopRec(); await new Promise((r) => setTimeout(r, 300)); }
  const text = $("#edText").value.trim();
  const keptMedia = (ed.note?.media || []).filter((m) => !ed.removed.includes(m.path));
  if (!text && !ed.pending.length && !keptMedia.length) {
    if (ed.note) { edSay("La note est vide. Utilise « Supprimer la note » pour l'effacer.", true); return; }
    ed = null; closeSheet($("#editor")); return; // nothing written: just close, like Notes
  }
  ed.saving = true; $("#edSave").disabled = true;
  const uploaded = [];
  try {
    const media = [...keptMedia];
    let i = (ed.note?.media || []).length;
    for (const p of ed.pending) {
      const type = (p.blob.type || (p.kind === "photo" ? "image/jpeg" : "audio/mp4")).split(";")[0];
      const path = `${state.user.id}/${ed.id}/${++i}-${Date.now().toString(36)}.${extOf(type)}`;
      edSay(p.kind === "photo" ? "Envoi de la photo…" : "Envoi du vocal…");
      const { error } = await sb.storage.from(CFG.bucket).upload(path, p.blob, { contentType: type, upsert: false });
      if (error) throw error;
      uploaded.push(path);
      state.urls.set(path, p.preview);
      media.push({ path, kind: p.kind, type, duration: p.duration || null });
    }
    const fields = { text, media, tags: [...ed.tags], remind_at: ed.remindAt == null ? null : new Date(ed.remindAt).toISOString() };
    let row;
    if (ed.note) {
      if (ms(ed.note.remind_at) !== ed.remindAt) fields.done = false;
      const { data, error } = await sb.from("notz_notes").update(fields).eq("id", ed.note.id).select().single();
      if (error) throw error; row = data;
      if (ed.removed.length) sb.storage.from(CFG.bucket).remove(ed.removed).catch(() => {});
    } else {
      const { data, error } = await sb.from("notz_notes").insert({ id: ed.id, user_id: state.user.id, ...fields }).select().single();
      if (error) throw error; row = data;
    }
    const hadReminder = fields.remind_at != null;
    upsertLocal(row);
    ed = null; closeSheet($("#editor"));
    signMedia().then(render);
    if (hadReminder) { if (state.view !== "rem") setView("rem"); maybeNudgePush(); }
  } catch (e) {
    if (uploaded.length) sb.storage.from(CFG.bucket).remove(uploaded).catch(() => {});
    edSay(navigator.onLine === false ? "Pas de réseau. Ta note est toujours là : touche OK dès que tu as du signal." : "L'enregistrement a échoué. Ta note est toujours là, réessaie.", true);
  } finally {
    if (ed) ed.saving = false;
    $("#edSave").disabled = false;
  }
};

/* Toolbar shortcuts */
$("#composeBtn").onclick = () => { state.interacted = true; openEditor(null); };
$("#quickVoice").onclick = () => { state.interacted = true; openEditor(null, { voice: true }); };
$("#quickPhoto").onclick = () => { state.interacted = true; openEditor(null, { photo: true }); };

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
    st.textContent = isIOS() && !isStandalone() ? "App non installée" : "Non disponibles";
    btn.hidden = true; test.hidden = true; return null;
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (Notification.permission === "denied") { st.textContent = "Bloquées"; btn.hidden = true; test.hidden = true; $("#installHint").hidden = false; $("#installHint").textContent = "Les notifications sont bloquées. Réautorise-les dans Réglages > Notifications > Notz sur ton appareil."; return null; }
  st.textContent = sub ? "Activées" : "Désactivées";
  btn.hidden = !!sub; test.hidden = !sub;
  return sub;
}
async function saveSub(sub) {
  const j = sub.toJSON();
  return sb.from("notz_push_subs").upsert({ endpoint: j.endpoint, user_id: state.user.id, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 200) });
}
async function enablePush() {
  const st = $("#pushState");
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { await pushStatus(); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CFG.vapid) }));
    const { error } = await saveSub(sub);
    if (error) throw error;
    try { localStorage.setItem("notz:push", "1"); } catch (e) { /* ignore */ }
    await pushStatus();
  } catch (e) { st.textContent = "Échec, réessaie"; }
}
async function syncPushSub() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) await saveSub(sub);
  } catch (e) { /* best effort */ }
}
function maybeNudgePush() {
  let asked = false; try { asked = localStorage.getItem("notz:push") === "1"; } catch (e) { /* ignore */ }
  if (asked || !("Notification" in window) || Notification.permission !== "default") return;
  setStatus("Active les notifications dans ••• pour être prévenu");
}
$("#pushBtn").onclick = enablePush;
$("#pushTest").onclick = async () => {
  const st = $("#pushState"); st.textContent = "Envoi…";
  const { data, error } = await sb.functions.invoke("notz-push", { body: { test: true } });
  st.textContent = error ? "Échec du test" : data?.sent ? "Envoyée" : "Aucun appareil";
};

/* ---------- Settings ---------- */
$("#settingsBtn").onclick = async () => { $("#whoami").textContent = state.user?.email || ""; openSheet($("#settings")); await pushStatus(); };
$("#setClose").onclick = () => closeSheet($("#settings"));
$("#logoutBtn").onclick = async () => {
  try { const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription(); if (sub) { await sb.from("notz_push_subs").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); } } catch (e) { /* ignore */ }
  try { localStorage.removeItem("notz:notes"); localStorage.removeItem("notz:push"); } catch (e) { /* ignore */ }
  closeSheet($("#settings"));
  await sb.auth.signOut();
};

/* ---------- Boot ---------- */
async function onSession(session) {
  if (!session) {
    state.user = null; state.notes = [];
    if (state.channel) { sb.removeChannel(state.channel); state.channel = null; }
    await showAuth(); return;
  }
  if (state.user && state.user.id === session.user.id) return;
  state.user = session.user;
  $("#authView").hidden = true; $("#homeView").hidden = false; $("#toolbar").hidden = false;
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
document.addEventListener("visibilitychange", () => { if (!document.hidden && state.user && $("#editor").hidden) loadNotes(); });
window.addEventListener("online", () => { if (state.user) loadNotes(); });
sb.auth.onAuthStateChange((_evt, session) => { setTimeout(() => onSession(session), 0); });
sb.auth.getSession().then(({ data }) => onSession(data.session));
