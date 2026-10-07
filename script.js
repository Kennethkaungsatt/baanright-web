/* ============================================================
   BaanRight website — everything the Chrome extension does,
   plus web-only extras (demo posts, share, CSV/photo downloads
   via anchors, theme toggle, drafts, install prompt, PWA).
   ============================================================ */

const MYMEMORY_URL = "https://api.mymemory.translated.net/get";

const LANDMARKS = [
  { keywords: ["ฟ้าไทย", "fah thai", "ตลาดฟ้าไทย"], name: "Fah Thai market area", approxNote: "~5\u20138 min / 3\u20133.5 km from MFU (typical for this area)" }
];

const REPLY_TEMPLATES = [
  { id: "avail", en: "Hi, is this room still available?" },
  { id: "view", en: "Can I schedule a viewing this weekend?" },
  { id: "deposit", en: "Is the deposit negotiable?" },
  { id: "utilities", en: "What utilities are included in the price?" },
  { id: "foreigner", en: "Do you accept international students as tenants?" }
];

// Sample posts for the "Load a demo post" button (cycled).
const DEMOS = [
  `ห้องให้เช่า ซอยแม่จันใต้ 3 ใกล้มหาวิทยาลัยแม่ฟ้าหลวง
ค่าเช่า 6000 บาท/เดือน
ประกัน 1 เดือน
พื้นที่ใช้สอย 24 ตารางเมตร มีแอร์ ตู้เย็น ทีวี wifi
ห่างจากมหาวิทยาลัย 10 นาที
ห้องว่าง พร้อมเข้าอยู่
สนใจโทร 081-234-5678`,
  `บ้านให้เช่า ใกล้ตลาดฟ้าไทย เฟอร์นิเจอร์ครบ ใหม่เอี่ยม
ค่าเช่า 4,500 บาท/เดือน
ประกัน 2 เดือน
ทำเล : ซอยคุณหญิงสุชาดา หลัง ม.แม่ฟ้าหลวง
ห่าง มอ 5นาที https://maps.app.goo.gl/demoMapLink
ว่างให้เช่า Tel 092-111-2233`
];
let demoIndex = 0;

// ---------- localStorage helpers (mirrors chrome.storage.local shape) ----------
function storageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn("storage set failed", err);
    toast("Browser storage is full \u2014 remove some photos", "error");
    return false;
  }
}

const els = {};
document.querySelectorAll("[id]").forEach((el) => (els[el.id] = el));

let currentMode = "text";
let lastResult = null;
let expandedSavedId = null;   // which saved item currently has details open
let savedQuery = "";
let shortlistOnly = false;
let photoTray = [];           // { id, src, selected } — photos waiting to be attached
let deferredInstallPrompt = null;

init();

function init() {
  document.getElementById("year").textContent = String(new Date().getFullYear());

  bindTabs();
  bindModeButtons();
  bindRun();
  bindSave();
  bindAlerts();
  bindReply();
  bindTheme();
  bindPhotos();
  bindSavedToolbar();
  bindShortcut();
  bindDraft();
  bindResultActions();
  bindHeroDemo();
  bindChrome(); // header, nav, reveals, install prompt, service worker

  applyTheme(loadTheme());

  // Load the existing photo tray FIRST so a paste below appends to it.
  photoTray = storageGet("photoTray", photoTray);

  // Restore the in-progress draft — a browser tab can close at any moment.
  const draft = storageGet("draft", null);
  if (draft && typeof draft === "object") {
    els.thaiText.value = draft.text || "";
    els.sourceLinkInput.value = draft.link || "";
    if (draft.result) {
      lastResult = draft.result;
      renderResult(lastResult);
    }
  }

  renderPhotoTray();
  renderSaved();
  renderAlerts();
  renderReplyOptions();
}

// ============================================================
// Toasts
// ============================================================
function toast(message, kind = "ok") {
  if (!els.toastWrap) return;
  const t = document.createElement("div");
  t.className = `toast ${kind === "error" ? "err" : ""}`;
  t.textContent = message;
  els.toastWrap.appendChild(t);
  const show = () => t.classList.add("show");
  requestAnimationFrame(show);
  setTimeout(show, 80); // fallback: rAF can be throttled while the page isn't visible
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 260);
  }, 2600);
}

// ============================================================
// Theme
// ============================================================
function loadTheme() {
  const theme = storageGet("theme", null);
  if (theme === "dark" || theme === "light") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (els.themeToggle) els.themeToggle.textContent = theme === "dark" ? "\u2600\uFE0F" : "\uD83C\uDF19";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0d1512" : "#04342c");
}

