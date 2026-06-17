const API = "http://127.0.0.1:5000";
let currentData   = null;
let cameraStream  = null;
let currentAudios = [];
let selectedFile  = null;
let isSpeaking    = false;

const LANG_MAP = {
  "en-US": "en", "hi-IN": "hi", "kn-IN": "kn",
  "ta-IN": "ta", "te-IN": "te", "mr-IN": "mr", "bn-IN": "bn"
};

/* ── DOM REFS ── */
const fileInput      = document.getElementById("file-input");
const dropZone       = document.getElementById("drop-zone");
const analyzeBtn     = document.getElementById("analyze-btn");
const cameraBtn      = document.getElementById("camera-btn");
const clearBtn       = document.getElementById("clear-btn");
const imagePreview   = document.getElementById("image-preview");
const previewWrap    = document.getElementById("image-preview-wrap");
const loadingOverlay = document.getElementById("loading-overlay");
const loadingText    = document.getElementById("loading-text");
const resultSection  = document.getElementById("result-section");
const cameraModal    = document.getElementById("camera-modal");
const cameraVideo    = document.getElementById("camera-video");
const cameraCanvas   = document.getElementById("camera-canvas");
const snapBtn        = document.getElementById("snap-btn");
const closeCamera    = document.getElementById("close-camera");
const speakBtn       = document.getElementById("speak-btn");
const stopBtn        = document.getElementById("stop-btn");
const langSelect     = document.getElementById("lang-select");
const pdfBtn         = document.getElementById("pdf-btn");
const refreshHistory = document.getElementById("refresh-history-btn");

/* ══════════════════════════════════════
   FILE UPLOAD
══════════════════════════════════════ */
fileInput.addEventListener("change", e => { if (e.target.files[0]) setPreview(e.target.files[0]); });
dropZone.addEventListener("dragover",  e => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", e => {
  e.preventDefault(); dropZone.classList.remove("drag-over");
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith("image/")) setPreview(f);
});

function setPreview(file) {
  selectedFile = file;
  imagePreview.src = URL.createObjectURL(file);
  previewWrap.classList.remove("hidden");
  analyzeBtn.disabled = false;
}

clearBtn.addEventListener("click", () => {
  selectedFile = null; fileInput.value = "";
  imagePreview.src = ""; previewWrap.classList.add("hidden");
  analyzeBtn.disabled = true;
});

/* ══════════════════════════════════════
   CAMERA
══════════════════════════════════════ */
cameraBtn.addEventListener("click", async () => {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    cameraVideo.srcObject = cameraStream;
    cameraModal.classList.remove("hidden");
  } catch { alert("Camera not accessible. Please use file upload."); }
});

snapBtn.addEventListener("click", () => {
  cameraCanvas.width  = cameraVideo.videoWidth;
  cameraCanvas.height = cameraVideo.videoHeight;
  cameraCanvas.getContext("2d").drawImage(cameraVideo, 0, 0);
  cameraCanvas.toBlob(blob => {
    setPreview(new File([blob], "capture.jpg", { type: "image/jpeg" }));
    stopCameraStream();
  }, "image/jpeg", 0.92);
});

closeCamera.addEventListener("click", stopCameraStream);
function stopCameraStream() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  cameraModal.classList.add("hidden");
}

/* ══════════════════════════════════════
   ANALYZE
══════════════════════════════════════ */
analyzeBtn.addEventListener("click", async () => {
  if (!selectedFile) return;
  showLoading("Analyzing leaf image...");
  const formData = new FormData();
  formData.append("image", selectedFile);
  try {
    setLoadingText("Running disease detection...");
    const res = await fetch(`${API}/predict`, { method: "POST", body: formData });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data = await res.json();
    setLoadingText("Generating AI advisory...");
    await delay(300);
    currentData = data;
    renderResults(data);
    hideLoading();
    resultSection.classList.remove("hidden");
    resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    loadHistory();
  } catch (err) {
    hideLoading();
    alert("Error: " + err.message + "\n\nMake sure Flask backend is running:\ncd backend\npython app.py");
  }
});

/* ══════════════════════════════════════
   RENDER RESULTS
══════════════════════════════════════ */
function renderResults(data) {
  const adv = data.advisory || {};
  document.getElementById("res-disease").textContent    = data.disease || "Unknown";
  document.getElementById("res-plant").textContent      = "🌱 " + (data.plant || "Unknown");
  document.getElementById("res-confidence").textContent = Math.round(data.confidence || 0);

  const arc = document.getElementById("confidence-arc");
  setTimeout(() => {
    arc.style.transition       = "stroke-dashoffset 1.2s ease";
    arc.style.strokeDashoffset = 213.6 - (213.6 * ((data.confidence || 0) / 100));
  }, 100);

  const sev   = (adv.severity_level || "Moderate").toLowerCase();
  const sevEl = document.getElementById("res-severity");
  sevEl.textContent = adv.severity_level || "Moderate";
  sevEl.className   = `severity-badge severity-${sev}`;

  fillAdvisory(adv);
}

