// QR generation and saved-anchor management extracted from app.js for maintainability.

  function buildQrPayload() {
    const x = Number($("xValue").value || 0);
    const y = Number($("yValue").value || 0);
    const heading = normalizeHeadingValue($("headingValueInput").value);
    if (heading === null) return `INDOOR_ANCHOR:${x},${y}`;
    return `INDOOR_ANCHOR:${x},${y},${heading}`;
  }

  function qrUrl(text) {
    return "https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=" + encodeURIComponent(text);
  }
  function fillQrInputsFromCurrentPose() {
    const pose = latestPose();
    const heading = normalizeAngle((state.orientation?.heading ?? pose?.heading ?? 0) || 0);
    const xInput = $("xValue");
    const yInput = $("yValue");
    const hInput = $("headingValueInput");
    if (xInput) xInput.value = fmt(pose?.x || 0, 2);
    if (yInput) yInput.value = fmt(pose?.y || 0, 2);
    if (hInput) hInput.value = fmt(heading, 1);
  }

  function prefillQrAnchorFromCurrentPose() {
    fillQrInputsFromCurrentPose();
    generateQr();
  }

  function generateQr() {
    const payload = buildQrPayload();
    const nameInput = $("anchorName");
    const payloadText = $("payloadText");
    const payloadPreview = $("payloadPreview");
    const anchorTitle = $("anchorTitle");
    const qrImage = $("qrImage");
    const btnDownloadQr = $("btnDownloadQr");
    const name = nameInput?.value.trim() || "未命名校正點";
    const qrHref = qrUrl(payload);
    if (payloadText) payloadText.value = payload;
    if (payloadPreview) payloadPreview.textContent = payload;
    if (anchorTitle) anchorTitle.textContent = name;
    if (qrImage) qrImage.src = qrHref;
    if (btnDownloadQr) {
      btnDownloadQr.href = qrHref;
      btnDownloadQr.download = (name.replace(/[^\w\u4e00-\u9fff-]+/g, "_") || "indoor-anchor") + ".png";
    }
  }


  function loadSavedAnchors() {
    try {
      state.savedAnchors = loadJsonArrayStorage(STORAGE_KEYS.savedAnchors);
    } catch (e) {
      state.savedAnchors = [];
    }
    renderSavedAnchors();
  }

  function persistSavedAnchors() {
    saveJsonStorage(STORAGE_KEYS.savedAnchors, state.savedAnchors);
    renderSavedAnchors();
  }


  function exportSavedAnchors() {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      anchors: state.savedAnchors
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `indoor-anchors-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("已匯出校正點清單 JSON。");
  }

  async function importSavedAnchorsFromFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const anchors = Array.isArray(data) ? data : data.anchors;
      if (!Array.isArray(anchors)) {
        throw new Error("JSON 格式不正確，找不到 anchors 陣列。");
      }
      const normalized = anchors
        .map((a, idx) => ({
          id: a.id || ((crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + idx)),
          name: a.name || `校正點 ${idx + 1}`,
          x: Number(a.x ?? 0),
          y: Number(a.y ?? 0),
          heading: a.heading == null || a.heading === "" ? null : Number(a.heading),
          payload: a.payload || `INDOOR_ANCHOR:${Number(a.x ?? 0)},${Number(a.y ?? 0)}${a.heading == null || a.heading === "" ? "" : "," + Number(a.heading)}`,
          createdAt: a.createdAt || new Date().toISOString()
        }))
        .filter((a) => Number.isFinite(a.x) && Number.isFinite(a.y));

      state.savedAnchors = normalized;
      persistSavedAnchors();
      setMessage(`已匯入 ${normalized.length} 個校正點。`);
    } catch (e) {
      alert("匯入失敗：" + e.message);
    }
  }


  function currentAnchorDraft() {
    const name = $("anchorName").value.trim() || "未命名校正點";
    const x = Number($("xValue").value || 0);
    const y = Number($("yValue").value || 0);
    const heading = normalizeHeadingValue($("headingValueInput").value);
    return {
      id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
      name,
      x,
      y,
      heading,
      payload: buildQrPayload(),
      createdAt: new Date().toISOString()
    };
  }

  function saveCurrentAnchor() {
    const anchors = state.anchors.saved;
    const draft = currentAnchorDraft();
    const exists = anchors.findIndex(a => a.name === draft.name);
    if (exists >= 0) {
      anchors[exists] = draft;
    } else {
      anchors.unshift(draft);
    }
    persistSavedAnchors();
    setMessage(`已儲存校正點：${draft.name}`);
  }

  function deleteSavedAnchor(id) {
    state.savedAnchors = state.savedAnchors.filter(a => a.id !== id);
    persistSavedAnchors();
  }

  function useSavedAnchor(id) {
    const a = state.savedAnchors.find(x => x.id === id);
    if (!a) return;
    $("anchorName").value = a.name || "";
    $("xValue").value = a.x;
    $("yValue").value = a.y;
    $("headingValueInput").value = a.heading == null ? "" : a.heading;
    generateQr();
    switchPage("qrPage");
  }

  function renderSavedAnchors() {
    const el = $("anchorList");
    const anchors = state.anchors.saved;
    if (!el) return;
    if (!anchors.length) {
      el.innerHTML = '<div class="item">尚未儲存任何校正點。</div>';
      return;
    }
    el.innerHTML = anchors.map((a) => `
      <div class="item">
        <div class="item-top">
          <strong>${a.name}</strong>
          <span class="badge">${a.heading == null ? "無方向" : a.heading + "°"}</span>
        </div>
        <div>x: ${a.x} / y: ${a.y}</div><div style="color:#64748b; font-size:12px;">來源：${a.source === "current-pose" ? "目前位置" : (a.source || "manual")}${a.gps?.accuracy ? " / GPS ±" + fmt(a.gps.accuracy,1) + "m" : ""}</div>
        <div style="margin-top:6px; font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:12px; color:#475569; word-break:break-all;">${a.payload}</div>
        <div class="btns" style="margin-top:10px; margin-bottom:0;">
          <button data-anchor-use="${a.id}">載入</button>
          <button data-anchor-nav="${a.id}">在導航頁查看</button>
          <button data-anchor-waypoint="${a.id}">加入路徑</button>
          <button data-anchor-correct="${a.id}">校正目前位置</button>
          <button data-anchor-copy="${a.id}">複製內容</button>
          <button data-anchor-map="${a.id}">同步到地圖</button>
          <button data-anchor-del="${a.id}" class="danger">刪除</button>
        </div>
      </div>
    `).join("");

    el.querySelectorAll("[data-anchor-use]").forEach(btn => {
      btn.addEventListener("click", () => useSavedAnchor(btn.getAttribute("data-anchor-use")));
    });
    el.querySelectorAll("[data-anchor-copy]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const a = anchors.find(x => x.id === btn.getAttribute("data-anchor-copy"));
        if (!a) return;
        try {
          await navigator.clipboard.writeText(a.payload);
          alert("已複製 QR 內容");
        } catch (e) {
          alert("複製失敗");
        }
      });
    });
    el.querySelectorAll("[data-anchor-nav]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.showAnchorOverlay = true;
        state.navTargetId = btn.getAttribute("data-anchor-nav");
        state.activeLegIndex = 0;
        state.arrivedTarget = false;
        state.lastArrivalNoticeKey = "";
        resetRouteProgressBaseline();
        switchPage("navPage");
        setMessage("已切到導航頁，並設為目前目標。");
        render();
      });
    });
    el.querySelectorAll("[data-anchor-del]").forEach(btn => {
      btn.addEventListener("click", () => deleteSavedAnchor(btn.getAttribute("data-anchor-del")));
    });
    el.querySelectorAll("[data-anchor-map]").forEach(btn => {
      btn.addEventListener("click", () => syncAnchorToMapById(btn.getAttribute("data-anchor-map")));
    });
    el.querySelectorAll("[data-anchor-waypoint]").forEach(btn => {
      btn.addEventListener("click", () => addWaypointFromList(btn.getAttribute("data-anchor-waypoint")));
    });
    el.querySelectorAll("[data-anchor-correct]").forEach(btn => {
      btn.addEventListener("click", () => applyAnchorCorrection(btn.getAttribute("data-anchor-correct")));
    });
  }