function bindTheme() {
  els.themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    storageSet("theme", next);
    toast(next === "dark" ? "Dark mode on" : "Light mode on");
  });
}

// ============================================================
// Tabs
// ============================================================
function bindTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });
}

function setActiveTab(name) {
  document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
  const panel = document.getElementById(`panel-${name}`);
  if (panel) panel.classList.remove("hidden");
  document.querySelectorAll(".tab").forEach((t) => {
    const active = t.dataset.tab === name;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", active);
  });
}

// ============================================================
// Input mode
// ============================================================
function bindModeButtons() {
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentMode = btn.dataset.mode;
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b === btn));
      els.thaiText.classList.toggle("hidden", currentMode !== "text");
      els.imageDrop.classList.toggle("hidden", currentMode !== "image");
    });
  });

  // OCR isn't wired up — block the picker and explain instead of failing silently.
  els.imageInput.addEventListener("click", (e) => {
    e.preventDefault();
    const msg = "Screenshot OCR isn't in this build \u2014 paste the post's text, or use + Add / paste for photos.";
    showStatus(els.runStatus, msg, "error");
    toast("Screenshot OCR isn't in this build yet", "error");
  });

  els.clearTextBtn.addEventListener("click", () => {
    els.thaiText.value = "";
    lastResult = null;
    els.result.classList.add("hidden");
    els.resultEmpty.classList.remove("hidden");
    showStatus(els.runStatus, "", "");
    showStatus(els.saveStatus, "", "");
    storageSet("draft", { text: "", link: els.sourceLinkInput.value, result: null });
    els.thaiText.focus();
    toast("Text cleared");
  });
}