function fillAdvisory(adv) {
  document.getElementById("adv-description").textContent = adv.description || "No description available.";
  fillList("adv-symptoms",    adv.symptoms             || []);
  fillList("adv-causes",      adv.causes               || []);
  fillList("adv-traditional", adv.traditional_remedies || []);
  fillList("adv-organic",     adv.organic_remedies     || []);
  fillList("adv-modern",      adv.modern_treatments    || []);
  fillList("adv-prevention",  adv.prevention_methods   || []);
  fillList("adv-precautions", adv.precautions          || []);

  const medEl = document.getElementById("adv-medicines");
  medEl.innerHTML = "";
  (adv.recommended_medicines || []).forEach(med => {
    const li = document.createElement("li");
    li.innerHTML = typeof med === "object"
      ? `<strong>${med.name || ""}</strong> — ${med.active_ingredient || ""}` : med;
    medEl.appendChild(li);
  });
}

function fillList(id, items) {
  const el = document.getElementById(id);
  el.innerHTML = "";
  if (!items.length) { el.innerHTML = "<li>No data available.</li>"; return; }
  items.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    el.appendChild(li);
  });
}

/* ══════════════════════════════════════
   TABS
══════════════════════════════════════ */
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

/* ══════════════════════════════════════
   VOICE ASSISTANT
   Flow:
   1. Farmer selects language (e.g. Kannada)
   2. Click Listen → Gemini translates advisory to Kannada
   3. Translated text is spoken via Google TTS in Kannada
   So farmer hears: "ನಿಮ್ಮ ಟೊಮೆಟೊ ಗಿಡಕ್ಕೆ ಅರ್ಲಿ ಬ್ಲೈಟ್ ರೋಗ ಬಂದಿದೆ..."
══════════════════════════════════════ */
speakBtn.addEventListener("click", async () => {
  if (!currentData) { alert("Please analyze a leaf first."); return; }
  if (isSpeaking)   { stopAllAudio(); return; }

  const lang       = langSelect.value;
  const googleLang = LANG_MAP[lang] || "en";
  const adv        = currentData.advisory || {};

  speakBtn.textContent    = "⏳ Translating...";
  speakBtn.style.background = "#fef3c7";
  speakBtn.disabled       = true;

  try {
    let translatedAdv = adv;

    // Step 1 — Translate advisory if not English
    if (googleLang !== "en") {
      const res = await fetch(`${API}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advisory: adv, language: googleLang })
      });
      const data = await res.json();
      translatedAdv = data.translated || adv;
    }

    // Step 2 — Build full text from translated advisory
    const text = buildSpeakText(currentData, translatedAdv);

    // Step 3 — Speak via Google TTS in selected language
    const chunks = splitIntoChunks(text, 150);
    isSpeaking = true;
    speakBtn.textContent    = "⏸ Speaking...";
    speakBtn.style.background = "#bbf7d0";
    speakBtn.disabled       = false;

    playChunksViaProxy(chunks, googleLang, lang, 0);

  } catch (err) {
    console.error("Voice error:", err);
    speakBtn.textContent    = "▶ Listen";
    speakBtn.style.background = "";
    speakBtn.disabled       = false;
    // Fallback — speak original English
    const text   = buildSpeakText(currentData, adv);
    const chunks = splitIntoChunks(text, 150);
    isSpeaking   = true;
    playChunksViaProxy(chunks, googleLang, lang, 0);
  }
});

stopBtn.addEventListener("click", stopAllAudio);

function buildSpeakText(data, adv) {
  return [
    `${data.plant}.`,
    `${data.disease}.`,
    adv.description || "",
    adv.symptoms?.length          ? `${adv.symptoms.join(". ")}.`             : "",
    adv.causes?.length            ? `${adv.causes.join(". ")}.`               : "",
    adv.traditional_remedies?.length ? `${adv.traditional_remedies.join(". ")}.` : "",
    adv.organic_remedies?.length  ? `${adv.organic_remedies.join(". ")}.`     : "",
    adv.modern_treatments?.length ? `${adv.modern_treatments.join(". ")}.`    : "",
    adv.prevention_methods?.length? `${adv.prevention_methods.join(". ")}.`   : "",
    adv.precautions?.length       ? `${adv.precautions.join(". ")}.`          : ""
  ].filter(Boolean).join(" ");
}

function playChunksViaProxy(chunks, googleLang, browserLang, index) {
  if (!isSpeaking || index >= chunks.length) { finishSpeaking(); return; }
  const chunk = chunks[index];

  fetch(`${API}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: chunk, lang: googleLang })
  })
  .then(res => { if (!res.ok) throw new Error("TTS failed"); return res.blob(); })
  .then(blob => {
    const url   = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudios.push(audio);
    audio.onended = () => { URL.revokeObjectURL(url); playChunksViaProxy(chunks, googleLang, browserLang, index + 1); };
    audio.onerror = () => browserSpeakChunk(chunk, browserLang, () => playChunksViaProxy(chunks, googleLang, browserLang, index + 1));
    audio.play().catch(() => browserSpeakChunk(chunk, browserLang, () => playChunksViaProxy(chunks, googleLang, browserLang, index + 1)));
  })
  .catch(() => browserSpeakChunk(chunk, browserLang, () => playChunksViaProxy(chunks, googleLang, browserLang, index + 1)));
}

