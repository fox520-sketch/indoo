(() => {
  const { STORAGE_KEYS, loadJsonArrayStorage, saveJsonStorage, loadNumberStorage } = window.IndoorNavStorage;
  const SAMPLE_MS = 250;
  const POSITION_SAMPLE_SECONDS = 6;
  const HEADING_SAMPLE_SECONDS = 4;
  const DEFAULT_STEP_METERS = 0.72;
  const STEP_THRESHOLD = 1.15;
  const STEP_DEBOUNCE_MS = 320;
  const STEP_SMOOTHING = 0.22;
  const MIN_GPS_ACCURACY_METERS = 20;
  const QR_TARGET_PREFIX = "INDOOR_ANCHOR:";
  const TRACK_SIZE = 560;
  const CENTER = TRACK_SIZE / 2;
  const DEFAULT_CANVAS_SCALE = 1;
  const DEFAULT_VIEW_SCALE = 1;
  const MIN_VIEW_SCALE = 0.01; // v16
  const MAX_VIEW_SCALE = 4.8;
  const DEFAULT_WORLD_SCALE = 8;

  const state = {
    permissionState: "idle",
    tracking: false,
    message: "先授權感測器與定位，再開始追蹤。",
    anchor: null,
    geoReading: null,
    orientation: { heading: 0, supported: false },
    motion: { ax: 0, ay: 0, az: 0, supported: false },
    positionSampleMode: false,
    headingSampleMode: false,
    positionSamples: [],
    headingSamples: [],
    trail: [{ x: 0, y: 0, heading: 0, t: Date.now() }],
    currentPose: { x: 0, y: 0, heading: 0 },
    filteredPose: { x: 0, y: 0, heading: 0 },
    poseSmoothingAlpha: 0.22,
    poseSmoothingPreset: "balanced",
    corrections: [],
    importedTracks: [],
    stepCount: 0,
    stepLength: DEFAULT_STEP_METERS,
    lastStepAt: 0,
    motionMagnitude: 0,
    smoothedMagnitude: 0,
    exportUrl: "",
    calibratingStepLength: false,
    stepCalStart: 0,
    qrScanMode: false,
    qrStream: null,
    savedAnchors: [],
    showAnchorOverlay: true,
    navTargetId: "",
    routeMode: "direct",
    waypointIds: [],
    arrivalThreshold: 2.0,
    activeLegIndex: 0,
    arrivedTarget: false,
    lastArrivalNoticeKey: "",
    voiceGuideEnabled: true,
    currentGuidanceText: "尚未開始導航。",
    lastSpokenText: "",
    lastTurnCueKey: "",
    startedRouteDistance: 0,
    averageWalkingSpeed: 1.15,
    navSessionState: "idle",
    navSessionStartedAt: null,
    navSessionPausedAt: null,
    navPauseAccumulatedMs: 0,
    navHistory: [],
    mapElements: [],
    editorMode: "idle",
    editorDraftPoints: [],
    editorMessage: "先選編輯模式，再點擊畫布建立地圖元素。",
    showMapOverlay: true,
    selectedMapElementId: "",
    plannedRoutePoints: [],
    snapEnabled: true,
    autoIntersectEnabled: true,
    snapThreshold: 1.2,
    navViewport: { scale: DEFAULT_VIEW_SCALE, panX: 0, panY: 0, minScale: MIN_VIEW_SCALE, maxScale: MAX_VIEW_SCALE },
    editorViewport: { scale: DEFAULT_VIEW_SCALE, panX: 0, panY: 0, minScale: MIN_VIEW_SCALE, maxScale: MAX_VIEW_SCALE },
    autoStepCalibration: {
      enabled: true,
      windowStart: null,
      lastEstimate: null
    },
    lastGeoCorrectionAt: 0,
    anchorCreationMode: false,
    gpsAnchorSampling: false,
    navAutoFit: true,
    navFollowCurrent: true
  };

  defineStateNamespaces(state);


  function defineStateNamespaces(state) {
    const mapAliases = (target, mapping) => {
      Object.entries(mapping).forEach(([alias, source]) => {
        Object.defineProperty(target, alias, {
          get() { return state[source]; },
          set(value) { state[source] = value; },
          enumerable: true,
          configurable: true
        });
      });
      return target;
    };

    state.pose = mapAliases({}, {
      anchor: "anchor",
      geoReading: "geoReading",
      trail: "trail",
      current: "currentPose",
      filtered: "filteredPose",
      smoothingAlpha: "poseSmoothingAlpha",
      corrections: "corrections",
      importedTracks: "importedTracks",
      stepCount: "stepCount",
      stepLength: "stepLength",
      motionMagnitude: "motionMagnitude",
      smoothedMagnitude: "smoothedMagnitude",
      calibratingStepLength: "calibratingStepLength",
      stepCalStart: "stepCalStart",
      autoStepCalibration: "autoStepCalibration",
      lastGeoCorrectionAt: "lastGeoCorrectionAt"
    });

    state.navigation = mapAliases({}, {
      targetId: "navTargetId",
      routeMode: "routeMode",
      waypointIds: "waypointIds",
      arrivalThreshold: "arrivalThreshold",
      activeLegIndex: "activeLegIndex",
      arrivedTarget: "arrivedTarget",
      lastArrivalNoticeKey: "lastArrivalNoticeKey",
      voiceGuideEnabled: "voiceGuideEnabled",
      currentGuidanceText: "currentGuidanceText",
      lastSpokenText: "lastSpokenText",
      lastTurnCueKey: "lastTurnCueKey",
      startedRouteDistance: "startedRouteDistance",
      averageWalkingSpeed: "averageWalkingSpeed",
      sessionState: "navSessionState",
      sessionStartedAt: "navSessionStartedAt",
      sessionPausedAt: "navSessionPausedAt",
      pauseAccumulatedMs: "navPauseAccumulatedMs",
      history: "navHistory",
      plannedRoutePoints: "plannedRoutePoints",
      autoFit: "navAutoFit",
      followCurrent: "navFollowCurrent",
      viewport: "navViewport"
    });

    state.editor = mapAliases({}, {
      mode: "editorMode",
      draftPoints: "editorDraftPoints",
      message: "editorMessage",
      showMapOverlay: "showMapOverlay",
      selectedMapElementId: "selectedMapElementId",
      mapElements: "mapElements",
      snapEnabled: "snapEnabled",
      autoIntersectEnabled: "autoIntersectEnabled",
      snapThreshold: "snapThreshold",
      viewport: "editorViewport",
      anchorCreationMode: "anchorCreationMode"
    });

    state.anchors = mapAliases({}, {
      saved: "savedAnchors",
      showOverlay: "showAnchorOverlay",
      gpsAnchorSampling: "gpsAnchorSampling"
    });

    state.ui = mapAliases({}, {
      permissionState: "permissionState",
      tracking: "tracking",
      message: "message",
      exportUrl: "exportUrl",
      qrScanMode: "qrScanMode",
      qrStream: "qrStream",
      positionSampleMode: "positionSampleMode",
      headingSampleMode: "headingSampleMode",
      positionSamples: "positionSamples",
      headingSamples: "headingSamples"
    });

    return state;
  }

  let geoWatchId = null;
  let positionTimer = null;
  let headingTimer = null;
  let smoothedMagnitudeRef = 0;
  let lastStepAtRef = 0;
  let navCanvasGesture = null;
  let editorCanvasGesture = null;


  const $ = (id) => document.getElementById(id);
  const canvas = $("trackCanvas");
  const ctx = canvas.getContext("2d");

  function activeCanvasScale(viewport) {
    return DEFAULT_CANVAS_SCALE * (viewport?.scale || 1);
  }

  function ensureCanvasSize(canvasEl, wrapEl) {
    if (!canvasEl || !wrapEl) return;
    const rect = wrapEl.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width - 20));
    const height = Math.max(420, Math.round(rect.height - 20));
    if (canvasEl.width !== width || canvasEl.height !== height) {
      canvasEl.width = width;
      canvasEl.height = height;
    }
  }

  function applyViewportTransform(canvasEl, viewport, zoomChipId) {
    if (zoomChipId && $(zoomChipId) && viewport) {
      $(zoomChipId).textContent = `${Math.round((viewport.scale || 1) * 100)}%`;
    }
  }

  function clampViewport(viewport) {
    viewport.scale = Math.max(viewport.minScale || MIN_VIEW_SCALE, Math.min(viewport.maxScale || MAX_VIEW_SCALE, viewport.scale || 1));
    viewport.panX = Math.max(-8000, Math.min(8000, viewport.panX || 0));
    viewport.panY = Math.max(-8000, Math.min(8000, viewport.panY || 0));
  }

  function screenPointToCanvasRaw(evt, canvasEl) {
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top,
      rect
    };
  }

  function setCompass(needleId, heading) {
    const needle = $(needleId);
    if (!needle) return;
    needle.style.transform = `rotate(${normalizeAngle(heading || 0)}deg)`;
  }

  function refreshViewportUI() {
    applyViewportTransform($("trackCanvas"), state.navViewport, "navZoomChip");
    const navAutoFitBtn = $("btnNavAutoFit");
    if (navAutoFitBtn) navAutoFitBtn.textContent = `回正 ${state.navAutoFit ? "開" : "關"}`;
    const navFollowBtn = $("btnNavFollow");
    if (navFollowBtn) navFollowBtn.textContent = `跟隨 ${state.navFollowCurrent ? "開" : "關"}`;
    applyViewportTransform($("editorCanvas"), state.editorViewport, "editorZoomChip");
    setCompass("navCompassNeedle", state.orientation.heading || latestPose().heading || 0);
    setCompass("editorCompassNeedle", state.orientation.heading || latestPose().heading || 0);
    updateFullscreenButtons();
    drawTrack();
    drawEditorCanvas();
  }

  function markViewportManual(viewport) {
    if (!viewport) return;
    viewport.lastManualAt = Date.now();
  }

  function getWrapRect(wrapEl) {
    const rect = wrapEl?.getBoundingClientRect?.();
    return {
      width: Math.max(320, Math.round((rect?.width || TRACK_SIZE) - 20)),
      height: Math.max(420, Math.round((rect?.height || TRACK_SIZE) - 20))
    };
  }

  function getBasePixelsPerWorld(wrapEl) {
    return {
      x: DEFAULT_WORLD_SCALE,
      y: DEFAULT_WORLD_SCALE
    };
  }

  function viewportWorldToScreen(point, viewport, wrapEl) {
    const rect = getWrapRect(wrapEl);
    const base = getBasePixelsPerWorld(wrapEl);
    return {
      x: rect.width / 2 + (viewport?.panX || 0) + Number(point?.x || 0) * base.x * (viewport?.scale || 1),
      y: rect.height / 2 + (viewport?.panY || 0) + Number(point?.y || 0) * base.y * (viewport?.scale || 1)
    };
  }

  function viewportScreenToWorld(screenPoint, viewport, wrapEl) {
    const rect = getWrapRect(wrapEl);
    const base = getBasePixelsPerWorld(wrapEl);
    return {
      x: (Number(screenPoint?.x || 0) - rect.width / 2 - (viewport?.panX || 0)) / Math.max(base.x * (viewport?.scale || 1), 0.001),
      y: (Number(screenPoint?.y || 0) - rect.height / 2 - (viewport?.panY || 0)) / Math.max(base.y * (viewport?.scale || 1), 0.001)
    };
  }

  function normalizeBounds(bounds) {
    if (!bounds || !Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxX) || !Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxY)) {
      return { minX: -4, maxX: 4, minY: -4, maxY: 4 };
    }
    if (bounds.minX === bounds.maxX) {
      bounds.minX -= 2;
      bounds.maxX += 2;
    }
    if (bounds.minY === bounds.maxY) {
      bounds.minY -= 2;
      bounds.maxY += 2;
    }
    return bounds;
  }

  function collectNavWorldBounds() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const addPoint = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, Number(x));
      minY = Math.min(minY, Number(y));
      maxX = Math.max(maxX, Number(x));
      maxY = Math.max(maxY, Number(y));
    };

    state.trail.forEach((p) => addPoint(p.x, p.y));
    const pose = latestPose();
    addPoint(pose.x, pose.y);
    state.savedAnchors.forEach((a) => addPoint(a.x, a.y));
    state.plannedRoutePoints.forEach((p) => addPoint(p.x, p.y));
    (state.importedTracks || []).forEach((track) => track.points.forEach((p) => addPoint(p.x, p.y)));
    state.mapElements.forEach((el) => {
      if (el.type === "point") {
        addPoint(el.x, el.y);
      } else if (Array.isArray(el.points)) {
        el.points.forEach((p) => addPoint(p.x, p.y));
      }
    });

    return normalizeBounds({ minX, minY, maxX, maxY });
  }

  function fitViewportToBounds(viewport, bounds, wrapEl, padding = 48) {
    if (!viewport || !wrapEl) return;
    const normalized = normalizeBounds({ ...bounds });
    const rect = getWrapRect(wrapEl);
    const base = getBasePixelsPerWorld(wrapEl);
    const worldWidth = Math.max(normalized.maxX - normalized.minX, 8);
    const worldHeight = Math.max(normalized.maxY - normalized.minY, 8);

    const insetLeft = Math.max(22, rect.width * 0.05);
    const insetRight = Math.max(92, rect.width * 0.18);
    const insetTop = Math.max(96, rect.height * 0.14);
    const insetBottom = Math.max(72, rect.height * 0.10);

    const availableWidth = Math.max(rect.width - insetLeft - insetRight, rect.width * 0.28);
    const availableHeight = Math.max(rect.height - insetTop - insetBottom, rect.height * 0.42);

    const scaleX = availableWidth / Math.max(worldWidth * base.x, 1);
    const scaleY = availableHeight / Math.max(worldHeight * base.y, 1);
    viewport.scale = Math.min(
      viewport.maxScale || MAX_VIEW_SCALE,
      Math.max(viewport.minScale || MIN_VIEW_SCALE, Math.min(scaleX, scaleY))
    );

    const centerX = (normalized.minX + normalized.maxX) / 2;
    const centerY = (normalized.minY + normalized.maxY) / 2;

    const safeCenterX = insetLeft + availableWidth / 2;
    const safeCenterY = insetTop + availableHeight / 2;

    viewport.panX = safeCenterX - rect.width / 2 - centerX * base.x * viewport.scale;
    viewport.panY = safeCenterY - rect.height / 2 - centerY * base.y * viewport.scale;
    clampViewport(viewport);
  }

  function ensureNavViewportVisible(forceFit = false) {
    const wrapEl = $("trackCanvasWrap");
    if (!wrapEl) return;
    if (!state.navAutoFit && !forceFit) return;
    const bounds = collectNavWorldBounds();
    const pose = latestPose();
    const rect = getWrapRect(wrapEl);
    const safeMargin = Math.max(40, Math.min(rect.width, rect.height) * 0.12);
    const currentScreen = viewportWorldToScreen(pose, state.navViewport, wrapEl);
    const outsideCurrent = currentScreen.x < safeMargin || currentScreen.x > rect.width - safeMargin || currentScreen.y < safeMargin || currentScreen.y > rect.height - safeMargin;

    const corners = [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
      { x: bounds.minX, y: bounds.maxY }
    ].map((p) => viewportWorldToScreen(p, state.navViewport, wrapEl));
    const minSX = Math.min(...corners.map((p) => p.x));
    const maxSX = Math.max(...corners.map((p) => p.x));
    const minSY = Math.min(...corners.map((p) => p.y));
    const maxSY = Math.max(...corners.map((p) => p.y));
    const boundsOutside = minSX < 12 || maxSX > rect.width - 12 || minSY < 12 || maxSY > rect.height - 12;
    const manualRecently = Date.now() - (state.navViewport.lastManualAt || 0) < 2200;

    if (forceFit || outsideCurrent || (!manualRecently && boundsOutside)) {
      fitViewportToBounds(state.navViewport, bounds, wrapEl, safeMargin);
    }
  }

  function setWrapFullscreenState(wrapEl, active) {
    if (!wrapEl) return;
    wrapEl.classList.toggle("fullscreen-active", Boolean(active));
    document.body.style.overflow = active ? "hidden" : "";
  }

  function isWrapFullscreen(wrapEl) {
    if (!wrapEl) return false;
    return document.fullscreenElement === wrapEl || document.webkitFullscreenElement === wrapEl || wrapEl.classList.contains("fullscreen-active");
  }

  async function toggleWrapFullscreen(wrapId) {
    const wrapEl = $(wrapId);
    if (!wrapEl) return;
    const active = isWrapFullscreen(wrapEl);
    try {
      if (!active) {
        if (wrapEl.requestFullscreen) {
          await wrapEl.requestFullscreen();
        } else if (wrapEl.webkitRequestFullscreen) {
          await wrapEl.webkitRequestFullscreen();
        } else {
          setWrapFullscreenState(wrapEl, true);
        }
      } else if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
      } else {
        setWrapFullscreenState(wrapEl, false);
      }
    } catch (e) {
      setWrapFullscreenState(wrapEl, !active);
    }
    window.setTimeout(() => {
      ensureCanvasSize($("trackCanvas"), $("trackCanvasWrap"));
      ensureCanvasSize($("editorCanvas"), $("editorCanvasWrap"));
      ensureNavViewportVisible(true);
      refreshViewportUI();
    }, 50);
  }

  function updateFullscreenButtons() {
    [
      { wrapId: "trackCanvasWrap", btnId: "btnTrackFullscreen" },
      { wrapId: "editorCanvasWrap", btnId: "btnEditorFullscreen" }
    ].forEach(({ wrapId, btnId }) => {
      const btn = $(btnId);
      const wrapEl = $(wrapId);
      if (!btn || !wrapEl) return;
      btn.textContent = isWrapFullscreen(wrapEl) ? "結束全螢幕" : "全螢幕";
    });
  }

  function attachViewportHandlers(wrapEl, canvasEl, viewport, type) {
    if (!wrapEl || !canvasEl) return;

    wrapEl.addEventListener("wheel", (evt) => {
      evt.preventDefault();
      const delta = evt.deltaY < 0 ? 1.08 : 0.92;
      viewport.scale *= delta;
      clampViewport(viewport);
      markViewportManual(viewport);
      refreshViewportUI();
    }, { passive: false });

    wrapEl.addEventListener("pointerdown", (evt) => {
      if (type === "editor" && state.editorMode !== "idle") return;
      wrapEl.setPointerCapture?.(evt.pointerId);
      const gesture = {
        pointerId: evt.pointerId,
        startX: evt.clientX,
        startY: evt.clientY,
        startPanX: viewport.panX,
        startPanY: viewport.panY
      };
      if (type === "nav") navCanvasGesture = gesture;
      else editorCanvasGesture = gesture;
    });

    wrapEl.addEventListener("pointermove", (evt) => {
      const gesture = type === "nav" ? navCanvasGesture : editorCanvasGesture;
      if (!gesture || gesture.pointerId !== evt.pointerId) return;
      viewport.panX = gesture.startPanX + (evt.clientX - gesture.startX);
      viewport.panY = gesture.startPanY + (evt.clientY - gesture.startY);
      clampViewport(viewport);
      markViewportManual(viewport);
      refreshViewportUI();
    });

    const endGesture = (evt) => {
      const gesture = type === "nav" ? navCanvasGesture : editorCanvasGesture;
      if (!gesture || gesture.pointerId !== evt.pointerId) return;
      if (type === "nav") navCanvasGesture = null;
      else editorCanvasGesture = null;
    };
    wrapEl.addEventListener("pointerup", endGesture);
    wrapEl.addEventListener("pointercancel", endGesture);

    let touchInfo = null;
    wrapEl.addEventListener("touchstart", (evt) => {
      if (evt.touches.length === 2) {
        const [t1, t2] = evt.touches;
        touchInfo = {
          startDistance: Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY),
          startScale: viewport.scale
        };
      }
    }, { passive: true });

    wrapEl.addEventListener("touchmove", (evt) => {
      if (evt.touches.length === 2 && touchInfo) {
        evt.preventDefault();
        const [t1, t2] = evt.touches;
        const distance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        viewport.scale = touchInfo.startScale * (distance / Math.max(touchInfo.startDistance, 1));
        clampViewport(viewport);
        markViewportManual(viewport);
        refreshViewportUI();
      }
    }, { passive: false });

    wrapEl.addEventListener("dblclick", () => {
      viewport.scale = viewport.scale > 1 ? 1 : 1.8;
      if (viewport.scale === 1) {
        viewport.panX = 0;
        viewport.panY = 0;
      }
      clampViewport(viewport);
      markViewportManual(viewport);
      refreshViewportUI();
    });
  }

  function injectEnhancementUI() {
    const navBtnRow = $("btnPosCorrection")?.closest(".big-actions");
    if (navBtnRow && !$("btnGpsAnchorCreate")) {
      const extra = document.createElement("div");
      extra.className = "btns";
      extra.style.marginTop = "10px";
      extra.innerHTML = `
        <button id="btnGpsAnchorCreate" class="secondary">以 GPS 新增標定點</button>
        <button id="btnPoseAnchorCreate" class="secondary">以目前位置新增標定點</button>
        <button id="btnAnchorCorrection" class="secondary">以標定點校正目前位置</button>
        <button id="btnGpsFusionCorrection" class="secondary">以 GPS 柔性校正</button>
      `;
      navBtnRow.parentNode.insertBefore(extra, navBtnRow.nextSibling);
    }

    const navWrap = $("trackCanvasWrap");
    if (navWrap && !$("btnTrackFullscreen")) {
      const action = document.createElement("div");
      action.className = "map-toolbar-row";
      action.innerHTML = `<button id="btnTrackFullscreen" class="map-action-btn" type="button">全螢幕</button><button id="btnNavAutoFit" class="map-action-btn" type="button">回正 開</button><button id="btnNavFollow" class="map-action-btn" type="button">跟隨 開</button><button id="btnNavFitNow" class="map-action-btn" type="button">置中</button>`;
      navWrap.parentNode.insertBefore(action, navWrap.nextSibling);
    }

    const editorWrap = $("editorCanvasWrap");
    if (editorWrap && !$("btnEditorFullscreen")) {
      const action = document.createElement("div");
      action.className = "map-overlay map-action-group";
      action.innerHTML = `<button id="btnEditorFullscreen" class="map-action-btn" type="button">全螢幕</button>`;
      editorWrap.appendChild(action);
    }

    const mapControls = $("btnEditorClear")?.parentElement;
    if (mapControls && !$("btnEditorAnchor")) {
      const btn = document.createElement("button");
      btn.id = "btnEditorAnchor";
      btn.className = "secondary";
      btn.textContent = "新增標定點";
      mapControls.insertBefore(btn, $("btnEditorUndo"));
    }

    const qrForm = $("btnSaveAnchor")?.parentElement;
    if (qrForm && !$("btnUseGpsForDraftAnchor")) {
      const btn = document.createElement("button");
      btn.id = "btnUseGpsForDraftAnchor";
      btn.textContent = "用 GPS 帶入標定點";
      qrForm.insertBefore(btn, $("btnSaveAnchor"));
    }

    const correctionList = $("correctionList");
    if (correctionList && !$("anchorCorrectionSelect")) {
      const box = document.createElement("div");
      box.className = "formbox";
      box.innerHTML = `
        <div class="row">
          <label for="anchorCorrectionSelect">選擇標定點作為目前位置校正</label>
          <select id="anchorCorrectionSelect" style="width:100%; border:1px solid var(--border); border-radius:14px; padding:10px 12px; font-size:15px; background:white;">
            <option value="">請先選擇標定點</option>
          </select>
        </div>
        <div class="subtle" id="autoStepStatus">自動步長估算：尚未取得穩定 GPS 視窗。</div>
      `;
      correctionList.parentNode.insertBefore(box, correctionList);
    }
  }

  function updateAnchorCorrectionSelect() {
    const sel = $("anchorCorrectionSelect");
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = ['<option value="">請先選擇標定點</option>']
      .concat(state.savedAnchors.map(a => `<option value="${a.id}">${a.name} (x:${a.x}, y:${a.y}${a.heading == null ? "" : ", h:" + a.heading})</option>`))
      .join("");
    if (state.savedAnchors.some(a => a.id === current)) sel.value = current;
  }

  function updateAutoStepStatus() {
    const el = $("autoStepStatus");
    if (!el) return;
    const est = state.autoStepCalibration.lastEstimate;
    if (!est) {
      el.textContent = "自動步長估算：尚未取得穩定 GPS 視窗。";
      return;
    }
    el.textContent = `自動步長估算：${fmt(est.stepLength, 2)} m/步，步頻 ${fmt(est.cadence, 2)} 步/秒，來源距離 ${fmt(est.distance, 1)} m。`;
  }

  function sampleCurrentGps(durationMs = 5000) {
    return new Promise((resolve, reject) => {
      if (!state.geoReading) {
        reject(new Error("目前沒有 GPS 讀值"));
        return;
      }
      const startedAt = Date.now();
      const samples = [];
      const timer = setInterval(() => {
        if (state.geoReading) {
          samples.push({ ...state.geoReading });
        }
        if (Date.now() - startedAt >= durationMs) {
          clearInterval(timer);
          const filtered = samples.filter((s) => Number.isFinite(s.accuracy) && s.accuracy <= Math.max(MIN_GPS_ACCURACY_METERS, 25));
          const base = filtered.length >= 3 ? filtered : samples;
          if (!base.length) {
            reject(new Error("沒有收集到 GPS 樣本"));
            return;
          }
          const weights = base.map((s) => 1 / Math.max(s.accuracy || MIN_GPS_ACCURACY_METERS, 1));
          const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
          const avgLat = base.reduce((sum, s, i) => sum + s.lat * weights[i], 0) / weightSum;
          const avgLng = base.reduce((sum, s, i) => sum + s.lng * weights[i], 0) / weightSum;
          const avgAcc = base.reduce((sum, s) => sum + (s.accuracy || 0), 0) / base.length;
          resolve({ lat: avgLat, lng: avgLng, accuracy: avgAcc, sampleCount: base.length });
        }
      }, SAMPLE_MS);
    });
  }

  function ensureGeoAnchorReference() {
    if (!state.anchor && state.geoReading) {
      state.anchor = { lat: state.geoReading.lat, lng: state.geoReading.lng };
    }
  }

  function applyPoseShift(dx, dy) {
    state.trail = state.trail.map(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
    state.currentPose = { ...state.currentPose, x: state.currentPose.x + dx, y: state.currentPose.y + dy };
  }

  function applyHeadingRotation(delta) {
    state.trail = state.trail.map((p) => {
      const rotated = rotatePoint(p, delta);
      return { ...p, x: rotated.x, y: rotated.y, heading: normalizeAngle((p.heading ?? 0) + delta) };
    });
    const rp = rotatePoint(state.currentPose, delta);
    state.currentPose = { ...state.currentPose, x: rp.x, y: rp.y, heading: normalizeAngle((state.currentPose.heading ?? 0) + delta) };
  }

  function applyAnchorCorrection(anchorId) {
    const anchor = state.savedAnchors.find(a => a.id === anchorId);
    if (!anchor) {
      setMessage("請先選擇有效的標定點。");
      return;
    }
    const before = latestPose();
    applyPoseShift(Number(anchor.x || 0) - before.x, Number(anchor.y || 0) - before.y);
    if (anchor.heading != null && Number.isFinite(Number(anchor.heading))) {
      applyHeadingRotation(angleDelta(Number(anchor.heading), before.heading ?? state.currentPose.heading));
    }
    state.corrections.unshift({
      id: crypto.randomUUID(),
      type: "anchor",
      source: "manual-anchor",
      beforeX: before.x,
      beforeY: before.y,
      afterX: Number(anchor.x || 0),
      afterY: Number(anchor.y || 0),
      afterHeading: anchor.heading,
      ts: Date.now()
    });
    setMessage(`已用標定點 ${anchor.name} 校正目前位置。`);
    updateArrivalProgress();
    render();
  }

  async function createAnchorFromGpsDraft() {
    try {
      state.gpsAnchorSampling = true;
      setMessage("GPS 標定點建立中，請稍微站定 5 秒。");
      const sample = await sampleCurrentGps(5000);
      ensureGeoAnchorReference();
      const meters = latLngToMeters(state.anchor, { lat: sample.lat, lng: sample.lng });
      $("xValue").value = meters.x.toFixed(2);
      $("yValue").value = meters.y.toFixed(2);
      $("headingValueInput").value = Math.round(normalizeAngle(state.orientation.heading || latestPose().heading || 0));
      if (!$("anchorName").value.trim()) {
        $("anchorName").value = `GPS 標定點 ${state.savedAnchors.length + 1}`;
      }
      generateQr();
      setMessage(`已用 GPS 帶入標定點座標，accuracy 約 ${fmt(sample.accuracy, 1)} m。`);
    } catch (e) {
      setMessage("建立 GPS 標定點失敗：" + e.message);
    } finally {
      state.gpsAnchorSampling = false;
      render();
    }
  }

  async function createSavedAnchorFromGps() {
    try {
      state.gpsAnchorSampling = true;
      setMessage("以 GPS 建立標定點中，請稍微站定 5 秒。");
      const sample = await sampleCurrentGps(5000);
      ensureGeoAnchorReference();
      const meters = latLngToMeters(state.anchor, { lat: sample.lat, lng: sample.lng });
      const heading = Math.round(normalizeAngle(state.orientation.heading || latestPose().heading || 0));
      const anchor = {
        id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
        name: `GPS 標定點 ${state.savedAnchors.length + 1}`,
        x: Number(meters.x.toFixed(2)),
        y: Number(meters.y.toFixed(2)),
        heading,
        source: "gps",
        gps: { lat: sample.lat, lng: sample.lng, accuracy: sample.accuracy },
        payload: `INDOOR_ANCHOR:${Number(meters.x.toFixed(2))},${Number(meters.y.toFixed(2))},${heading}`,
        createdAt: new Date().toISOString()
      };
      state.savedAnchors.unshift(anchor);
      persistSavedAnchors();
      setMessage(`已建立 GPS 標定點：${anchor.name}。`);
      render();
    } catch (e) {
      setMessage("GPS 標定點建立失敗：" + e.message);
    } finally {
      state.gpsAnchorSampling = false;
      render();
    }
  }

  function applySoftGpsCorrection(sample, source = "gps-soft") {
    if (!sample) return;
    ensureGeoAnchorReference();
    if (!state.anchor) return;
    const measured = latLngToMeters(state.anchor, { lat: sample.lat, lng: sample.lng });
    const before = latestPose();
    const acc = Number(sample.accuracy || MIN_GPS_ACCURACY_METERS);
    const weight = acc <= 6 ? 0.8 : acc <= 10 ? 0.6 : acc <= 15 ? 0.4 : 0.2;
    const dx = (measured.x - before.x) * weight;
    const dy = (measured.y - before.y) * weight;
    applyPoseShift(dx, dy);
    state.lastGeoCorrectionAt = Date.now();
    state.corrections.unshift({
      id: crypto.randomUUID(),
      type: "position",
      source,
      beforeX: before.x,
      beforeY: before.y,
      afterX: before.x + dx,
      afterY: before.y + dy,
      dx, dy,
      accuracy: acc,
      ts: Date.now()
    });
  }

  function updateAutoStepCalibration(sample) {
    if (!sample || !state.autoStepCalibration.enabled) return;
    ensureGeoAnchorReference();
    if (!state.anchor) return;
    const windowState = state.autoStepCalibration;
    const now = Date.now();
    if (!windowState.windowStart) {
      windowState.windowStart = {
        ts: now,
        stepCount: state.stepCount,
        pos: latLngToMeters(state.anchor, { lat: sample.lat, lng: sample.lng }),
        accuracy: sample.accuracy
      };
      return;
    }
    const elapsed = (now - windowState.windowStart.ts) / 1000;
    if (elapsed < 6) return;
    const current = latLngToMeters(state.anchor, { lat: sample.lat, lng: sample.lng });
    const distance = distanceBetween(windowState.windowStart.pos, current);
    const stepsDelta = state.stepCount - windowState.windowStart.stepCount;
    const cadence = stepsDelta / Math.max(elapsed, 0.1);
    const headingDelta = Math.abs(angleDelta(state.orientation.heading || latestPose().heading || 0, latestPose().heading || 0));
    if (distance >= 6 && stepsDelta >= 8 && cadence >= 0.6 && cadence <= 3.2 && Number(sample.accuracy || 999) <= 15 && headingDelta <= 45) {
      const estimated = distance / stepsDelta;
      if (estimated >= 0.35 && estimated <= 1.2) {
        state.stepLength = Number((state.stepLength * 0.8 + estimated * 0.2).toFixed(3));
        state.averageWalkingSpeed = Number((state.averageWalkingSpeed * 0.8 + (distance / elapsed) * 0.2).toFixed(3));
        if ($("stepLength")) $("stepLength").value = String(Math.max(0.4, Math.min(1.0, state.stepLength)));
        windowState.lastEstimate = { stepLength: state.stepLength, cadence, distance, elapsed };
      }
    }
    windowState.windowStart = {
      ts: now,
      stepCount: state.stepCount,
      pos: current,
      accuracy: sample.accuracy
    };
    updateAutoStepStatus();
  }

  function average(nums) {
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  }

  function fmtMetersInt(n) {
    const v = Number(n || 0);
    return Number.isFinite(v) ? String(Math.round(v)) : "0";
  }

function fmt(n, d = 2) {
    return Number.isFinite(n) ? n.toFixed(d) : "-";
  }

  function normalizeAngle(deg) {
    let a = deg % 360;
    if (a < 0) a += 360;
    return a;
  }

  function angleDelta(target, current) {
    let d = normalizeAngle(target) - normalizeAngle(current);
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }

  function rotatePoint(point, deg) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x: point.x * cos - point.y * sin,
      y: point.x * sin + point.y * cos
    };
  }

  function latLngToMeters(anchor, point) {
    if (!anchor || !point) return { x: 0, y: 0 };
    const latScale = 111320;
    const lngScale = 111320 * Math.cos((anchor.lat * Math.PI) / 180);
    return {
      x: (point.lng - anchor.lng) * lngScale,
      y: -(point.lat - anchor.lat) * latScale
    };
  }

  function latestPose() {
    return state.filteredPose || state.trail[state.trail.length - 1] || state.currentPose;
  }

  function rawLatestPose() {
    return state.trail[state.trail.length - 1] || state.currentPose;
  }

  function smoothAngleDeg(prev, next, alpha) {
    const d = angleDelta(next, prev);
    return normalizeAngle(prev + d * alpha);
  }

  function updateFilteredPose() {
    const raw = rawLatestPose();
    if (!raw) return;
    const prev = state.pose.filtered || { x: raw.x || 0, y: raw.y || 0, heading: raw.heading || 0 };
    const alpha = Math.max(0.05, Math.min(0.9, Number(state.pose.smoothingAlpha || 0.22)));
    const filtered = {
      x: Number(prev.x || 0) + (Number(raw.x || 0) - Number(prev.x || 0)) * alpha,
      y: Number(prev.y || 0) + (Number(raw.y || 0) - Number(prev.y || 0)) * alpha,
      heading: smoothAngleDeg(Number(prev.heading || 0), Number(raw.heading || 0), alpha),
      t: raw.t || Date.now()
    };
    state.pose.filtered = filtered;
    return filtered;
  }

  function setMessage(msg) {
    state.message = msg;
    render();
  }

  function gpsBadgeText() {
    const acc = state.geoReading?.accuracy;
    if (!acc) return "無GPS";
    if (acc <= 10) return "GPS佳";
    if (acc <= 25) return "GPS可用";
    return "GPS偏弱";
  }

  function renderCorrections() {
    const box = $("correctionList");
    if (!state.corrections.length) {
      box.innerHTML = `<div class="item">尚未進行校正。建議先在入口設定起點，追蹤後到窗邊做位置校正，再做方向校正。</div>`;
      return;
    }
    box.innerHTML = state.corrections.map((c) => {
      const top = `<div class="item-top"><span class="badge">${c.type}</span><span style="color:#64748b;">${new Date(c.ts).toLocaleTimeString()}</span></div>`;
      if (c.type === "position") {
        return `<div class="item">${top}
          <div>before: (${fmt(c.beforeX)}, ${fmt(c.beforeY)})</div>
          <div>after: (${fmt(c.afterX)}, ${fmt(c.afterY)})</div>
          <div>accuracy: ${fmt(c.accuracy, 1)} m</div>
          <div>samples: ${c.sampleCount ?? "-"}</div>
          <div>offset: dx ${fmt(c.dx)} / dy ${fmt(c.dy)}</div>
        </div>`;
      }
      if (c.type === "heading") {
        return `<div class="item">${top}
          <div>before: ${fmt(c.beforeHeading, 1)}°</div>
          <div>after: ${fmt(c.afterHeading, 1)}°</div>
          <div>delta: ${fmt(c.delta, 1)}°</div>
          <div>samples: ${c.sampleCount ?? "-"}</div>
        </div>`;
      }
      return `<div class="item">${top}
        <div>before: (${fmt(c.beforeX)}, ${fmt(c.beforeY)})</div>
        <div>after: (${fmt(c.afterX)}, ${fmt(c.afterY)})</div>
        ${c.afterHeading != null ? `<div>heading: ${fmt(c.afterHeading, 1)}°</div>` : ``}
      </div>`;
    }).join("");
  }


  function drawGrid(ctx, wrapEl, viewport) {
    const rect = getWrapRect(wrapEl);
    const step = DEFAULT_WORLD_SCALE * (viewport?.scale || 1);
    if (step < 6) return;
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const centerX = rect.width / 2 + (viewport?.panX || 0);
    const centerY = rect.height / 2 + (viewport?.panY || 0);
    for (let x = centerX % step; x <= rect.width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
    }
    for (let y = centerY % step; y <= rect.height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
    }
    ctx.stroke();
  }

  function drawCrosshair(ctx, wrapEl, viewport) {
    const rect = getWrapRect(wrapEl);
    const cx = rect.width / 2 + (viewport?.panX || 0);
    const cy = rect.height / 2 + (viewport?.panY || 0);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, rect.height);
    ctx.moveTo(0, cy);
    ctx.lineTo(rect.width, cy);
    ctx.stroke();
  }

  function lineWidthForWorld(px, viewport) {
    return Math.max(1, px * Math.sqrt(viewport?.scale || 1));
  }

  function fixedRadius(px) {
    return px;
  }

  function labelBox(ctx, x, y, label, fg = "#334155") {
    const metrics = ctx.measureText(label);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillRect(x - 4, y - 12, metrics.width + 8, 18);
    ctx.fillStyle = fg;
    ctx.fillText(label, x, y);
  }

  function drawMapElementsOnCanvas(ctx, withLabels = true, viewport = state.navViewport, wrapEl = $("trackCanvasWrap")) {
    if (!state.showMapOverlay || !state.mapElements.length) return;

    state.mapElements.slice().reverse().forEach((el) => {
      const isSelected = el.id === state.selectedMapElementId;
      const semantic = el.semantic || "walkable";
      if (el.type === "point") {
        const pt = viewportWorldToScreen({ x: Number(el.x || 0), y: Number(el.y || 0) }, viewport, wrapEl);
        ctx.fillStyle = isSelected ? "#ef4444" : (semantic === "landmark" ? "#0ea5e9" : semantic === "restricted" ? "#f59e0b" : "#059669");
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, fixedRadius(5), 0, Math.PI * 2);
        ctx.fill();
        if (withLabels) {
          ctx.fillStyle = "#065f46";
          ctx.font = "12px system-ui, sans-serif";
          labelBox(ctx, pt.x + 8, pt.y - 8, el.name || "point", "#065f46");
        }
      } else if (el.type === "line" && Array.isArray(el.points) && el.points.length >= 2) {
        ctx.strokeStyle = isSelected ? "#ef4444" : (semantic === "wall" ? "#111827" : semantic === "restricted" ? "#f59e0b" : "#7c3aed");
        ctx.lineWidth = semantic === "wall" ? lineWidthForWorld(5, viewport) : lineWidthForWorld(isSelected ? 4 : 3, viewport);
        ctx.beginPath();
        el.points.forEach((p, i) => {
          const pt = viewportWorldToScreen({ x: Number(p.x || 0), y: Number(p.y || 0) }, viewport, wrapEl);
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
        if (withLabels) {
          const midIdx = Math.floor(el.points.length / 2);
          const mid = el.points[midIdx] || el.points[0];
          const pt = viewportWorldToScreen({ x: Number(mid.x || 0), y: Number(mid.y || 0) }, viewport, wrapEl);
          ctx.font = "12px system-ui, sans-serif";
          labelBox(ctx, pt.x + 8, pt.y - 8, el.name || "line", "#5b21b6");
        }
      } else if (el.type === "area" && Array.isArray(el.points) && el.points.length >= 3) {
        ctx.fillStyle = isSelected ? "rgba(239,68,68,0.14)" : (semantic === "restricted" ? "rgba(239,68,68,0.12)" : "rgba(234,179,8,0.14)");
        ctx.strokeStyle = isSelected ? "#ef4444" : (semantic === "restricted" ? "#dc2626" : "#ca8a04");
        ctx.lineWidth = lineWidthForWorld(isSelected ? 3 : 2, viewport);
        ctx.beginPath();
        el.points.forEach((p, i) => {
          const pt = viewportWorldToScreen({ x: Number(p.x || 0), y: Number(p.y || 0) }, viewport, wrapEl);
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        if (withLabels) {
          const p0 = el.points[0];
          const pt = viewportWorldToScreen({ x: Number(p0.x || 0), y: Number(p0.y || 0) }, viewport, wrapEl);
          ctx.font = "12px system-ui, sans-serif";
          labelBox(ctx, pt.x + 8, pt.y - 8, el.name || "area", "#92400e");
        }
      }
    });
  }



  function currentStartToPoseDistance() {
    if (!state.trail.length) return 0;
    return distanceBetween(state.trail[0], latestPose());
  }

  function formatScaleMeters(meters) {
    if (!Number.isFinite(meters) || meters <= 0) return "0 m";
    if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
    if (meters >= 100) return `${Math.round(meters)} m`;
    if (meters >= 10) return `${meters.toFixed(1)} m`;
    return `${meters.toFixed(2)} m`;
  }

  function drawScaleRuler(ctx, wrapEl, viewport, corner = "bottom-left") {
    const base = getBasePixelsPerWorld(wrapEl);
    const pxPerMeterX = Math.max(base.x * (viewport?.scale || 1), 0.001);
    const targetPx = 120;
    const rawMeters = targetPx / pxPerMeterX;
    const choices = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    let meters = choices[choices.length - 1];
    for (const c of choices) {
      if (rawMeters <= c) { meters = c; break; }
    }
    const rulerPx = meters * pxPerMeterX;
    const rect = getWrapRect(wrapEl);
    const margin = 18;
    const x = corner === "bottom-right" ? rect.width - margin - rulerPx : margin;
    const y = rect.height - margin;

    ctx.save();
    ctx.strokeStyle = "#0f172a";
    ctx.fillStyle = "#0f172a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + rulerPx, y);
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x, y + 8);
    ctx.moveTo(x + rulerPx, y - 8);
    ctx.lineTo(x + rulerPx, y + 8);
    ctx.stroke();
    labelBox(ctx, x, y - 14, `尺規 ${formatScaleMeters(meters)}`, "#0f172a");
    ctx.restore();
  }

  function drawStartToCurrentDistanceBadge(ctx, wrapEl, viewport, title = "起點→目前位置") {
    if (!state.trail.length) return;
    const dist = currentStartToPoseDistance();
    const rect = getWrapRect(wrapEl);
    labelBox(ctx, rect.width - 220, 22, `${title}：${formatScaleMeters(dist)}`, "#7c2d12");
  }


  function totalTrailDistance() {
    if (!state.trail.length || state.trail.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < state.trail.length; i++) {
      total += distanceBetween(state.trail[i - 1], state.trail[i]);
    }
    return total;
  }

  function currentSegmentSpeedMps() {
    if (!state.trail.length || state.trail.length < 2) return 0;
    const last = state.trail[state.trail.length - 1];
    const prev = state.trail[state.trail.length - 2];
    const dt = Math.max(((Number(last.t || 0) - Number(prev.t || 0)) / 1000), 0.001);
    return distanceBetween(prev, last) / dt;
  }

  function averageTrailSpeedMps() {
    if (!state.trail.length || state.trail.length < 2) return 0;
    const first = state.trail[0];
    const last = state.trail[state.trail.length - 1];
    const dt = Math.max(((Number(last.t || 0) - Number(first.t || 0)) / 1000), 0.001);
    return totalTrailDistance() / dt;
  }

  function movementHeadingDegrees() {
    if (!state.trail.length || state.trail.length < 2) return latestPose().heading || 0;
    const last = state.trail[state.trail.length - 1];
    const prev = state.trail[state.trail.length - 2];
    const dx = Number(last.x || 0) - Number(prev.x || 0);
    const dy = Number(last.y || 0) - Number(prev.y || 0);
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return latestPose().heading || 0;
    return normalizeAngle((Math.atan2(dx, -dy) * 180) / Math.PI);
  }

  function headingToText(deg) {
    const a = normalizeAngle(deg || 0);
    if (a >= 337.5 || a < 22.5) return "北";
    if (a < 67.5) return "東北";
    if (a < 112.5) return "東";
    if (a < 157.5) return "東南";
    if (a < 202.5) return "南";
    if (a < 247.5) return "西南";
    if (a < 292.5) return "西";
    return "西北";
  }

  function formatSpeed(mps) {
    const v = Number(mps || 0);
    if (!Number.isFinite(v) || v <= 0) return "0.00 m/s";
    return `${v.toFixed(2)} m/s`;
  }

  function drawNavTelemetryPanel(ctx, wrapEl, viewport) {
    return;
  }



  function updateNavTelemetryDom() {
    const setText = (id, value) => {
      const el = $(id);
      if (el) el.textContent = value;
    };
    if (!state.trail.length) {
      setText("navStatStartDistance", "0 m");
      setText("navStatSpeed", "0.00 m/s");
      setText("navStatHeading", "北 (0°)");
      setText("navStatAvgSpeed", "0.00 m/s");
      setText("navStatTotalDistance", "0 m");
      setText("navStatCoords", "(0 m, 0 m)");
      setText("navCoordChip", "(0 m, 0 m)");
      return;
    }
    const pose = latestPose();
    const totalDist = totalTrailDistance();
    const startDist = currentStartToPoseDistance();
    const heading = movementHeadingDegrees();
    const speed = currentSegmentSpeedMps();
    const avgSpeed = averageTrailSpeedMps();
    const coordText = `(${fmtMetersInt(pose.x)} m, ${fmtMetersInt(pose.y)} m)`;
    setText("navStatStartDistance", formatScaleMeters(startDist));
    setText("navStatSpeed", formatSpeed(speed));
    setText("navStatHeading", `${headingToText(heading)} (${heading.toFixed(0)}°)`);
    setText("navStatAvgSpeed", formatSpeed(avgSpeed));
    setText("navStatTotalDistance", formatScaleMeters(totalDist));
    setText("navStatCoords", coordText);
    setText("navCoordChip", coordText);
  }


  function getSmoothedTrail(points, windowSize = 2) {
    if (!Array.isArray(points) || points.length <= 2) return points || [];
    const out = points.map((p) => ({ ...p }));
    for (let i = 1; i < points.length - 1; i++) {
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      for (let j = Math.max(0, i - windowSize); j <= Math.min(points.length - 1, i + windowSize); j++) {
        sumX += Number(points[j].x || 0);
        sumY += Number(points[j].y || 0);
        count += 1;
      }
      out[i].x = sumX / Math.max(count, 1);
      out[i].y = sumY / Math.max(count, 1);
    }
    out[0].x = Number(points[0].x || 0);
    out[0].y = Number(points[0].y || 0);
    out[out.length - 1].x = Number(points[points.length - 1].x || 0);
    out[out.length - 1].y = Number(points[points.length - 1].y || 0);
    return out;
  }


  function getImportedTrackColors() {
    return ["#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#ca8a04", "#be123c", "#0f766e"];
  }

  function normalizeImportedTrackPayload(payload) {
    const colors = getImportedTrackColors();
    const tracks = [];
    const toPoints = (arr) => Array.isArray(arr) ? arr.map((p) => ({
      x: Number(p?.x || 0),
      y: Number(p?.y || 0),
      t: p?.t || Date.now(),
      heading: Number(p?.heading || 0)
    })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) : [];

    if (Array.isArray(payload)) {
      tracks.push({ name: "匯入軌跡 1", color: colors[0], points: toPoints(payload) });
    } else if (Array.isArray(payload?.trail)) {
      tracks.push({ name: payload?.name || "匯入軌跡 1", color: payload?.color || colors[0], points: toPoints(payload.trail) });
    } else if (Array.isArray(payload?.tracks)) {
      payload.tracks.forEach((track, idx) => {
        tracks.push({
          name: track?.name || `匯入軌跡 ${idx + 1}`,
          color: track?.color || colors[idx % colors.length],
          points: toPoints(track?.points || track?.trail || [])
        });
      });
    } else if (Array.isArray(payload?.trailHistory)) {
      payload.trailHistory.forEach((entry, idx) => {
        tracks.push({
          name: entry?.name || `匯入軌跡 ${idx + 1}`,
          color: entry?.color || colors[idx % colors.length],
          points: toPoints(entry?.points || entry?.trail || [])
        });
      });
    } else if (Array.isArray(payload?.state?.trail)) {
      tracks.push({ name: payload?.name || "匯入軌跡 1", color: payload?.color || colors[0], points: toPoints(payload.state.trail) });
    } else if (Array.isArray(payload?.data?.trail)) {
      tracks.push({ name: payload?.name || "匯入軌跡 1", color: payload?.color || colors[0], points: toPoints(payload.data.trail) });
    } else if (Array.isArray(payload?.path)) {
      tracks.push({ name: payload?.name || "匯入軌跡 1", color: payload?.color || colors[0], points: toPoints(payload.path) });
    }

    return tracks.filter((t) => t.points.length >= 2);
  }

  async function importNavJsonTracks(file) {
    if (!file) {
      setMessage("匯入失敗：沒有檔案。");
      return;
    }
    const raw = await file.text();
    if (!raw || !raw.trim()) {
      setMessage("匯入失敗：JSON 檔案是空的。");
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      setMessage("匯入失敗：JSON 格式錯誤。");
      throw err;
    }
    const tracks = normalizeImportedTrackPayload(parsed);
    if (!tracks.length) {
      const keys = parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 12).join(", ") : "無";
      setMessage(`匯入失敗：找不到可顯示的軌跡資料。檔案鍵值：${keys || "無"}`);
      refreshViewportUI();
      return;
    }
    const palette = getImportedTrackColors();
    tracks.forEach((track, idx) => {
      track.id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + idx);
      if (!track.color) track.color = palette[(state.importedTracks.length + idx) % palette.length];
    });
    state.importedTracks.push(...tracks);
    const pointCount = tracks.reduce((sum, t) => sum + t.points.length, 0);
    setMessage(`已匯入 ${tracks.length} 條 JSON 軌跡，共 ${pointCount} 個軌跡點。`);
    ensureNavViewportVisible(true);
    refreshViewportUI();
    render();
  }

  function getDisplayTrail() {
    return getSmoothedTrail(state.trail, 2);
  }


  function smoothingLabel(alpha) {
    const a = Number(alpha || 0);
    if (a >= 0.30) return "靈敏";
    if (a <= 0.15) return "穩定";
    return "標準";
  }

  function loadPoseSmoothingPreference() {
    try {
      const alpha = loadNumberStorage(STORAGE_KEYS.poseSmoothingAlpha, null);
      if (Number.isFinite(alpha) && alpha >= 0.05 && alpha <= 0.50) {
        state.poseSmoothingAlpha = alpha;
      }
      refreshSmoothingUi();
      return;
    } catch (e) {}
    refreshSmoothingUi();
  }

  function persistPoseSmoothingPreference() {
    try {
      saveJsonStorage(STORAGE_KEYS.poseSmoothingAlpha, state.poseSmoothingAlpha);
    } catch (e) {}
  }

  function refreshSmoothingUi() {
    const slider = $("smoothStrengthSlider");
    const value = $("smoothStrengthValue");
    if (slider) slider.value = String(Number(state.poseSmoothingAlpha || 0.22).toFixed(2));
    if (value) value.textContent = `${smoothingLabel(state.poseSmoothingAlpha)} (${Number(state.poseSmoothingAlpha || 0.22).toFixed(2)})`;
  }

  function setPoseSmoothingAlpha(alpha) {
    const next = Math.max(0.05, Math.min(0.50, Number(alpha || 0.22)));
    state.poseSmoothingAlpha = next;
    state.poseSmoothingPreset = smoothingLabel(next);
    persistPoseSmoothingPreference();
    refreshSmoothingUi();
    setMessage(`已調整平滑強度：${smoothingLabel(next)} (${next.toFixed(2)})。`);
    render();
  }

  function drawTrack() {
    const wrapEl = $("trackCanvasWrap");
    if (!wrapEl) return;
    ensureCanvasSize(canvas, wrapEl);
    if (!state.navAutoFit && state.navFollowCurrent) syncNavViewportToCurrentPose();
    updateFilteredPose();
    updateNavTelemetryDom();
    const rect = getWrapRect(wrapEl);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid(ctx, wrapEl, state.navViewport);
    drawCrosshair(ctx, wrapEl, state.navViewport);
    drawNavTelemetryPanel(ctx, wrapEl, state.navViewport);

    drawMapElementsOnCanvas(ctx, true, state.navViewport, wrapEl);

    if (state.showAnchorOverlay && state.savedAnchors.length) {
      ctx.font = "12px system-ui, sans-serif";
      state.savedAnchors.forEach((a) => {
        const pt = viewportWorldToScreen({ x: Number(a.x || 0), y: Number(a.y || 0) }, state.navViewport, wrapEl);
        const anchorColor = a.source === "current-pose" ? "#d946ef" : "#2563eb";
        ctx.fillStyle = anchorColor;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, fixedRadius(6), 0, Math.PI * 2);
        ctx.fill();

        if (a.heading != null && Number.isFinite(Number(a.heading))) {
          const rad = (Number(a.heading) * Math.PI) / 180;
          ctx.strokeStyle = anchorColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          ctx.lineTo(pt.x + Math.sin(rad) * 18, pt.y - Math.cos(rad) * 18);
          ctx.stroke();
        }
        labelBox(ctx, pt.x + 10, pt.y - 10, a.name || "anchor", a.source === "current-pose" ? "#a21caf" : "#1e3a8a");
      });
    }

    if (!state.trail.length) return;

    (state.importedTracks || []).forEach((track) => {
      const importedTrail = getSmoothedTrail(track.points, 2);
      ctx.strokeStyle = track.color || "#2563eb";
      ctx.lineWidth = lineWidthForWorld(2.5, state.navViewport);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      importedTrail.forEach((p, i) => {
        const pt = viewportWorldToScreen(p, state.navViewport, wrapEl);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
    });

    const displayTrail = getDisplayTrail();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = lineWidthForWorld(3, state.navViewport);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    displayTrail.forEach((p, i) => {
      const pt = viewportWorldToScreen(p, state.navViewport, wrapEl);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    const start = state.trail[0];
    const last = latestPose();

    const target = state.savedAnchors.find(a => a.id === state.navTargetId);
    if (target) {
      const points = state.routeMode === "multi" || state.routeMode === "network"
        ? getSelectedRoutePoints()
        : [{ id: "__current__", x: Number(last.x||0), y: Number(last.y||0) }, { ...target, x: Number(target.x||0), y: Number(target.y||0) }];

      points.forEach((p, i) => {
        if (i === 0) return;
        const prev = points[i - 1];
        const p1 = viewportWorldToScreen(prev, state.navViewport, wrapEl);
        const p2 = viewportWorldToScreen(p, state.navViewport, wrapEl);
        const activeLeg = i - 1 === state.activeLegIndex;

        ctx.strokeStyle = activeLeg ? "#dc2626" : "#ea580c";
        ctx.lineWidth = lineWidthForWorld(activeLeg ? 4 : 3, state.navViewport);
        ctx.setLineDash(activeLeg ? [10, 6] : [8, 8]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        if (activeLeg) {
          const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const arrowLen = 14;
          ctx.fillStyle = "#dc2626";
          ctx.beginPath();
          ctx.moveTo(p2.x, p2.y);
          ctx.lineTo(p2.x - arrowLen * Math.cos(ang - Math.PI / 6), p2.y - arrowLen * Math.sin(ang - Math.PI / 6));
          ctx.lineTo(p2.x - arrowLen * Math.cos(ang + Math.PI / 6), p2.y - arrowLen * Math.sin(ang + Math.PI / 6));
          ctx.closePath();
          ctx.fill();
        }
      });
      ctx.setLineDash([]);

      points.slice(1).forEach((p, idx) => {
        const pt = viewportWorldToScreen(p, state.navViewport, wrapEl);
        ctx.fillStyle = idx === points.length - 2 ? "#ea580c" : "#f59e0b";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, idx === points.length - 2 ? fixedRadius(9) : fixedRadius(7), 0, Math.PI * 2);
        ctx.fill();

        ctx.font = "12px system-ui, sans-serif";
        const isFinal = idx === points.length - 2;
        const isActiveNext = idx === state.activeLegIndex;
        const label = isFinal
          ? `${p.name || "目標"} / ${fmt(routeDistance(points), 1)}m`
          : `${isActiveNext ? "下一點" : "中繼"}：${p.name || "waypoint"}`;
        labelBox(ctx, pt.x + 12, pt.y + 18, label, idx === points.length - 2 ? "#9a3412" : "#92400e");
      });
    }

    const startPt = viewportWorldToScreen(start, state.navViewport, wrapEl);
    ctx.fillStyle = "#16a34a";
    ctx.beginPath();
    ctx.arc(startPt.x, startPt.y, fixedRadius(8), 0, Math.PI * 2);
    ctx.fill();

    const lastPt = viewportWorldToScreen(last, state.navViewport, wrapEl);
    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.arc(lastPt.x, lastPt.y, fixedRadius(8), 0, Math.PI * 2);
    ctx.fill();

    drawScaleRuler(ctx, wrapEl, state.navViewport, "bottom-left");
  }


  function drawTrackLegacySnapshot() {

    ctx.clearRect(0, 0, TRACK_SIZE, TRACK_SIZE);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(CENTER, 0);
    ctx.lineTo(CENTER, TRACK_SIZE);
    ctx.moveTo(0, CENTER);
    ctx.lineTo(TRACK_SIZE, CENTER);
    ctx.stroke();

    drawMapElementsOnCanvas(ctx, true);

    if (state.showAnchorOverlay && state.savedAnchors.length) {
      ctx.font = "12px system-ui, sans-serif";
      state.savedAnchors.forEach((a) => {
        const x = CENTER + Number(a.x || 0) * DEFAULT_WORLD_SCALE;
        const y = CENTER + Number(a.y || 0) * DEFAULT_WORLD_SCALE;

        ctx.fillStyle = "#2563eb";
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();

        if (a.heading != null && Number.isFinite(Number(a.heading))) {
          const rad = (Number(a.heading) * Math.PI) / 180;
          ctx.strokeStyle = "#2563eb";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.sin(rad) * 18, y - Math.cos(rad) * 18);
          ctx.stroke();
        }

        const label = a.name || "anchor";
        const textX = x + 10;
        const textY = y - 10;
        const metrics = ctx.measureText(label);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillRect(textX - 4, textY - 12, metrics.width + 8, 18);
        ctx.fillStyle = "#1e3a8a";
        ctx.fillText(label, textX, textY);
      });
    }

    if (!state.trail.length) return;

    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    state.trail.forEach((p, i) => {
      const x = CENTER + p.x * DEFAULT_WORLD_SCALE;
      const y = CENTER + p.y * DEFAULT_WORLD_SCALE;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const start = state.trail[0];
    const last = latestPose();

    const target = state.savedAnchors.find(a => a.id === state.navTargetId);
    if (target) {
      const points = state.routeMode === "multi" ? getSelectedRoutePoints() : [{ id: "__current__", x: Number(last.x||0), y: Number(last.y||0) }, { ...target, x: Number(target.x||0), y: Number(target.y||0) }];

      points.forEach((p, i) => {
        if (i === 0) return;
        const prev = points[i - 1];
        const x1 = CENTER + Number(prev.x || 0) * DEFAULT_WORLD_SCALE;
        const y1 = CENTER + Number(prev.y || 0) * DEFAULT_WORLD_SCALE;
        const x2 = CENTER + Number(p.x || 0) * DEFAULT_WORLD_SCALE;
        const y2 = CENTER + Number(p.y || 0) * DEFAULT_WORLD_SCALE;
        const activeLeg = i - 1 === state.activeLegIndex;

        ctx.strokeStyle = activeLeg ? "#dc2626" : "#ea580c";
        ctx.lineWidth = activeLeg ? 4 : 3;
        ctx.setLineDash(activeLeg ? [10, 6] : [8, 8]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        if (activeLeg) {
          const ang = Math.atan2(y2 - y1, x2 - x1);
          const arrowLen = 14;
          ctx.fillStyle = "#dc2626";
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - arrowLen * Math.cos(ang - Math.PI / 6), y2 - arrowLen * Math.sin(ang - Math.PI / 6));
          ctx.lineTo(x2 - arrowLen * Math.cos(ang + Math.PI / 6), y2 - arrowLen * Math.sin(ang + Math.PI / 6));
          ctx.closePath();
          ctx.fill();
        }
      });
      ctx.setLineDash([]);

      points.slice(1).forEach((p, idx) => {
        const px = CENTER + Number(p.x || 0) * DEFAULT_WORLD_SCALE;
        const py = CENTER + Number(p.y || 0) * DEFAULT_WORLD_SCALE;
        ctx.fillStyle = idx === points.length - 2 ? "#ea580c" : "#f59e0b";
        ctx.beginPath();
        ctx.arc(px, py, idx === points.length - 2 ? 9 : 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = "12px system-ui, sans-serif";
        const isFinal = idx === points.length - 2;
        const isActiveNext = idx === state.activeLegIndex;
        const label = isFinal
          ? `${p.name || "目標"} / ${fmt(routeDistance(points), 1)}m`
          : `${isActiveNext ? "下一點" : "中繼"}：${p.name || "waypoint"}`;
        const lx = px + 12;
        const ly = py + 18;
        const metrics = ctx.measureText(label);
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillRect(lx - 4, ly - 12, metrics.width + 8, 18);
        ctx.fillStyle = idx === points.length - 2 ? "#9a3412" : "#92400e";
        ctx.fillText(label, lx, ly);
      });
    }

    ctx.fillStyle = "#16a34a";
    ctx.beginPath();
    ctx.arc(CENTER + start.x * DEFAULT_WORLD_SCALE, CENTER + start.y * DEFAULT_WORLD_SCALE, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.arc(CENTER + last.x * DEFAULT_WORLD_SCALE, CENTER + last.y * DEFAULT_WORLD_SCALE, 8, 0, Math.PI * 2);
    ctx.fill();
  }



  function setEditorMessage(text) {
    state.editorMessage = text;
    const el = $("editorMessageBox");
    if (el) el.textContent = text;
  }




  function syncNavViewportToCurrentPose() {
    const wrapEl = $("trackCanvasWrap");
    if (!wrapEl) return;
    const pose = latestPose();
    const viewport = state.navViewport;
    const base = getBasePixelsPerWorld(wrapEl);
    viewport.panX = -(Number(pose.x || 0) * base.x * (viewport.scale || 1));
    viewport.panY = -(Number(pose.y || 0) * base.y * (viewport.scale || 1));
    clampViewport(viewport);
  }

  function centerNavOnCurrentPose() {
    const wrapEl = $("trackCanvasWrap");
    if (!wrapEl) return;
    const pose = latestPose();
    const viewport = state.navViewport;
    const base = getBasePixelsPerWorld(wrapEl);
    viewport.panX = -(Number(pose.x || 0) * base.x * (viewport.scale || 1));
    viewport.panY = -(Number(pose.y || 0) * base.y * (viewport.scale || 1));
    clampViewport(viewport);
    refreshViewportUI();
  }

  function switchPage(pageId) {
    document.querySelectorAll(".page").forEach(el => el.classList.toggle("active", el.id === pageId));
    document.querySelectorAll(".tabbtn").forEach(el => el.classList.toggle("active", el.dataset.page === pageId));
  }

  document.querySelectorAll(".tabbtn").forEach(btn => {
    btn.addEventListener("click", () => switchPage(btn.dataset.page));
  });

  $("btnPermission").addEventListener("click", requestPermissions);
  $("btnAnchor").addEventListener("click", setCurrentGpsAsAnchor);
  $("btnStart").addEventListener("click", startTracking);
  $("btnStop").addEventListener("click", stopTracking);
  $("btnReset").addEventListener("click", resetAll);
  $("btnPosCorrection").addEventListener("click", beginPositionCorrection);
  $("btnHeadingCorrection").addEventListener("click", beginHeadingCorrection);
  $("btnExport").addEventListener("click", exportData);
  $("btnImportJson")?.addEventListener("click", () => {
    setMessage("請選擇要匯入的 JSON 檔案。");
  });
  $("importJsonFile")?.addEventListener("change", async (e) => {
    const file = e.target?.files?.[0];
    if (!file) {
      setMessage("未選擇 JSON 檔案。");
      return;
    }
    setMessage(`已選擇檔案：${file.name}，開始匯入...`);
    try {
      await importNavJsonTracks(file);
    } catch (err) {
      setMessage("匯入 JSON 失敗：" + err.message);
    } finally {
      e.target.value = "";
    }
  });
  $("btnStepCal").addEventListener("click", beginStepLengthCalibration);
  $("btnSetManualHeading")?.addEventListener("click", setManualHeading);
  $("btnQrCal").addEventListener("click", openQrCalibration);
  $("btnQrClose").addEventListener("click", closeQrCalibration);
  $("stepLength").addEventListener("input", (e) => {
    state.stepLength = Number(e.target.value);
    render();
  });
  $("toggleAnchorOverlay").addEventListener("change", (e) => {
    state.showAnchorOverlay = e.target.checked;
    render();
  });
  $("toggleMapOverlay").addEventListener("change", (e) => {
    state.showMapOverlay = e.target.checked;
    render();
  });
  $("btnSetTarget").addEventListener("click", setNavTarget);
  $("btnClearTarget").addEventListener("click", clearNavTarget);
  $("navTargetSelect").addEventListener("change", setNavTarget);
  $("routeModeSelect").addEventListener("change", setRouteMode);
  $("routeWaypointsSelect").addEventListener("change", applyWaypointSelection);
  $("btnApplyRoute").addEventListener("click", applyWaypointSelection);
  $("btnClearRoute").addEventListener("click", clearRouteWaypoints);
  $("arrivalThresholdInput").addEventListener("change", (e) => {
    const v = Number(e.target.value);
    state.arrivalThreshold = Number.isFinite(v) && v > 0 ? v : 2.0;
    render();
  });
  $("toggleVoiceGuide").addEventListener("change", (e) => {
    state.voiceGuideEnabled = e.target.checked;
    if (!state.voiceGuideEnabled && "speechSynthesis" in window) window.speechSynthesis.cancel();
    render();
  });
  $("btnNavSessionStart").addEventListener("click", startNavSession);
  $("btnNavSessionPause").addEventListener("click", pauseNavSession);
  $("btnNavSessionResume").addEventListener("click", resumeNavSession);
  $("btnNavSessionEnd").addEventListener("click", () => finishNavSession("ended"));
  $("btnExportNavHistory").addEventListener("click", exportNavHistory);

  $("btnEditorIdle").addEventListener("click", () => setEditorMode("idle"));
  $("btnEditorPoint").addEventListener("click", () => setEditorMode("point"));
  $("btnEditorLine").addEventListener("click", () => setEditorMode("line"));
  $("btnEditorArea").addEventListener("click", () => setEditorMode("area"));
  $("btnEditorUndo").addEventListener("click", undoMapElement);
  $("btnEditorNormalize").addEventListener("click", () => { normalizeLineNetwork(); render(); });
  $("btnEditorClear").addEventListener("click", () => {
    if (!confirm("確定要清空所有地圖元素嗎？")) return;
    state.mapElements = [];
    state.editorDraftPoints = [];
    persistMapElements();
    setEditorMessage("已清空所有地圖元素。");
    render();
  });
  $("editorNameInput").addEventListener("input", () => render());
  $("toggleSnapMode").addEventListener("change", (e) => { state.snapEnabled = e.target.checked; render(); });
  $("toggleAutoIntersect").addEventListener("change", (e) => { state.autoIntersectEnabled = e.target.checked; render(); });
  $("editorCanvas").addEventListener("click", handleEditorCanvasClick);
  $("btnUpdateSelectedMapElement").addEventListener("click", updateSelectedMapElementName);
  $("btnDeleteSelectedMapElement").addEventListener("click", deleteSelectedMapElement);
  $("btnConvertSelectedToAnchor").addEventListener("click", convertSelectedMapElementToAnchor);
  $("btnExportMapData").addEventListener("click", exportMapData);
  $("btnImportMapData").addEventListener("click", () => $("importMapDataFile").click());
  $("importMapDataFile").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    importMapData(file);
    e.target.value = "";
  });

  $("btnClearNavHistory").addEventListener("click", () => {
    if (!confirm("確定要清空所有導航歷史嗎？")) return;
    state.navHistory = [];
    persistNavHistory();
  });

  $("btnGenerate").addEventListener("click", generateQr);
  $("btnUseCurrentPoseForQr")?.addEventListener("click", () => {
    fillQrInputsFromCurrentPose();
    generateQr();
    setMessage("已用目前位置更新 QR。");
  });
  $("btnSaveAnchor").addEventListener("click", saveCurrentAnchor);
  $("btnExportAnchors").addEventListener("click", exportSavedAnchors);
  $("btnSyncAnchorsToMap").addEventListener("click", syncAllAnchorsToMap);
  $("btnImportAnchors").addEventListener("click", () => $("importAnchorsFile").click());
  $("importAnchorsFile").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    importSavedAnchorsFromFile(file);
    e.target.value = "";
  });
  $("btnClearAnchors").addEventListener("click", () => {
    if (!confirm("確定要清空所有已儲存校正點嗎？")) return;
    state.savedAnchors = [];
    persistSavedAnchors();
  });
  $("btnCopy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("payloadText").value);
      alert("已複製 QR 內容");
    } catch (e) {
      alert("複製失敗，請手動選取文字");
    }
  });
  ["anchorName", "xValue", "yValue", "headingValueInput"].forEach((id) => {
    $(id).addEventListener("input", generateQr);
  });

  window.addEventListener("deviceorientation", handleOrientation, true);
  window.addEventListener("devicemotion", handleMotion, true);

  injectEnhancementUI();
  attachViewportHandlers($("trackCanvasWrap"), $("trackCanvas"), state.navViewport, "nav");
  attachViewportHandlers($("editorCanvasWrap"), $("editorCanvas"), state.editorViewport, "editor");
  $("btnTrackFullscreen")?.addEventListener("click", () => toggleWrapFullscreen("trackCanvasWrap"));
  $("btnNavAutoFit")?.addEventListener("click", () => {
    state.navAutoFit = !state.navAutoFit;
    if (state.navAutoFit) ensureNavViewportVisible(true);
    refreshViewportUI();
  });
  $("btnNavFollow")?.addEventListener("click", () => {
    state.navFollowCurrent = !state.navFollowCurrent;
    if (state.navFollowCurrent) centerNavOnCurrentPose();
    refreshViewportUI();
  });
  $("btnNavFitNow")?.addEventListener("click", () => {
    centerNavOnCurrentPose();
  });
  $("btnEditorFullscreen")?.addEventListener("click", () => toggleWrapFullscreen("editorCanvasWrap"));
  document.addEventListener("fullscreenchange", () => {
    ensureNavViewportVisible(state.navAutoFit);
    refreshViewportUI();
  });
  document.addEventListener("webkitfullscreenchange", () => {
    ensureNavViewportVisible(state.navAutoFit);
    refreshViewportUI();
  });
  window.addEventListener("resize", () => {
    ensureNavViewportVisible(state.navAutoFit);
    refreshViewportUI();
  });
  $("btnGpsAnchorCreate")?.addEventListener("click", createSavedAnchorFromGps);
  $("btnPoseAnchorCreate")?.addEventListener("click", createAnchorFromCurrentPose);
  $("btnUseGpsForDraftAnchor")?.addEventListener("click", createAnchorFromGpsDraft);
  $("btnAnchorCorrection")?.addEventListener("click", () => applyAnchorCorrection($("anchorCorrectionSelect")?.value));
  $("btnGpsFusionCorrection")?.addEventListener("click", async () => {
    try {
      setMessage("以 GPS 柔性校正中，請站定 4 秒。");
      const sample = await sampleCurrentGps(4000);
      applySoftGpsCorrection(sample, "gps-manual");
      setMessage(`已完成 GPS 柔性校正，平均誤差 ${fmt(sample.accuracy, 1)} m。`);
      render();
    } catch (e) {
      setMessage("GPS 柔性校正失敗：" + e.message);
    }
  });
    $("smoothStrengthSlider")?.addEventListener("input", (e) => {
    const alpha = Number(e.target.value || 0.22);
    state.poseSmoothingAlpha = alpha;
    state.poseSmoothingPreset = smoothingLabel(alpha);
    refreshSmoothingUi();
    render();
  });
  $("smoothStrengthSlider")?.addEventListener("change", (e) => {
    setPoseSmoothingAlpha(Number(e.target.value || 0.22));
  });

$("btnEditorAnchor")?.addEventListener("click", () => {
    state.anchorCreationMode = true;
    setEditorMode("point");
    setEditorMessage("標定點模式：在地圖上點一下直接新增標定點。");
    render();
  });

  prefillQrAnchorFromCurrentPose();
  loadSavedAnchors();
  loadNavHistory();
  loadMapElements();
  render();
})();
