/* Videorama — prompt → stylized video sets, on the film_factory backend.
   Sections: helpers · toasts · polling · status render · shot grid (keyed) ·
   inspector · assets · create/templates · wiring. */
(() => {
  const $ = (id) => document.getElementById(id);

  // cost estimates for button hints (server enforces the real budget cap)
  const RATES = { veo_sec: 0.40, ext_sec: 0.40, img: 0.15 };
  const TAKE_EST = 8 * RATES.veo_sec;           // ~$3.20
  const EXT_EST = (7 * RATES.ext_sec).toFixed(2); // ~$2.80

  const api = async (path, opts = {}) => {
    const r = await fetch("/api/videorama" + path, {
      headers: { "Content-Type": "application/json" }, ...opts,
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
    return r.json();
  };

  // every mutating action funnels through act(): POST, toast errors, wake poll
  const act = async (path, body) => {
    try {
      const res = await api(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      startPolling(true);
      return res;
    } catch (e) {
      toast(e.message, "error");
      throw e;
    }
  };

  let current = null;         // active slug
  let health = {};
  const selectedShots = new Set();

  // ---------- toasts ----------
  function toast(msg, kind = "info", ms = 4500) {
    const box = $("vr-toasts");
    const t = document.createElement("div");
    t.className = "vr-toast " + kind;
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, ms);
  }

  // ---------- polling lifecycle ----------
  // fast (4s) while a farm/inline op runs; slow (30s) status-only when idle
  let pollTimer = null;
  let pollFast = false;
  let prevState = null;

  function isActive(s) {
    return s.job_alive || s.inline_op || (s.state || "").startsWith("running");
  }

  function startPolling(fast) {
    clearTimeout(pollTimer);
    pollFast = !!fast;
    tick();
  }

  function scheduleNext(s) {
    clearTimeout(pollTimer);
    if (!current) return;
    const active = isActive(s);
    pollFast = active;
    pollTimer = setTimeout(tick, active ? 4000 : 30000);
  }

  async function tick() {
    if (!current) return;
    let s;
    try { s = await api(`/projects/${current}/status`); } catch { pollTimer = setTimeout(tick, 8000); return; }
    renderStatus(s);
    // shot payloads only matter while things change (or on a fast tick)
    if (pollFast || isActive(s) || !shotsSig) await renderShots();
    // transition toast: running -> settled
    if (prevState && (prevState.startsWith("running") || pollFast) && !isActive(s) && prevState !== s.state) {
      if ((s.state || "").startsWith("error")) toast("Stage failed: " + s.state, "error", 8000);
      else if (["shots_ready", "pilot_ready", "done"].includes(s.state)) {
        toast("Ready: " + s.state.replace("_", " "), "info");
        renderShots(true);
        loadAssets();
      }
    }
    prevState = s.state;
    scheduleNext(s);
  }

  // ---------- status render ----------
  let actionsSig = null;

  function renderStatus(s) {
    $("p-title").textContent = s.title || current;
    $("p-logline").textContent = s.logline || "";
    $("p-state").textContent = isActive(s)
      ? (s.inline_op ? "working: " + s.inline_op : s.state + " · running")
      : s.state;
    $("p-spend").textContent = `$${s.spent} / $${s.budget}`;
    $("p-spendbar").style.width = Math.min(100, (s.spent / s.budget) * 100) + "%";
    $("p-log").textContent = s.log_tail || "";
    $("p-error").hidden = !s.error || !(s.state || "").startsWith("error");
    $("p-error").textContent = s.error || "";

    const flagged = (s.likeness || []).filter((r) => r.resembles && r.confidence >= 6);
    $("p-likeness").hidden = !flagged.length;
    if (flagged.length) {
      $("p-likeness").textContent = "⚠ Likeness check: " + flagged
        .map((f) => `${f.asset} resembles ${f.who} (${f.confidence}/10)`)
        .join("; ") + " — regenerate these character sheets before rendering.";
    }

    $("p-exports").innerHTML = (s.exports || [])
      .map((u) => `<a href="${u}" target="_blank">▶ ${u.split("/").pop()}</a>`)
      .join("");

    renderActions(s);
  }

  function actionDefs(s) {
    const pend = (s.shots.pending || 0) + (s.shots.failed || 0) + (s.shots.rendering || 0);
    const finishHint = pend ? ` (~$${Math.round(pend * TAKE_EST)}–${Math.round(pend * 2 * TAKE_EST)})` : "";
    const MAP = {
      brief_ready: [["Generate shot list → (~$0.25)", "develop", "vr-btn-primary"]],
      shots_ready: [[`Run 4-clip pilot → (~$${Math.round(4 * TAKE_EST)})`, "pilot", "vr-btn-primary"],
                    [`Skip pilot, render everything${finishHint}`, "finish", ""]],
      pilot_ready: [[`Approve — render everything →${finishHint}`, "finish", "vr-btn-primary"],
                    ["Re-run pilot", "pilot", ""]],
      done: [],
    };
    let acts = MAP[s.state];
    if (!acts && (s.state || "").startsWith("error:develop")) {
      acts = [["Retry shot list", "develop", "vr-btn-primary"]];
    } else if (!acts && ((s.state || "").startsWith("error") || (s.state || "").startsWith("running"))) {
      acts = [["Resume where it stopped →", "resume", "vr-btn-primary"]];
    }
    return acts || [];
  }

  function renderActions(s) {
    const sig = [s.state, s.job_alive, s.inline_op, (s.exports || []).length,
                 s.shots.pending || 0, s.shots.failed || 0].join("|");
    if (sig === actionsSig) return;
    actionsSig = sig;
    const actions = $("p-actions");
    actions.innerHTML = "";
    if (isActive(s) || health.hosted) return;

    actionDefs(s).forEach(([label, ep, cls]) => {
      const b = mkBtn(label, cls, async () => { b.disabled = true; await act(`/projects/${current}/${ep}`); });
      actions.appendChild(b);
    });
    if (["shots_ready", "pilot_ready", "done"].includes(s.state)) {
      actions.appendChild(mkBtn("Run likeness check", "", async (b) => {
        b.disabled = true;
        const res = await act(`/projects/${current}/likeness`);
        toast(res.flagged.length ? `${res.flagged.length} flagged` : "No likeness issues", res.flagged.length ? "error" : "info");
      }));
      actions.appendChild(mkBtn("Add shots…", "", () => $("extend-row").hidden = !$("extend-row").hidden));
      actions.appendChild(mkBtn("Save as template", "", async () => {
        const name = prompt("Template name:", current);
        if (!name) return;
        const res = await act(`/projects/${current}/save-template`, { name });
        toast(`Template saved: ${res.name}`);
        loadTemplates();
      }));
    }
    if ((s.exports || []).length && !isActive(s)) {
      actions.appendChild(mkBtn("Reassemble ↺", "", async () => {
        const res = await act(`/projects/${current}/assemble`);
        toast("Assembling " + res.version);
      }));
    }
  }

  function mkBtn(label, cls, onclick) {
    const b = document.createElement("button");
    b.className = "vr-btn " + (cls || "");
    b.textContent = label;
    b.onclick = () => onclick(b);
    return b;
  }

  // ---------- shot grid (keyed, in-place updates) ----------
  const shotCards = new Map();  // id -> {el, sig}
  let shotsSig = null;
  let shotsCache = [];

  function cardSig(sh) {
    return JSON.stringify([sh.clip, sh.poster, sh.status, sh.qc, sh.qc_notes,
                           sh.title, sh.excluded, sh.keyframe_status, sh.seq]);
  }

  function videoPlaying(el) {
    const v = el.querySelector("video");
    return v && !v.paused && !v.ended;
  }

  function cardBody(sh) {
    return (sh.clip
      ? `<video src="${sh.clip}#t=0.5" controls preload="metadata"
           ${sh.poster ? `poster="${sh.poster}"` : ""}></video>` : "") +
      `<h4><label class="vr-pick"><input type="checkbox" ${selectedShots.has(sh.id) ? "checked" : ""}></label>
         ${sh.seq}. ${sh.title} ${sh.excluded ? '<span class="excl">excluded</span>' : ""}
         <span class="qc ${sh.qc !== null && sh.qc < 6 ? "bad" : ""}">${sh.qc ?? sh.status}</span></h4>
       <div class="notes">${sh.qc_notes || ""}</div>`;
  }

  function wireCard(el, sh) {
    const pick = el.querySelector(".vr-pick input");
    if (pick) pick.onchange = (e) => {
      e.target.checked ? selectedShots.add(sh.id) : selectedShots.delete(sh.id);
      el.classList.toggle("selected", e.target.checked);
      updateRetakeBtn();
    };
    el.onclick = (e) => {
      if (["VIDEO", "INPUT", "LABEL"].includes(e.target.tagName)) return;
      openInspector(sh.id);
    };
  }

  function buildCard(sh) {
    const el = document.createElement("div");
    el.className = "vr-card" + (selectedShots.has(sh.id) ? " selected" : "") + (sh.excluded ? " excluded" : "");
    el.dataset.id = sh.id;
    el.innerHTML = cardBody(sh);
    wireCard(el, sh);
    return el;
  }

  function patchCard(entry, sh) {
    const el = entry.el;
    el.classList.toggle("excluded", !!sh.excluded);
    const qcEl = el.querySelector(".qc");
    if (qcEl) {
      qcEl.textContent = sh.qc ?? sh.status;
      qcEl.classList.toggle("bad", sh.qc !== null && sh.qc < 6);
    }
    const notes = el.querySelector(".notes");
    if (notes) notes.textContent = sh.qc_notes || "";
  }

  async function renderShots(force) {
    if (!current) return;
    let shots;
    try { ({ shots } = await api(`/projects/${current}/shots`)); } catch { return; }
    shotsCache = shots;
    const sig = JSON.stringify(shots.map(cardSig));
    if (!force && sig === shotsSig) return;
    shotsSig = sig;

    const grid = $("shot-grid");
    const seen = new Set();
    let anyPlaying = [...shotCards.values()].some((c) => videoPlaying(c.el));

    shots.forEach((sh) => {
      seen.add(sh.id);
      const entry = shotCards.get(sh.id);
      const sig2 = cardSig(sh);
      if (!entry) {
        const el = buildCard(sh);
        shotCards.set(sh.id, { el, sig: sig2, media: sh.clip + "|" + sh.poster });
        grid.appendChild(el);
      } else if (entry.sig !== sig2) {
        const media = sh.clip + "|" + sh.poster;
        if (media === entry.media) {           // text-only change
          patchCard(entry, sh);
          entry.sig = sig2;
        } else if (!videoPlaying(entry.el)) {  // media changed, safe to rebuild
          entry.el.innerHTML = cardBody(sh);
          entry.el.classList.toggle("excluded", !!sh.excluded);
          wireCard(entry.el, sh);
          entry.sig = sig2;
          entry.media = media;
        } // else: playing — defer to a later tick (sig stays stale on purpose)
      }
    });

    // removals
    for (const [id, entry] of shotCards) {
      if (!seen.has(id)) { entry.el.remove(); shotCards.delete(id); }
    }
    // ordering (skip while any video plays — moving nodes resets playback)
    if (!anyPlaying) {
      const orderedIds = shots.map((sh) => sh.id);
      const domIds = [...grid.children].map((el) => el.dataset.id);
      if (JSON.stringify(orderedIds) !== JSON.stringify(domIds)) {
        orderedIds.forEach((id) => {
          const entry = shotCards.get(id);
          if (entry) grid.appendChild(entry.el);
        });
      }
    }
    applyFilter();
  }

  function applyFilter() {
    const lowOnly = $("chk-lowqc").checked;
    shotsCache.forEach((sh) => {
      const entry = shotCards.get(sh.id);
      if (entry) entry.el.hidden = lowOnly && !(sh.qc !== null && sh.qc < 6);
    });
  }

  function updateRetakeBtn() {
    const n = selectedShots.size;
    $("btn-retake").disabled = !n;
    $("btn-retake").textContent = n
      ? `Retake ${n} selected (~$${Math.round(n * TAKE_EST)}–${Math.round(n * 2 * TAKE_EST)})`
      : "Retake selected";
  }

  // ---------- inspector ----------
  let lastChipText = null;

  async function openInspector(shotId) {
    let data;
    try { data = await api(`/projects/${current}/shots/${shotId}`); }
    catch (e) { toast(e.message, "error"); return; }
    renderInspector(data);
    $("vr-modal").hidden = false;
  }

  function closeInspector() {
    $("vr-modal").hidden = true;
    $("vr-modal-box").innerHTML = "";
    lastChipText = null;
    startPolling(true);
  }

  function esc(s) {
    return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function renderInspector(data) {
    const sh = data.shot;
    const box = $("vr-modal-box");
    const best = data.takes.filter((t) => t.status === "done").at(-1);
    // extend always works when a take exists: seamless Veo extension for
    // fresh 720p sources, last-frame chaining at 1080p otherwise
    const extendable = !!best;
    const extReason = best ? "seamless when possible, else continues from the last frame"
                           : "no finished take yet";

    box.innerHTML = `
      <div class="vr-title-row" style="margin-top:0">
        <h2 style="margin:0">${sh.seq}. ${esc(sh.title)}</h2>
        <span class="vr-state">${sh.status}${sh.qc !== null ? " · qc " + sh.qc : ""}</span>
        <button class="vr-btn vr-btn-ghost" id="insp-close">✕</button>
      </div>
      ${sh.clip ? `<video src="${sh.clip}#t=0.5" controls preload="metadata"
                    ${sh.poster ? `poster="${sh.poster}"` : ""}></video>` : ""}
      <label style="margin-top:12px">Prompt
        <textarea id="insp-prompt">${esc(sh.prompt)}</textarea>
      </label>
      <div class="vr-chips" id="insp-chips"></div>
      <div class="vr-row" style="align-items:center">
        <button class="vr-btn" id="insp-save">Save</button>
        <button class="vr-btn vr-btn-primary" id="insp-save-retake">Save &amp; Retake (~$${TAKE_EST.toFixed(2)}–${(2 * TAKE_EST).toFixed(2)})</button>
        <button class="vr-btn" id="insp-variations">Suggest variations</button>
      </div>

      <div class="vr-kf-row">
        ${sh.keyframe_url ? `<img id="insp-kf-img" src="${sh.keyframe_url}">` : ""}
        <div style="flex:1">
          <label class="vr-check"><input type="checkbox" id="insp-kf-pin" ${sh.needs_keyframe ? "checked" : ""}>
            Pin composition with keyframe <small>(image-to-video; uncheck for text-to-video + cast sheets)</small></label>
          <div class="vr-row" style="margin-top:8px">
            <input id="insp-reimagine-intent" placeholder="reimagine the keyframe… e.g. 'make it golden hour'">
            <button class="vr-btn" id="insp-reimagine">Reimagine (~$0.20)</button>
          </div>
        </div>
      </div>

      <div class="vr-row" style="align-items:center">
        <button class="vr-btn" id="insp-extend" ${extendable ? "" : "disabled"}
          title="${esc(extReason)}">Extend +8s → (~$2.80–3.20)</button>
        <button class="vr-btn" id="insp-continue">Continue → (new shot)</button>
        <button class="vr-btn" id="insp-exclude">${sh.excluded ? "Include in cut" : "Exclude from cut"}</button>
        <button class="vr-btn" id="insp-up" title="move earlier">↑</button>
        <button class="vr-btn" id="insp-down" title="move later">↓</button>
      </div>
      <div id="insp-continue-row" class="vr-row" hidden>
        <textarea id="insp-continue-prompt" placeholder="what happens next…">${esc(sh.prompt)}</textarea>
        <button class="vr-btn vr-btn-primary" id="insp-continue-go">Create sequel shot</button>
      </div>

      <h3 style="margin:14px 0 4px">Takes</h3>
      <table class="vr-takes"><tr><th>#</th><th>status</th><th>qc</th><th>notes</th><th>age</th><th></th></tr>
        ${data.takes.map((t) => `<tr><td>${t.n}</td><td>${t.status}</td><td>${t.qc ?? ""}</td>
          <td>${esc(t.qc_notes || t.status === "filtered" ? (t.qc_notes || "content filter") : "")}</td>
          <td>${t.age_h != null ? t.age_h + "h" : ""}</td>
          <td>${t.clip ? `<a href="${t.clip}" target="_blank">⏵</a>` : ""}</td></tr>`).join("")}
      </table>
      <div class="vr-caption">Retaking a shot erases its take history and stored video URIs.</div>`;

    // wiring
    $("insp-close").onclick = closeInspector;
    const getPrompt = () => $("insp-prompt").value.trim();

    $("insp-save").onclick = async () => {
      await patchShot(sh.id, { veo_prompt: getPrompt() });
      toast("Prompt saved");
    };
    $("insp-save-retake").onclick = async () => {
      await patchShot(sh.id, { veo_prompt: getPrompt() });
      await act(`/projects/${current}/retake`, { shot_ids: [sh.id] });
      toast("Retaking " + sh.id);
      closeInspector();
    };
    $("insp-variations").onclick = async (e) => {
      e.target.disabled = true;
      try {
        const { variations } = await act(`/projects/${current}/shots/${sh.id}/variations`);
        const chips = $("insp-chips");
        chips.innerHTML = "";
        variations.forEach((v) => {
          const c = document.createElement("button");
          c.className = "vr-chip";
          c.textContent = v.label;
          c.title = v.prompt;
          c.onclick = () => {
            const ta = $("insp-prompt");
            if (lastChipText && ta.value.endsWith(lastChipText)) {
              ta.value = ta.value.slice(0, -lastChipText.length).trimEnd();
            }
            lastChipText = "\n" + v.prompt;
            ta.value = ta.value + lastChipText;
          };
          chips.appendChild(c);
        });
      } finally { e.target.disabled = false; }
    };
    $("insp-kf-pin").onchange = async (e) => {
      await patchShot(sh.id, { needs_keyframe: e.target.checked });
      toast(e.target.checked ? "Keyframe pinned" : "Unpinned — will render text-to-video");
    };
    $("insp-reimagine").onclick = async (e) => {
      const intent = $("insp-reimagine-intent").value.trim();
      if (!intent) { toast("Describe the change first", "error"); return; }
      e.target.disabled = true;
      e.target.textContent = "Reimagining…";
      try {
        const res = await act(`/projects/${current}/shots/${sh.id}/reimagine-keyframe`, { intent });
        toast("Keyframe reimagined");
        openInspector(sh.id);
      } finally { e.target.disabled = false; e.target.textContent = "Reimagine (~$0.20)"; }
    };
    $("insp-extend").onclick = async (e) => {
      e.target.disabled = true;
      e.target.textContent = "Extending… (~1 min)";
      try {
        const res = await act(`/projects/${current}/shots/${sh.id}/extend`);
        toast(`Extended into ${res.new_shot_id}` +
              (res.method === "chain" ? " (last-frame chain, 1080p)" : " (seamless, 720p)") +
              (res.parent_excluded ? " — parent auto-excluded (extension contains it)" : ""));
        renderShots(true);
        openInspector(res.new_shot_id);
      } catch { e.target.disabled = false; e.target.textContent = "Extend +8s → (~$2.80–3.20)"; }
    };
    $("insp-continue").onclick = () => { $("insp-continue-row").hidden = !$("insp-continue-row").hidden; };
    $("insp-continue-go").onclick = async () => {
      const p = $("insp-continue-prompt").value.trim();
      if (p.length < 8) { toast("Describe what happens next", "error"); return; }
      const res = await act(`/projects/${current}/shots/${sh.id}/continue`, { prompt: p });
      toast(`Sequel shot ${res.new_shot_id} created — review, then Save & Retake`);
      renderShots(true);
      openInspector(res.new_shot_id);
    };
    $("insp-exclude").onclick = async () => {
      await patchShot(sh.id, { excluded: !sh.excluded });
      renderShots(true);
      openInspector(sh.id);
    };
    $("insp-up").onclick = () => moveShot(sh.id, "up");
    $("insp-down").onclick = () => moveShot(sh.id, "down");
  }

  async function patchShot(id, body) {
    try {
      return await api(`/projects/${current}/shots/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    } catch (e) { toast(e.message, "error"); throw e; }
  }

  async function moveShot(id, direction) {
    try {
      await api(`/projects/${current}/shots/${id}/move`, { method: "POST", body: JSON.stringify({ direction }) });
      renderShots(true);
      openInspector(id);
    } catch (e) { toast(e.message, "error"); }
  }

  $("vr-modal").addEventListener("click", (e) => { if (e.target.id === "vr-modal") closeInspector(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("vr-modal").hidden) closeInspector(); });

  // ---------- assets panel (cast & locations) ----------
  async function loadAssets() {
    if (!current) return;
    let assets;
    try { ({ assets } = await api(`/projects/${current}/assets`)); } catch { return; }
    $("cast-panel").hidden = !assets.length;
    const grid = $("asset-grid");
    grid.innerHTML = "";
    assets.forEach((a) => {
      const card = document.createElement("div");
      card.className = "vr-card vr-asset-drop";
      const flagged = a.likeness && a.likeness.resembles && a.likeness.confidence >= 6;
      card.innerHTML =
        (a.url ? `<img src="${a.url}" style="width:100%;border-radius:6px">` : "") +
        `<h4>${a.name} <span class="preset">${a.kind}</span>
           ${flagged ? `<span class="vr-badge-like">≈ ${a.likeness.who}</span>` : ""}</h4>
         <div class="vr-row" style="margin-top:6px">
           <input class="asset-tweak" placeholder="tweak… e.g. 'older, silver glasses'">
         </div>
         <div class="vr-row">
           <button class="vr-btn asset-regen">Regenerate (~$0.15)</button>
           <button class="vr-btn asset-upload">Upload…</button>
         </div>
         <div class="vr-caption">drop an image here to replace</div>`;

      const doUpload = async (file) => {
        if (!file || !file.type.startsWith("image/")) { toast("Not an image", "error"); return; }
        const b64 = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.onerror = rej;
          fr.readAsDataURL(file);
        });
        await act(`/projects/${current}/assets/${a.id}/upload`, { image_b64: b64 });
        toast(`${a.name} sheet replaced`);
        afterSheetChange(a);
      };

      card.querySelector(".asset-regen").onclick = async (e) => {
        e.target.disabled = true;
        e.target.textContent = "Regenerating…";
        try {
          await act(`/projects/${current}/assets/${a.id}/regenerate`,
                    { tweak: card.querySelector(".asset-tweak").value.trim() });
          toast(`${a.name} sheet regenerated`);
          afterSheetChange(a);
        } finally { e.target.disabled = false; e.target.textContent = "Regenerate (~$0.15)"; }
      };
      card.querySelector(".asset-upload").onclick = () => {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "image/*";
        inp.onchange = () => doUpload(inp.files[0]);
        inp.click();
      };
      card.addEventListener("dragover", (e) => { e.preventDefault(); card.classList.add("dragging"); });
      card.addEventListener("dragleave", () => card.classList.remove("dragging"));
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        card.classList.remove("dragging");
        doUpload(e.dataTransfer.files[0]);
      });
      grid.appendChild(card);
    });
  }

  async function afterSheetChange(a) {
    await loadAssets();
    try {
      const res = await api(`/projects/${current}/assets/${a.id}/reset-keyframes`, { method: "POST" });
      if (res.count &&
          confirm(`${res.count} shots use ${a.name}. Regenerate their keyframes now (~$${(res.count * 0.15).toFixed(2)})?`)) {
        await act(`/projects/${current}/keyframes`);
        toast(`Regenerating ${res.count} keyframes…`);
      }
    } catch (e) { toast(e.message, "error"); }
  }

  // ---------- project open / new ----------
  function showNew() {
    current = null;
    history.replaceState(null, "", location.pathname + location.search);
    $("view-new").hidden = false;
    $("view-project").hidden = true;
    clearTimeout(pollTimer);
    loadProjects();
  }

  async function openProject(slug) {
    current = slug;
    history.replaceState(null, "", "#project=" + slug);
    selectedShots.clear();
    shotCards.clear();
    shotsSig = actionsSig = null;
    prevState = null;
    $("shot-grid").innerHTML = "";
    $("view-new").hidden = true;
    $("view-project").hidden = false;
    updateRetakeBtn();
    startPolling(true);
    loadAssets();
    loadProjects();
  }

  async function loadProjects() {
    const { projects } = await api("/projects");
    const ul = $("project-list");
    ul.innerHTML = "";
    projects.forEach((p) => {
      const li = document.createElement("li");
      li.className = p.slug === current ? "active" : "";
      li.innerHTML = `${p.title || p.slug}<span class="st">${p.state} · $${p.spent}</span>`;
      li.onclick = () => openProject(p.slug);
      ul.appendChild(li);
    });
  }

  async function loadTemplates() {
    const { templates } = await api("/templates");
    const grid = $("template-grid");
    grid.innerHTML = "";
    templates.forEach((t) => {
      const card = document.createElement("div");
      card.className = "vr-card template";
      card.innerHTML = `<h4>${t.name.replaceAll("_", " ")}</h4>
        <div class="notes">${t.summary || ""}</div>
        <span class="preset">${t.tape_preset || "clean"}</span>
        <span class="preset">${t.shots} clips</span>`;
      card.onclick = () => createProject(t.name);
      grid.appendChild(card);
    });
  }

  async function createProject(fromTemplate) {
    const body = {
      prompt: $("new-prompt").value.trim(),
      template: fromTemplate || "",
      clips: +$("new-clips").value,
      consistent_characters: $("new-chars").checked,
      tape_preset: $("new-preset").value,
      aspect: $("new-aspect").value,
      budget_usd: +$("new-budget").value,
      full_auto: $("new-auto").checked,
    };
    $("btn-create").disabled = true;
    $("btn-create").textContent = "Writing brief…";
    try {
      const res = await api("/projects", { method: "POST", body: JSON.stringify(body) });
      toast(`Brief ready: "${res.brief.title_hint || res.slug}" — est ~$${res.estimated_usd}`);
      await loadProjects();
      openProject(res.slug);
    } catch (e) {
      $("create-result").hidden = false;
      $("create-result").textContent = "✗ " + e.message;
    } finally {
      $("btn-create").disabled = health.hosted;
      $("btn-create").textContent = "Write brief";
    }
  }

  // ---------- boot ----------
  async function boot() {
    try {
      health = await api("/health");
      $("vr-health").textContent =
        (health.ffmpeg ? "ffmpeg ✓" : "ffmpeg ✗ (no tape post)") +
        (health.api_key ? " · key ✓" : " · key ✗") +
        (health.rails ? " · rails on" : " · rails OFF");
      if (health.hosted) {
        $("hosted-note").hidden = false;
        $("btn-create").disabled = true;
      }
    } catch { $("vr-health").textContent = "backend unreachable"; }
    loadProjects();
    loadTemplates();
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const qs = new URLSearchParams(location.search);
    if (hash.get("project")) { openProject(hash.get("project")); return; }
    if (qs.get("prompt")) $("new-prompt").value = qs.get("prompt");
    if (qs.get("clips")) $("new-clips").value = qs.get("clips");
    if (qs.get("preset")) $("new-preset").value = qs.get("preset");
    if (qs.get("budget")) $("new-budget").value = qs.get("budget");
    if (qs.get("chars") === "1") $("new-chars").checked = true;
    showNew();
  }

  // ---------- wiring ----------
  $("btn-new").onclick = showNew;
  $("btn-create").onclick = () => createProject("");
  $("btn-refresh").onclick = () => startPolling(true);
  $("btn-stop").onclick = () => act(`/projects/${current}/stop`).then(() => toast("Farm draining…"));
  $("chk-lowqc").onchange = applyFilter;
  $("btn-retake").onclick = async () => {
    await act(`/projects/${current}/retake`, { shot_ids: [...selectedShots] });
    selectedShots.clear();
    updateRetakeBtn();
  };
  $("btn-restyle").onclick = async () => {
    const direction = $("restyle-input").value.trim();
    if (!direction) return;
    if (!confirm("Restyle rewrites every prompt and re-renders ALL clips. Continue?")) return;
    await act(`/projects/${current}/restyle`, { direction });
    $("restyle-input").value = "";
  };
  $("btn-extend-shots").onclick = async () => {
    const count = +$("extend-count").value || 5;
    const direction = $("extend-direction").value.trim();
    await act(`/projects/${current}/extend-shots`, { count, direction });
    toast(`Writing ${count} new shots…`);
    $("extend-row").hidden = true;
  };

  // expose for later steps
  window._vr = { openProject, openInspector, loadAssets, act, api, toast, startPolling,
                 get current() { return current; }, RATES, TAKE_EST, EXT_EST };

  boot();
})();