// ============================================================
// Translation
// ============================================================
async function translateChunk(text, sourceLang, targetLang) {
  const params = new URLSearchParams({ q: text, langpair: `${sourceLang}|${targetLang}` });
  const res = await fetch(`${MYMEMORY_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`Translate request failed (${res.status})`);
  const data = await res.json();
  return data?.responseData?.translatedText || "";
}

function splitIntoChunks(text, maxBytes = 450) {
  const lines = text.split(/\n+/).filter(Boolean);
  const chunks = [];
  let current = "";
  const byteLen = (s) => new TextEncoder().encode(s).length;

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (byteLen(candidate) > maxBytes && current) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text];
}

async function translateLong(text, sourceLang, targetLang) {
  const chunks = splitIntoChunks(text);
  const results = [];
  for (const chunk of chunks) {
    results.push(await translateChunk(chunk, sourceLang, targetLang));
  }
  return results.join(" ");
}

// ============================================================
// Field extraction
// ============================================================
function extractPrice(text) {
  let m = text.match(/ค่าเช่า[:\s]*([\d,]{3,})\s*(บาท)?/);
  if (m) return `${m[1]} THB/month`;
  m = text.match(/([\d]{1,3}(?:,\d{3})+|\d{3,6})\s*(?:บาท)?\s*\/?\s*(?:เดือน)/);
  if (m) return `${m[1]} THB/month`;
  m = text.match(/(\d[\d,]{2,})\s*บาทเท่านั้น/);
  if (m) return `${m[1]} THB/month`;
  return null;
}

function extractDeposit(text) {
  let m = text.match(/ประกัน[:\s]*([\d]+)\s*(เดือน|บาท)/);
  if (m) return m[2] === "เดือน" ? `${m[1]} month(s) rent` : `${m[1]} THB`;
  m = text.match(/มัดจำ[:\s]*([\d]+)\s*(เดือน|บาท)?/);
  if (m) return m[2] === "บาท" ? `${m[1]} THB` : `${m[1]} month(s) rent (approx.)`;
  return null;
}

function extractPhone(text) {
  const matches = text.match(/0\d{1,2}[-\s]?\d{3}[-\s]?\d{3,4}/g);
  if (!matches) return null;
  const unique = [...new Set(matches.map((s) => s.trim()))];
  return unique.join(", ");
}

function extractLocation(text) {
  // Drop phone numbers / contact words that trail the location in listings,
  // e.g. "ซอยแม่จันใต้ 3 โทร 081-234-5678" → "ซอยแม่จันใต้ 3".
  const clean = (s) => (s || "")
    .replace(/\s+(?:โทร|เบอร์|tel|phone|call)\s*:?\s*\S*.*$/i, "")
    .replace(/\s+0\d{1,2}(?:[-\s]?\d{3}){1,2}.*$/, "")
    .trim();

  const patterns = [
    /ทำเล\s*[:：]\s*([^\n]+)/,
    /(ซอย[^\n,]+)/,
    /(พื้นที่ใช้สอย[^\n,]+)/,
    /(ห่างจาก[^\n,]+|ห่างมอ[^\n,]+|ใกล้[^\n,]+)/
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (!m) continue;
    const value = clean(m[1].replace("พื้นที่ใช้สอย", ""));
    if (value) return value;
  }
  return null;
}

function extractAvailability(text) {
  if (/พร้อมเข้าอยู่/.test(text)) return "Ready to move in";
  if (/ห้องว่าง|บ้านว่าง|ว่างให้เช่า/.test(text)) return "Available now";
  return null;
}

// ============================================================
// Distance detection
// ============================================================
function detectDistance(text) {
  const linkMatch = text.match(/https?:\/\/(?:maps\.app\.goo\.gl|g\.co\/kgs|goo\.gl\/maps|www\.google\.com\/maps)\S+/i);
  const kmNear = text.match(/([\d.]+)\s*(?:กม\.?|km)/i);
  if (linkMatch) {
    const kmPart = kmNear ? ` (\u2248${kmNear[1]} km)` : "";
    return { text: `Map link provided by landlord${kmPart}`, link: linkMatch[0] };
  }

  const stated = text.match(/(\d+)\s*(นาที|min)/i);
  if (stated) {
    return { text: `${stated[1]} min from MFU (stated in listing)`, link: null };
  }

  for (const landmark of LANDMARKS) {
    if (landmark.keywords.some((k) => text.toLowerCase().includes(k.toLowerCase()))) {
      return { text: `${landmark.name} \u2014 ${landmark.approxNote}`, link: null };
    }
  }

  return { text: "Distance not stated \u2014 check the listing manually", link: null };
}

// ============================================================
// Run translate/extract
// ============================================================
function bindRun() {
  els.runBtn.addEventListener("click", runExtraction);
}

function bindShortcut() {
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      setActiveTab("translate");
      runExtraction();
    }
  });
}

// ---------- Draft autosave ----------
let draftTimer = null;
function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    storageSet("draft", {
      text: els.thaiText.value,
      link: els.sourceLinkInput.value,
      result: lastResult
    });
  }, 250);
}

function bindDraft() {
  els.thaiText.addEventListener("input", saveDraft);
  els.sourceLinkInput.addEventListener("input", saveDraft);
}

function showSkeleton(on) {
  els.skeleton.classList.toggle("hidden", !on);
  if (on) els.resultEmpty.classList.add("hidden");
}

async function runExtraction() {
  const text = els.thaiText.value.trim();
  if (currentMode === "text" && !text) {
    showStatus(els.runStatus, "Paste some Thai text first.", "error");
    toast("Paste some Thai text first", "error");
    return;
  }
  if (currentMode === "image") {
    showStatus(els.runStatus, "Screenshot OCR isn't in this build \u2014 switch to Paste text.", "error");
    return;
  }

  els.runBtn.disabled = true;
  showStatus(els.runStatus, "Translating\u2026", "");
  els.result.classList.add("hidden");
  showSkeleton(true);

  try {
    const translatedText = await translateLong(text, "th", "en");
    const distance = detectDistance(text);
    const sourceLink = els.sourceLinkInput.value.trim() || null;

    lastResult = {
      sourceText: text,
      sourceLink,
      translatedText,
      price: extractPrice(text),
      deposit: extractDeposit(text),
      location: extractLocation(text),
      contactPhone: extractPhone(text),
      availability: extractAvailability(text),
      distanceText: distance.text,
      distanceLink: distance.link
    };

    renderResult(lastResult);
    saveDraft();
    showStatus(els.runStatus, "", "");
    toast("Translated \u2014 check the details below");
  } catch (err) {
    console.error(err);
    showStatus(els.runStatus, `Couldn't translate that: ${err.message}`, "error");
    toast("Translation failed \u2014 try again", "error");
    els.resultEmpty.classList.remove("hidden");
  } finally {
    els.runBtn.disabled = false;
    showSkeleton(false);
  }
}