function browserSpeakChunk(text, lang, onEnd) {
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang  = lang; utt.rate = 0.88; utt.pitch = 1;
  utt.onend = onEnd || null; utt.onerror = onEnd || null;
  const voices = window.speechSynthesis.getVoices();
  const voice  = voices.find(v => v.lang === lang) || voices.find(v => v.lang.startsWith(lang.split("-")[0])) || null;
  if (voice) utt.voice = voice;
  window.speechSynthesis.speak(utt);
}

function stopAllAudio() {
  isSpeaking = false;
  window.speechSynthesis.cancel();
  currentAudios.forEach(a => { try { a.pause(); a.currentTime = 0; } catch(e){} });
  currentAudios = [];
  finishSpeaking();
}

function finishSpeaking() {
  isSpeaking = false;
  speakBtn.textContent    = "▶ Listen";
  speakBtn.style.background = "";
  speakBtn.disabled       = false;
}

function splitIntoChunks(text, maxLen) {
  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
  const chunks = []; let current = "";
  sentences.forEach(s => {
    if ((current + s).length > maxLen) { if (current.trim()) chunks.push(current.trim()); current = s; }
    else current += " " + s;
  });
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

/* ══════════════════════════════════════
   PDF
══════════════════════════════════════ */
pdfBtn.addEventListener("click", async () => {
  if (!currentData) return;
  const orig = pdfBtn.textContent;
  pdfBtn.textContent = "⏳ Generating..."; pdfBtn.disabled = true;
  try {
    const res  = await fetch(`${API}/generate-pdf`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentData)
    });
    const data = await res.json();
    if (data.pdf_path) {
      const filename = data.pdf_path.split(/[\\/]/).pop();
      const link = document.createElement("a");
      link.href = `${API}/download-pdf/${filename}`; link.download = filename;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
  } catch (err) { alert("PDF failed: " + err.message); }
  finally { pdfBtn.textContent = orig; pdfBtn.disabled = false; }
});

/* ══════════════════════════════════════
   HISTORY
══════════════════════════════════════ */
async function loadHistory() {
  const container = document.getElementById("history-list");
  try {
    const res  = await fetch(`${API}/history`);
    const data = await res.json();
    if (!data.length) { container.innerHTML = `<p class="empty-state">No detections yet. Upload a leaf to get started.</p>`; return; }
    container.innerHTML = data.map(item => {
      const sev      = (item.severity || "moderate").toLowerCase();
      const filename = item.report_path ? item.report_path.split(/[\\/]/).pop() : null;
      return `
        <div class="history-item">
          <div class="history-info">
            <div class="history-plant">🌱 ${item.plant}</div>
            <div class="history-disease">${item.disease}</div>
            <div class="history-date">📅 ${item.date} &nbsp;|&nbsp; ${item.confidence}% &nbsp;|&nbsp;
              <span class="severity-badge severity-${sev}">${item.severity}</span>
            </div>
          </div>
          <div class="history-actions">
            ${filename ? `<button class="btn btn-outline" onclick="downloadReport('${filename}')">⬇ PDF</button>` : ""}
            <button class="btn btn-stop" onclick="deleteHistory(${item.id})">🗑</button>
          </div>
        </div>`;
    }).join("");
  } catch { container.innerHTML = `<p class="empty-state">Could not load history. Make sure backend is running.</p>`; }
}

async function deleteHistory(id) {
  if (!confirm("Delete this record?")) return;
  await fetch(`${API}/history/${id}`, { method: "DELETE" });
  loadHistory();
}

function downloadReport(filename) {
  const link = document.createElement("a");
  link.href = `${API}/download-pdf/${filename}`; link.download = filename;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

refreshHistory.addEventListener("click", loadHistory);

/* ── HELPERS ── */
function showLoading(msg)    { loadingText.textContent = msg; loadingOverlay.classList.remove("hidden"); }
function hideLoading()       { loadingOverlay.classList.add("hidden"); }
function setLoadingText(msg) { loadingText.textContent = msg; }
function delay(ms)           { return new Promise(r => setTimeout(r, ms)); }

window.addEventListener("load", () => { window.speechSynthesis.getVoices(); loadHistory(); });