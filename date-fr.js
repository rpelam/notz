/* Notz — detects a reminder date/time in a French (or mixed) note. Returns a Date or null. */
(function (root) {
  "use strict";
  const WD = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const WD_EN = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const MO = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
  // Words that mean "this note is something to do at a given time"
  const KEY = /\b(rappel\w*|penser|pense|oublie\w*|relance\w*|appel\w*|telephone\w*|call|rdv|rendez-vous|reunion|meeting|rencontre\w*|livraison|livrer|commande\w*|payer|paie\w*|envoye\w*|passer|voir|chercher|recuperer|rendre|deposer|ramasser|acheter|reserver|confirmer|faire)\b/;

  function norm(raw) {
    return raw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’`]/g, "'").replace(/\s+/g, " ");
  }

  function findTime(t) {
    let m;
    // 10am, 10 am, 10:30pm, 10h30 pm, 10 a.m.
    if ((m = t.match(/\b(\d{1,2})(?:\s*[:h]\s*(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/))) {
      let hh = +m[1] % 12; if (m[3][0] === "p") hh += 12;
      if (+m[1] <= 12) return { hh, mm: m[2] ? +m[2] : 0, strong: true };
    }
    // 10 heures du matin / 3 heures de l'apres-midi / 8 heures du soir
    if ((m = t.match(/\b(\d{1,2})\s*heures?(?:\s*(\d{2}))?(\s*(?:du matin|de l'apres-midi|de l'apres midi|du soir))?/))) {
      let hh = +m[1]; const tail = m[3] || "";
      if (/apres|soir/.test(tail) && hh < 12) hh += 12;
      if (hh < 24) return { hh, mm: m[2] ? +m[2] : 0, strong: true };
    }
    // a 10h, 10h30, 14 h
    if ((m = t.match(/(\ba\s+|\bvers\s+|\bdes\s+)?\b(\d{1,2})\s*h\s*(\d{2})?(?![a-z])/))) {
      if (+m[2] < 24) return { hh: +m[2], mm: m[3] ? +m[3] : 0, strong: !!m[1] };
    }
    // 10:30
    if ((m = t.match(/(\ba\s+)?\b(\d{1,2}):(\d{2})\b/)) && +m[2] < 24) return { hh: +m[2], mm: +m[3], strong: true };
    if (/\ba midi\b|\bmidi\b/.test(t)) return { hh: 12, mm: 0, strong: true };
    if (/\bminuit\b/.test(t)) return { hh: 23, mm: 59, strong: true };
    return null;
  }

  function parseFr(raw, now) {
    now = now || new Date();
    if (!raw || !raw.trim()) return null;
    const t = norm(raw);
    let m;
    // dans 20 minutes / dans 2 heures / dans 3 jours / dans une semaine
    if ((m = t.match(/\bdans\s+(\d+|un|une|deux|trois)\s*(minutes?|mins?|heures?|h|jours?|semaines?)\b/))) {
      const words = { un: 1, une: 1, deux: 2, trois: 3 };
      const n = words[m[1]] || +m[1], u = m[2][0], d = new Date(now);
      if (u === "m") d.setMinutes(d.getMinutes() + n); else if (u === "h") d.setHours(d.getHours() + n);
      else if (u === "j") d.setDate(d.getDate() + n); else d.setDate(d.getDate() + 7 * n);
      d.setSeconds(0, 0);
      return d;
    }
    const base = new Date(now); base.setSeconds(0, 0);
    let day = null, defH = 9;
    if (/apres-demain|apres demain/.test(t)) { day = new Date(base); day.setDate(day.getDate() + 2); }
    else if (/\bdemain\b|\btomorrow\b/.test(t)) { day = new Date(base); day.setDate(day.getDate() + 1); }
    else if (/\bce soir\b|\btonight\b/.test(t)) { day = new Date(base); defH = 19; }
    else if (/\bcet apres-midi\b|\bcet aprem\b/.test(t)) { day = new Date(base); defH = 14; }
    else if (/\bce matin\b|\baujourd'hui\b|\baujourd hui\b|\btoday\b/.test(t)) { day = new Date(base); }
    if (!day) {
      for (let i = 0; i < 7; i++) {
        if (new RegExp("\\b(" + WD[i] + "|" + WD_EN[i] + ")\\b").test(t)) {
          let diff = (i - base.getDay() + 7) % 7; if (diff === 0) diff = 7;
          day = new Date(base); day.setDate(day.getDate() + diff); break;
        }
      }
    }
    if (!day && (m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)) && +m[2] >= 1 && +m[2] <= 12) {
      const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : base.getFullYear();
      day = new Date(y, +m[2] - 1, +m[1]); if (!m[3] && day < new Date(base.toDateString())) day.setFullYear(y + 1);
    }
    if (!day && (m = t.match(new RegExp("\\b(\\d{1,2})(?:er)?\\s+(" + MO.join("|") + ")\\b")))) {
      const y = base.getFullYear(); day = new Date(y, MO.indexOf(m[2]), +m[1]); if (day < new Date(base.toDateString())) day.setFullYear(y + 1);
    }
    if (day && /\bsoir\b/.test(t)) defH = 19;
    if (day && /apres-midi|apres midi|aprem/.test(t)) defH = 14;

    const tm = findTime(t);
    if (!day && !tm) return null;
    // A time alone (no day) counts only if it is clearly a moment, not a duration like "cuire 3h"
    if (!day && !tm.strong && !KEY.test(t)) return null;
    if (!day) {
      const d = new Date(base); d.setHours(tm.hh, tm.mm, 0, 0);
      if (d <= now) d.setDate(d.getDate() + 1);
      return d;
    }
    day.setHours(tm ? tm.hh : defH, tm ? tm.mm : 0, 0, 0);
    return day;
  }

  root.parseFr = parseFr;
  if (typeof module !== "undefined") module.exports = { parseFr };
})(typeof window !== "undefined" ? window : globalThis);