function renderResult(r) {
  els.translatedText.textContent = r.translatedText || "(no translation returned)";

  if (r.price) {
    els.priceHero.textContent = `\u0E3F${r.price.replace(" THB/month", " /mo")}`;
    els.priceHero.classList.remove("hidden");
  } else {
    els.priceHero.classList.add("hidden");
  }

  const fields = [
    ["Price", r.price],
    ["Deposit", r.deposit],
    ["Location", r.location],
    ["Phone", r.contactPhone],
    ["Available", r.availability]
  ];
  els.detailsList.innerHTML = fields
    .map(([label, value]) =>
      `<div class="detail-row"><dt>${label}</dt><dd>${value ? escapeHtml(value) : "\u2014"}</dd></div>`)
    .join("");

  els.distanceText.innerHTML = r.distanceLink
    ? `${escapeHtml(r.distanceText)} \u2014 <a href="${escAttr(r.distanceLink)}" target="_blank" rel="noopener">open map</a>`
    : escapeHtml(r.distanceText);

  // Original-post chip
  if (r.sourceLink) {
    els.sourceLinkBtn.href = r.sourceLink;
    els.sourceLinkBtn.classList.remove("hidden");
  } else {
    els.sourceLinkBtn.classList.add("hidden");
  }

  els.resultEmpty.classList.add("hidden");
  els.result.classList.remove("hidden");
  els.replyPanel.classList.add("hidden");
  showStatus(els.saveStatus, "", "");
}

// ============================================================
// Result actions: copy translation / copy summary / share
// ============================================================
function bindResultActions() {
  els.copyTransBtn.addEventListener("click", async () => {
    const text = els.translatedText.textContent || "";
    if (!text) return;
    await copyText(text);
    toast("Translation copied");
  });

  els.copySummaryBtn.addEventListener("click", async () => {
    if (!lastResult) {
      toast("Translate a listing first", "error");
      return;
    }
    await copyText(buildSummary(lastResult));
    toast("Summary copied \u2014 ready to share");
  });

  els.shareBtn.addEventListener("click", async () => {
    if (!lastResult) {
      toast("Translate a listing first", "error");
      return;
    }
    const text = buildSummary(lastResult);
    if (navigator.share) {
      try {
        await navigator.share({ title: "BaanRight listing", text });
        toast("Shared");
      } catch (err) {
        if (err && err.name === "AbortError") return;
        await copyText(text);
        toast("Sharing not available \u2014 summary copied instead");
      }
    } else {
      await copyText(text);
      toast("Sharing not available \u2014 summary copied");
    }
  });
}

function buildSummary(r) {
  const lines = [
    "BaanRight listing summary",
    `Price: ${r.price || "n/a"}`,
    `Deposit: ${r.deposit || "n/a"}`,
    `Location: ${r.location || "n/a"}`,
    `Phone: ${r.contactPhone || "n/a"}`,
    `Available: ${r.availability || "n/a"}`,
    `Distance: ${r.distanceText || "n/a"}`,
    "",
    `Translation: ${r.translatedText || ""}`
  ];
  if (r.sourceLink) lines.push("", `Original: ${r.sourceLink}`);
  return lines.join("\n");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

// ============================================================
// Photo tray (add / drop / paste / select / remove)
// ============================================================
function bindPhotos() {
  els.addPhotoBtn.addEventListener("click", () => els.photoInput.click());

  // Drag & drop photos onto the dropzone (and anywhere over the card).
  const dz = els.photoDrop;
  ["dragenter", "dragover"].forEach((evt) =>
    dz.addEventListener(evt, (e) => {
      e.preventDefault();
      dz.classList.add("active");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dz.addEventListener(evt, (e) => {
      e.preventDefault();
      dz.classList.remove("active");
    })
  );
  dz.addEventListener("drop", async (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    await addFiles(files);
  });

  // Paste a screenshot (Ctrl/Cmd+V) straight into the tray.
  document.addEventListener("paste", async (e) => {
    const items = [...(e.clipboardData?.items || [])];
    const imgItem = items.find((i) => i.type && i.type.startsWith("image/"));
    if (!imgItem) return;
    const file = imgItem.getAsFile();
    if (!file) return;
    try {
      const src = await fileToDataUrl(file);
      if (addPhoto(src, { persist: true })) toast("Pasted photo added to the tray");
    } catch (err) {
      console.warn(err);
      toast("Couldn't read the pasted image", "error");
    }
  });

  els.photoInput.addEventListener("change", async () => {
    const files = [...(els.photoInput.files || [])];
    els.photoInput.value = "";
    await addFiles(files);
  });

  els.clearTrayBtn.addEventListener("click", () => {
    if (!photoTray.length) return;
    photoTray = [];
    persistTray();
    renderPhotoTray();
    toast("Photos cleared");
  });
}

async function addFiles(files) {
  let added = 0;
  let skipped = 0;
  for (const file of files) {
    if (!file.type || !file.type.startsWith("image/")) continue;
    try {
      const src = await fileToDataUrl(file);
      (addPhoto(src, { persist: false }) ? added++ : skipped++);
    } catch (err) {
      console.warn(err);
      toast(`Couldn't read ${file.name}`, "error");
    }
  }
  if (added || skipped) {
    persistTray();
    renderPhotoTray();
    if (added) toast(`${added} photo${added > 1 ? "s" : ""} added`);
    else toast("That photo is already in the tray", "error");
  }
}

function addPhoto(src, { persist = true } = {}) {
  if (!src || photoTray.some((p) => p.src === src)) return false;
  photoTray.unshift({ id: Date.now() + Math.random(), src, selected: true });
  if (persist) {
    persistTray();
    renderPhotoTray();
  }
  return true;
}

function persistTray() {
  storageSet("photoTray", photoTray);
}

function renderPhotoTray() {
  if (!photoTray.length) {
    els.photoTray.innerHTML = `<span class="tray-empty">No photos yet</span>`;
    els.trayCount.textContent = "";
    return;
  }
  els.photoTray.innerHTML = photoTray.map((p) => `
    <div class="photo-thumb ${p.selected ? "selected" : ""}" data-id="${p.id}" tabindex="0" title="Click to attach / detach">
      <img src="${escAttr(p.src)}" alt="Listing photo" />
      <button class="photo-check" aria-label="Toggle attach">&#10003;</button>
      <button class="photo-x" data-remove="1" aria-label="Remove photo">&#10005;</button>
    </div>`).join("");

  const selected = photoTray.filter((p) => p.selected).length;
  els.trayCount.textContent = `${photoTray.length} in tray \u00b7 ${selected} selected`;

  els.photoTray.querySelectorAll(".photo-thumb").forEach((thumb) => {
    const handle = async (e) => {
      const id = Number(thumb.dataset.id);
      const item = photoTray.find((p) => p.id === id);
      if (!item) return;
      if (e.target.closest("[data-remove]")) {
        photoTray = photoTray.filter((p) => p.id !== id);
        toast("Photo removed");
      } else {
        item.selected = !item.selected;
      }
      persistTray();
      renderPhotoTray();
    };
    thumb.addEventListener("click", handle);
    thumb.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handle(e);
      }
    });
  });
}

function fileToDataUrl(file, maxW = 1000) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Not an image"));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / (img.width || maxW));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => reject(new Error("Not a readable image"));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ============================================================
// Save listing
// ============================================================
function bindSave() {
  els.saveListingBtn.addEventListener("click", saveCurrentListing);
}

function saveCurrentListing() {
  if (!lastResult) return;
  const savedListings = storageGet("savedListings", []);
  const images = photoTray.filter((p) => p.selected).map((p) => p.src);
  const listing = {
    id: Date.now(),
    savedAt: new Date().toISOString(),
    starred: false,
    images,
    ...lastResult
  };
  savedListings.unshift(listing);
  if (!storageSet("savedListings", savedListings)) return;
  showStatus(els.saveStatus, "Saved to your listings.", "ok");
  toast(images.length
    ? `Saved with ${images.length} photo${images.length > 1 ? "s" : ""}`
    : "Saved to your listings");
  renderSaved();
}

// ============================================================
// Saved list
// ============================================================
function bindSavedToolbar() {
  els.savedSearch.addEventListener("input", () => {
    savedQuery = els.savedSearch.value.trim().toLowerCase();
    renderSaved();
  });
  els.shortlistOnly.addEventListener("change", () => {
    shortlistOnly = els.shortlistOnly.checked;
    renderSaved();
  });
  els.exportBtn.addEventListener("click", exportSaved);
}

function matchesQuery(l, q) {
  if (!q) return true;
  return [l.price, l.deposit, l.location, l.contactPhone, l.availability, l.distanceText, l.translatedText, l.sourceText]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(q));
}

function renderSavedItem(l) {
  const isExpanded = expandedSavedId === l.id;
  const sourceLinkRow = l.sourceLink
    ? `<a class="chip-btn chip-link" href="${escAttr(l.sourceLink)}" target="_blank" rel="noopener">View original post</a>`
    : "";
  const phone = (l.contactPhone || "").split(",")[0].trim();

  const thumbs = (l.images || []).length
    ? `<div class="thumb-strip">
        ${l.images.slice(0, 4).map((src) =>
          `<a class="thumb" href="${escAttr(src)}" target="_blank" rel="noopener" title="Open full image"><img src="${escAttr(src)}" alt="" /></a>`).join("")}
        ${l.images.length > 4 ? `<span class="thumb-more">+${l.images.length - 4}</span>` : ""}
      </div>`
    : "";

  const detailsBlock = isExpanded
    ? `
      <div class="saved-item-details">
        <div>Translation</div>
        <p style="margin:4px 0 0;">${escapeHtml(l.translatedText || "(no translation saved)")}</p>
        <dl class="details-grid">
          <div class="detail-row"><dt>Price</dt><dd>${l.price ? escapeHtml(l.price) : "\u2014"}</dd></div>
          <div class="detail-row"><dt>Deposit</dt><dd>${l.deposit ? escapeHtml(l.deposit) : "\u2014"}</dd></div>
          <div class="detail-row"><dt>Location</dt><dd>${l.location ? escapeHtml(l.location) : "\u2014"}</dd></div>
          <div class="detail-row"><dt>Phone</dt><dd>${l.contactPhone ? escapeHtml(l.contactPhone) : "\u2014"}</dd></div>
          <div class="detail-row"><dt>Available</dt><dd>${l.availability ? escapeHtml(l.availability) : "\u2014"}</dd></div>
          <div class="detail-row"><dt>Photos</dt><dd>${(l.images || []).length || "\u2014"}</dd></div>
        </dl>
      </div>`
    : "";

  return `
    <li class="saved-item" data-id="${l.id}">
      <button class="star-btn ${l.starred ? "on" : ""}" data-action="star" title="Shortlist" aria-label="Shortlist">&#9733;</button>
      <div class="saved-item-top">
        <span class="saved-item-price">${l.price ? escapeHtml(l.price) : "Price n/a"}</span>
        ${l.availability ? `<span class="saved-item-avail">${escapeHtml(l.availability)}</span>` : ""}
      </div>
      <div class="saved-item-loc">&#128205; ${l.location ? escapeHtml(l.location) : "Location n/a"}</div>
      ${l.distanceText ? `<div class="saved-item-dist">${escapeHtml(l.distanceText)}</div>` : ""}
      ${thumbs}
      <div class="saved-item-actions">
        <button class="chip-btn" data-action="toggle-details">${isExpanded ? "Hide details" : "View details"}</button>
        ${phone ? `<button class="chip-btn" data-action="call" data-phone="${escAttr(phone)}">Call landlord</button>` : ""}
        ${sourceLinkRow}
        ${(l.images || []).length ? `<button class="chip-btn" data-action="dl-img">Download photos</button>` : ""}
        <button class="chip-btn" data-action="remove">Remove</button>
      </div>
      ${detailsBlock}
    </li>`;
}

function renderSaved() {
  const savedListings = storageGet("savedListings", []);
  const filtered = savedListings
    .filter((l) => matchesQuery(l, savedQuery))
    .filter((l) => (!shortlistOnly || l.starred))
    .sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0));

  els.savedEmpty.classList.toggle("hidden", savedListings.length > 0);
  els.noMatches.classList.toggle("hidden", !(savedListings.length > 0 && filtered.length === 0));
  els.savedList.innerHTML = filtered.map(renderSavedItem).join("");

  // Tab badge + stats line
  if (els.savedCount) {
    els.savedCount.textContent = String(savedListings.length);
    els.savedCount.classList.toggle("hidden", savedListings.length === 0);
  }
  if (els.savedStats) {
    if (!savedListings.length) {
      els.savedStats.textContent = "";
    } else {
      const starred = savedListings.filter((l) => l.starred).length;
      const prices = savedListings
        .map((l) => Number(String(l.price || "").replace(/[^\d]/g, "")))
        .filter((n) => n > 0);
      const avg = prices.length
        ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
        : null;
      els.savedStats.textContent =
        `${savedListings.length} saved \u00b7 \u2605 ${starred} shortlisted` +
        (avg ? ` \u00b7 avg \u0E3F${avg.toLocaleString()}/mo` : "");
    }
  }

  els.savedList.querySelectorAll("[data-action='toggle-details']").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest(".saved-item").dataset.id);
      expandedSavedId = expandedSavedId === id ? null : id;
      renderSaved();
    })
  );
  els.savedList.querySelectorAll("[data-action='star']").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest(".saved-item").dataset.id);
      const savedListings = storageGet("savedListings", []);
      const item = savedListings.find((l) => l.id === id);
      if (!item) return;
      item.starred = !item.starred;
      storageSet("savedListings", savedListings);
      toast(item.starred ? "Added to shortlist" : "Removed from shortlist");
      renderSaved();
    })
  );
  els.savedList.querySelectorAll("[data-action='remove']").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest(".saved-item").dataset.id);
      const savedListings = storageGet("savedListings", []);
      storageSet("savedListings", savedListings.filter((l) => l.id !== id));
      if (expandedSavedId === id) expandedSavedId = null;
      toast("Listing removed");
      renderSaved();
    })
  );
  els.savedList.querySelectorAll("[data-action='call']").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const phone = e.target.dataset.phone;
      if (phone) window.open(`tel:${phone}`);
    })
  );
  els.savedList.querySelectorAll("[data-action='dl-img']").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest(".saved-item").dataset.id);
      downloadListingImages(id);
    })
  );
}

// ---------- Photo downloads (anchor-based — no chrome.downloads on the web) ----------
function downloadListingImages(id) {
  const savedListings = storageGet("savedListings", []);
  const item = savedListings.find((l) => l.id === id);
  if (!item || !item.images?.length) return;
  let started = 0;
  item.images.forEach((src, i) => {
    try {
      const filename = `baanright-${id}-${i + 1}.${guessExt(src)}`;
      downloadViaAnchor(src, filename);
      started++;
    } catch (err) {
      console.warn("download failed", err);
    }
  });
  toast(started ? `Downloading ${started} photo${started > 1 ? "s" : ""}` : "Couldn't start download", started ? "ok" : "error");
}

function guessExt(src) {
  if (src.startsWith("data:image/")) {
    const m = src.slice(5, src.indexOf(";"));
    if (m.includes("png")) return "png";
    if (m.includes("webp")) return "webp";
    if (m.includes("gif")) return "gif";
    return "jpg";
  }
  try {
    const path = new URL(src).pathname;
    const m = path.match(/\.(png|jpe?g|webp|gif)(?:$|\?)/i);
    if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
  } catch { /* not a URL */ }
  return "jpg";
}

function downloadViaAnchor(src, filename) {
  const a = document.createElement("a");
  a.href = src;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ============================================================
// Export CSV (blob + anchor — works without any extension API)
// ============================================================
function exportSaved() {
  const savedListings = storageGet("savedListings", []);
  if (!savedListings.length) {
    toast("Nothing to export yet", "error");
    return;
  }
  const cols = ["Price", "Deposit", "Location", "Phone", "Available", "Distance", "Translation", "Source link", "Photos", "Starred", "Saved at"];
  const rows = savedListings.map((l) => [
    l.price, l.deposit, l.location, l.contactPhone, l.availability,
    l.distanceText, l.translatedText, l.sourceLink, (l.images || []).length,
    l.starred ? "yes" : "", l.savedAt
  ]);
  const csv = [cols, ...rows]
    .map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  downloadViaAnchor(url, "baanright-saved-listings.csv");
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast("Exporting CSV");
}

// ============================================================
// Alerts / preferences
// ============================================================
function bindAlerts() {
  els.addAlertBtn.addEventListener("click", () => {
    const preferredArea = els.alertArea.value.trim();
    const maxPrice = Number(els.alertPrice.value) || null;
    if (!preferredArea && !maxPrice) {
      toast("Add an area or a budget first", "error");
      return;
    }
    const searchAlerts = storageGet("searchAlerts", []);
    searchAlerts.unshift({ id: Date.now(), preferredArea, maxPrice, isActive: true });
    storageSet("searchAlerts", searchAlerts);
    els.alertArea.value = "";
    els.alertPrice.value = "";
    toast("Preference added");
    renderAlerts();
  });
}

function renderAlerts() {
  const searchAlerts = storageGet("searchAlerts", []);
  els.alertsEmpty.classList.toggle("hidden", searchAlerts.length > 0);
  els.alertsListUI.innerHTML = searchAlerts
    .map(
      (a) => `
      <li class="saved-item" data-id="${a.id}">
        <div class="saved-item-top">
          <span class="saved-item-price">${a.preferredArea ? escapeHtml(a.preferredArea) : "Any area"}</span>
          <span class="saved-item-avail">${a.maxPrice ? `&#8804; ${a.maxPrice} THB` : "Any budget"}</span>
        </div>
        <div class="saved-item-actions">
          <button class="chip-btn" data-action="remove">Remove</button>
        </div>
      </li>`
    )
    .join("");
  els.alertsListUI.querySelectorAll("[data-action='remove']").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest(".saved-item").dataset.id);
      const searchAlerts = storageGet("searchAlerts", []);
      storageSet("searchAlerts", searchAlerts.filter((a) => a.id !== id));
      toast("Preference removed");
      renderAlerts();
    })
  );
}

// ============================================================
// Reply-in-Thai generator
// ============================================================
function renderReplyOptions() {
  els.replyOptions.innerHTML = REPLY_TEMPLATES.map(
    (t) => `
    <label class="reply-option">
      <input type="checkbox" value="${t.id}" checked />
      <span>${escapeHtml(t.en)}</span>
    </label>`
  ).join("");
}

function bindReply() {
  els.toggleReplyBtn.addEventListener("click", () => {
    els.replyPanel.classList.toggle("hidden");
    if (!els.replyPanel.classList.contains("hidden")) {
      els.replyPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
  els.generateReplyBtn.addEventListener("click", generateReply);
  els.copyReplyBtn.addEventListener("click", async () => {
    await copyText(els.replyOutput.value);
    toast("Message copied \u2014 paste it to the landlord");
  });
}

async function generateReply() {
  const checked = [...els.replyOptions.querySelectorAll("input:checked")].map((i) => i.value);
  const chosen = REPLY_TEMPLATES.filter((t) => checked.includes(t.id));
  if (!chosen.length) {
    toast("Tick at least one question", "error");
    return;
  }

  els.generateReplyBtn.disabled = true;
  els.generateReplyBtn.textContent = "Translating\u2026";
  try {
    const lines = [];
    for (const t of chosen) {
      const th = await translateChunk(t.en, "en", "th");
      lines.push(th);
    }
    els.replyOutput.value = lines.join("\n");
    els.replyOutput.classList.remove("hidden");
    els.copyReplyBtn.classList.remove("hidden");
    toast("Thai message ready");
  } catch (err) {
    console.error(err);
    toast("Couldn't translate the questions", "error");
  } finally {
    els.generateReplyBtn.disabled = false;
    els.generateReplyBtn.textContent = "Generate Thai message";
  }
}

// ============================================================
// Hero demo loader
// ============================================================
function bindHeroDemo() {
  els.demoBtn.addEventListener("click", () => {
    const demo = DEMOS[demoIndex % DEMOS.length];
    demoIndex++;
    setActiveTab("translate");
    els.thaiText.value = demo;
    els.sourceLinkInput.value = "";
    lastResult = null;
    els.result.classList.add("hidden");
    els.resultEmpty.classList.remove("hidden");
    saveDraft();
    document.getElementById("app").scrollIntoView({ behavior: "smooth", block: "start" });
    toast("Demo loaded \u2014 translating\u2026");
    setTimeout(runExtraction, 500);
  });
}

// ============================================================
// Chrome: header, mobile nav, reveals, install prompt, service worker
// ============================================================
function bindChrome() {
  const header = els.siteHeader;
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 6);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Mobile nav
  els.navToggle.addEventListener("click", () => {
    const open = header.classList.toggle("nav-open");
    els.navToggle.setAttribute("aria-expanded", String(open));
    els.navToggle.innerHTML = open ? "&#10005;" : "&#9776;";
  });
  els.siteNav.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      header.classList.remove("nav-open");
      els.navToggle.setAttribute("aria-expanded", "false");
      els.navToggle.innerHTML = "&#9776;";
    })
  );

  // Scroll reveal
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in"));
  }

  // PWA install prompt
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    els.installBtn.classList.remove("hidden");
  });
  els.installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === "accepted") toast("Installing BaanRight\u2026");
    deferredInstallPrompt = null;
    els.installBtn.classList.add("hidden");
  });
  window.addEventListener("appinstalled", () => {
    els.installBtn.classList.add("hidden");
    toast("BaanRight installed \u2014 look for it on your home screen");
  });

  // Service worker (offline shell) — only over http(s)
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW registration failed", err));
    });
  }
}

// ============================================================
// Helpers
// ============================================================
function showStatus(el, message, kind) {
  el.textContent = message;
  el.className = `status ${kind}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}
