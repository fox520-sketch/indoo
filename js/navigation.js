// navigation-related functions extracted from app.js for maintainability.

  function setNavTarget() {
    const id = $("navTargetSelect").value;
    state.navTargetId = id;
    state.waypointIds = state.waypointIds.filter(wid => wid !== id);
    const target = state.savedAnchors.find(a => a.id === id);
    state.activeLegIndex = 0;
    state.arrivedTarget = false;
    state.lastArrivalNoticeKey = "";
    resetRouteProgressBaseline();
    if (target) {
      setMessage(`已設 ${target.name} 為導航目標。`);
    } else {
      setMessage("已清除導航目標。");
    }
    render();
    updateGuidanceBanner(Boolean(target));
  }

  function clearNavTarget() {
    state.navTargetId = "";
    state.activeLegIndex = 0;
    state.arrivedTarget = false;
    state.lastArrivalNoticeKey = "";
    setMessage("已清除導航目標。");
    render();
  }



  function getSelectedRoutePoints() {
    if (state.routeMode === "network") {
      return computeNetworkRoute();
    }

    const points = [];
    const current = latestPose();
    points.push({ id: "__current__", name: "目前位置", x: Number(current.x || 0), y: Number(current.y || 0), heading: Number(current.heading || 0) });
    state.waypointIds.forEach((id) => {
      const a = state.savedAnchors.find(x => x.id === id);
      if (a) points.push({ ...a, x: Number(a.x || 0), y: Number(a.y || 0) });
    });
    const target = state.savedAnchors.find(a => a.id === state.navTargetId);
    if (target) points.push({ ...target, x: Number(target.x || 0), y: Number(target.y || 0) });
    return points;
  }

  function routeDistance(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = Number(points[i].x || 0) - Number(points[i - 1].x || 0);
      const dy = Number(points[i].y || 0) - Number(points[i - 1].y || 0);
      total += Math.sqrt(dx * dx + dy * dy);
    }
    return total;
  }

  function renderRouteControls() {
    const targetSel = $("navTargetSelect");
    const wpSel = $("routeWaypointsSelect");
    if (!targetSel || !wpSel) return;

    const currentTarget = state.navTargetId || "";
    targetSel.innerHTML = ['<option value="">請先選擇目標</option>']
      .concat(state.savedAnchors.map(a => `<option value="${a.id}">${a.name} (x:${a.x}, y:${a.y}${a.heading == null ? "" : ", h:" + a.heading})</option>`))
      .join("");
    targetSel.value = currentTarget;

    wpSel.innerHTML = state.savedAnchors.map(a => `<option value="${a.id}">${a.name} (x:${a.x}, y:${a.y}${a.heading == null ? "" : ", h:" + a.heading})</option>`).join("");
    Array.from(wpSel.options).forEach(opt => {
      opt.selected = state.waypointIds.includes(opt.value);
    });

    $("routeModeSelect").value = state.routeMode;
    wpSel.disabled = state.routeMode === "network";
    $("btnApplyRoute").disabled = state.routeMode === "network";
    $("btnClearRoute").disabled = state.routeMode === "network";
  }

  function updateTargetSummary() {
    const summary = $("targetSummary");
    const target = state.savedAnchors.find(a => a.id === state.navTargetId);
    if (!target) {
      summary.textContent = "尚未設定導航目標。";
      return;
    }

    const current = latestPose();
    const legs = computeRouteLegs();
    const active = currentActiveLeg();
    if (!active) {
      summary.textContent = "尚未設定可用路徑。";
      return;
    }

    const totalDist = state.routeMode === "multi"
      ? routeDistance(getSelectedRoutePoints())
      : state.routeMode === "network"
      ? routeDistance(getSelectedRoutePoints())
      : distanceBetween(current, target);

    const nextDist = distanceBetween(current, active.to);
    const dx1 = Number(active.to.x || 0) - Number(current.x || 0);
    const dy1 = Number(active.to.y || 0) - Number(current.y || 0);
    const bearing = normalizeAngle((Math.atan2(dx1, -dy1) * 180) / Math.PI);
    const turn = angleDelta(bearing, current.heading || 0);
    const turnText = turn > 15 ? `右轉 ${fmt(turn, 0)}°` : turn < -15 ? `左轉 ${fmt(Math.abs(turn), 0)}°` : "直行";
    const via = state.routeMode === "multi" && state.waypointIds.length ? `，共 ${legs.length} 段，目前第 ${state.activeLegIndex + 1} 段` : state.routeMode === "network" ? `，沿線段自動規劃，共 ${legs.length} 段，目前第 ${state.activeLegIndex + 1} 段` : "";

    if (state.arrivedTarget) {
      summary.textContent = `已到達目標：${target.name}。總路徑約 ${fmt(totalDist, 1)} m。`;
      return;
    }

    summary.textContent = `目標：${target.name}；總距離約 ${fmt(totalDist, 1)} m${via}；下一點 ${active.to.name || "目標"}，距離約 ${fmt(nextDist, 1)} m；建議 ${turnText}。`;
  }

  function setRouteMode() {
    state.routeMode = $("routeModeSelect").value || "direct";
    render();
  }

  function applyWaypointSelection() {
    const sel = $("routeWaypointsSelect");
    state.waypointIds = Array.from(sel.selectedOptions).map(o => o.value).filter(id => id !== state.navTargetId);
    state.activeLegIndex = 0;
    state.arrivedTarget = false;
    state.lastArrivalNoticeKey = "";
    resetRouteProgressBaseline();
    render();
  }

  function clearRouteWaypoints() {
    state.waypointIds = [];
    state.activeLegIndex = 0;
    state.arrivedTarget = false;
    state.lastArrivalNoticeKey = "";
    resetRouteProgressBaseline();
    render();
  }

  function addWaypointFromList(id) {
    if (!id || id === state.navTargetId) return;
    if (!state.waypointIds.includes(id)) state.waypointIds.push(id);
    state.routeMode = "multi";
    state.activeLegIndex = 0;
    state.arrivedTarget = false;
    state.lastArrivalNoticeKey = "";
    resetRouteProgressBaseline();
    switchPage("navPage");
    setMessage("已加入中繼校正點。");
    render();
  }



  function computeRouteLegs() {
    const points = getSelectedRoutePoints();
    if (points.length < 2) return [];
    const legs = [];
    for (let i = 1; i < points.length; i++) {
      legs.push({
        from: points[i - 1],
        to: points[i],
        index: i - 1,
        isFinal: i === points.length - 1
      });
    }
    return legs;
  }

  function currentActiveLeg() {
    const legs = computeRouteLegs();
    if (!legs.length) return null;
    const idx = Math.max(0, Math.min(state.activeLegIndex, legs.length - 1));
    return legs[idx];
  }

  function distanceBetween(a, b) {
    const dx = Number(b.x || 0) - Number(a.x || 0);
    const dy = Number(b.y || 0) - Number(a.y || 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function updateArrivalProgress() {
    const target = state.savedAnchors.find(a => a.id === state.navTargetId);
    if (!target) return;

    const current = latestPose();
    const legs = computeRouteLegs();
    if (!legs.length) return;

    const active = currentActiveLeg();
    if (!active) return;

    const dist = distanceBetween(current, active.to);
    const legKey = `${active.index}:${active.to.id || active.to.name || "target"}`;

    if (dist <= state.arrivalThreshold && state.lastArrivalNoticeKey !== legKey) {
      state.lastArrivalNoticeKey = legKey;

      if (active.isFinal) {
        state.arrivedTarget = true;
        setMessage(`已接近最終目標：${active.to.name || "目標"}。`);
        speakText(`已到達目標，${active.to.name || "目標"}`);
        if (state.navSessionState !== "idle") finishNavSession("arrived");
      } else {
        const nextIndex = Math.min(state.activeLegIndex + 1, legs.length - 1);
        const nextLeg = legs[nextIndex];
        state.activeLegIndex = nextIndex;
        setMessage(`已到達中繼點：${active.to.name || "中繼點"}，自動切換下一段：前往 ${nextLeg.to.name || "下一點"}。`);
        speakText(`已到達 ${active.to.name || "中繼點"}，接下來前往 ${nextLeg.to.name || "下一點"}`);
      }
      render();
    }
  }



  function speakText(text) {
    if (!state.voiceGuideEnabled) return;
    if (!("speechSynthesis" in window)) return;
    if (!text || text === state.lastSpokenText) return;
    state.lastSpokenText = text;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "zh-TW";
      utter.rate = 1;
      window.speechSynthesis.speak(utter);
    } catch (e) {
      // ignore
    }
  }

  function buildGuidanceText() {
    const target = state.savedAnchors.find(a => a.id === state.navTargetId);
    if (!target) {
      return "尚未設定導航目標。";
    }
    if (state.arrivedTarget) {
      return `已到達目標 ${target.name}。`;
    }

    const active = currentActiveLeg();
    if (!active) {
      return "尚未設定可用路徑。";
    }

    const current = latestPose();
    const dx = Number(active.to.x || 0) - Number(current.x || 0);
    const dy = Number(active.to.y || 0) - Number(current.y || 0);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const bearing = normalizeAngle((Math.atan2(dx, -dy) * 180) / Math.PI);
    const turn = angleDelta(bearing, current.heading || 0);

    let turnText = "直行";
    if (turn > 45) turnText = `右轉 ${fmt(turn, 0)} 度`;
    else if (turn > 15) turnText = `稍微右轉 ${fmt(turn, 0)} 度`;
    else if (turn < -45) turnText = `左轉 ${fmt(Math.abs(turn), 0)} 度`;
    else if (turn < -15) turnText = `稍微左轉 ${fmt(Math.abs(turn), 0)} 度`;

    const nextName = active.to.name || (active.isFinal ? "目標" : "下一點");
    return `前往 ${nextName}，距離約 ${fmt(dist, 1)} 公尺，建議 ${turnText}。`;
  }

  function updateGuidanceBanner(forceSpeak = false) {
    const text = buildGuidanceText();
    state.currentGuidanceText = text;
    const el = $("guidanceBanner");
    if (el) el.textContent = text;

    if (forceSpeak) {
      speakText(text);
      return;
    }

    const active = currentActiveLeg();
    if (!active || state.arrivedTarget) return;

    const current = latestPose();
    const dx = Number(active.to.x || 0) - Number(current.x || 0);
    const dy = Number(active.to.y || 0) - Number(current.y || 0);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const bearing = normalizeAngle((Math.atan2(dx, -dy) * 180) / Math.PI);
    const turn = angleDelta(bearing, current.heading || 0);
    const turnBucket = turn > 45 ? "right-hard" : turn > 15 ? "right-soft" : turn < -45 ? "left-hard" : turn < -15 ? "left-soft" : "straight";
    const distBucket = dist < 3 ? "near" : dist < 8 ? "mid" : "far";
    const cueKey = `${state.activeLegIndex}:${turnBucket}:${distBucket}`;
    if (cueKey !== state.lastTurnCueKey && dist < 8) {
      state.lastTurnCueKey = cueKey;
      speakText(text);
    }
  }



  function getTurnGuidance() {
    const active = currentActiveLeg();
    if (!active) {
      return {
        text: "尚未設定",
        distanceText: "-",
        angleText: "-",
        targetText: "-",
        arrowDeg: 0
      };
    }

    const current = latestPose();
    const dx = Number(active.to.x || 0) - Number(current.x || 0);
    const dy = Number(active.to.y || 0) - Number(current.y || 0);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const bearing = normalizeAngle((Math.atan2(dx, -dy) * 180) / Math.PI);
    const turn = angleDelta(bearing, current.heading || 0);

    let text = "直行";
    if (turn > 120) text = "大幅右轉";
    else if (turn > 45) text = "右轉";
    else if (turn > 15) text = "微右轉";
    else if (turn < -120) text = "大幅左轉";
    else if (turn < -45) text = "左轉";
    else if (turn < -15) text = "微左轉";

    return {
      text,
      distanceText: `${fmt(dist, 1)} m`,
      angleText: `${turn >= 0 ? "+" : ""}${fmt(turn, 0)}°`,
      targetText: active.to.name || (active.isFinal ? "目標" : "下一點"),
      arrowDeg: turn
    };
  }

  function renderArrowGuidance() {
    const data = getTurnGuidance();
    const needle = $("arrowNeedle");
    if (needle) {
      const clamped = Math.max(-160, Math.min(160, Number(data.arrowDeg || 0)));
      needle.style.transform = `translate(-50%,-70px) rotate(${clamped}deg)`;
      needle.style.background = data.text.includes("左") ? "#2563eb" : data.text.includes("右") ? "#dc2626" : "#16a34a";
    }
    $("turnArrowText").textContent = data.text;
    $("turnDistanceText").textContent = data.distanceText;
    $("turnAngleText").textContent = data.angleText;
    $("turnTargetText").textContent = data.targetText;
  }



  function getCurrentRouteTotalDistance() {
    const target = state.savedAnchors.find(a => a.id === state.navTargetId);
    if (!target) return 0;
    if (state.routeMode === "multi") {
      return routeDistance(getSelectedRoutePoints());
    }
    return distanceBetween(latestPose(), target);
  }

  function getRemainingRouteDistance() {
    const target = state.savedAnchors.find(a => a.id === state.navTargetId);
    if (!target) return 0;

    if (state.routeMode !== "multi") {
      return distanceBetween(latestPose(), target);
    }

    const active = currentActiveLeg();
    const legs = computeRouteLegs();
    if (!active || !legs.length) return 0;

    let remaining = distanceBetween(latestPose(), active.to);
    for (let i = state.activeLegIndex + 1; i < legs.length; i++) {
      remaining += distanceBetween(legs[i].from, legs[i].to);
    }
    return remaining;
  }

  function formatEta(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "-";
    if (seconds < 60) return `${Math.max(1, Math.round(seconds))} 秒`;
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} 分`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem ? `${hrs} 小時 ${rem} 分` : `${hrs} 小時`;
  }

  function renderRouteProgress() {
    const target = state.savedAnchors.find(a => a.id === state.navTargetId);
    const label = $("routeProgressLabel");
    const percent = $("routeProgressPercent");
    const bar = $("routeProgressBar");

    if (!target) {
      label.textContent = "尚未設定目標";
      percent.textContent = "0%";
      bar.style.width = "0%";
      $("routeTraveledText").textContent = "-";
      $("routeRemainingText").textContent = "-";
      $("routeTotalText").textContent = "-";
      $("routeEtaText").textContent = "-";
      return;
    }

    const total = Math.max(state.startedRouteDistance || getCurrentRouteTotalDistance(), 0.01);
    const remaining = Math.max(getRemainingRouteDistance(), 0);
    const traveled = Math.max(total - remaining, 0);
    const p = state.arrivedTarget ? 100 : Math.max(0, Math.min(100, (traveled / total) * 100));
    const legs = computeRouteLegs();
    const etaSeconds = remaining / Math.max(state.averageWalkingSpeed || 1.15, 0.2);

    const sessionPrefix = state.navSessionState === "active" ? "導航中 / " : state.navSessionState === "paused" ? "已暫停 / " : "";
    label.textContent = state.arrivedTarget
      ? `已到達 ${target.name}`
      : state.routeMode === "multi"
      ? `${sessionPrefix}第 ${Math.min(state.activeLegIndex + 1, Math.max(legs.length, 1))} / ${Math.max(legs.length, 1)} 段`
      : state.routeMode === "network"
      ? `${sessionPrefix}路網導航 ${Math.min(state.activeLegIndex + 1, Math.max(legs.length, 1))} / ${Math.max(legs.length, 1)} 段`
      : `${sessionPrefix}單段導航中`;
    percent.textContent = `${Math.round(p)}%`;
    bar.style.width = `${p}%`;

    $("routeTraveledText").textContent = `${traveled.toFixed(1)} m`;
    $("routeRemainingText").textContent = `${remaining.toFixed(1)} m`;
    $("routeTotalText").textContent = `${total.toFixed(1)} m`;
    $("routeEtaText").textContent = state.arrivedTarget ? "已到達" : formatEta(etaSeconds);
  }

  function resetRouteProgressBaseline() {
    const total = getCurrentRouteTotalDistance();
    state.startedRouteDistance = total > 0 ? total : 0;
  }



  function loadNavHistory() {
    try {
      state.navHistory = loadJsonArrayStorage(STORAGE_KEYS.navHistory);
    } catch (e) {
      state.navHistory = [];
    }
    renderNavHistory();
  }

  function persistNavHistory() {
    saveJsonStorage(STORAGE_KEYS.navHistory, state.navHistory);
    renderNavHistory();
  }

  function renderNavHistory() {
    const el = $("navHistoryList");
    if (!el) return;
    if (!state.navHistory.length) {
      el.innerHTML = '<div class="item">尚無導航歷史。</div>';
      return;
    }
    el.innerHTML = state.navHistory.map((h) => `
      <div class="item">
        <div class="item-top">
          <strong>${h.targetName || "未命名目標"}</strong>
          <span class="badge">${h.status || "done"}</span>
        </div>
        <div>開始：${h.startedAt ? new Date(h.startedAt).toLocaleString() : "-"}</div>
        <div>結束：${h.endedAt ? new Date(h.endedAt).toLocaleString() : "-"}</div>
        <div>耗時：${h.durationText || "-"}</div>
        <div>總距離：${h.totalDistanceText || "-"}</div>
        <div>路徑模式：${h.routeMode === "multi" ? "多段路徑" : "直接連線"}</div>
      </div>
    `).join("");
  }

  function sessionDurationMs(nowTs = Date.now()) {
    if (!state.navSessionStartedAt) return 0;
    const end = state.navSessionState === "paused" && state.navSessionPausedAt ? state.navSessionPausedAt : nowTs;
    return Math.max(0, end - state.navSessionStartedAt - state.navPauseAccumulatedMs);
  }

  function durationTextFromMs(ms) {
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec} 秒`;
    const min = Math.floor(sec / 60);
    const rem = sec % 60;
    if (min < 60) return rem ? `${min} 分 ${rem} 秒` : `${min} 分`;
    const hr = Math.floor(min / 60);
    const minRem = min % 60;
    return minRem ? `${hr} 小時 ${minRem} 分` : `${hr} 小時`;
  }

  function startNavSession() {
    if (!state.navTargetId) {
      setMessage("請先設定導航目標再開始導航。");
      return;
    }
    state.navSessionState = "active";
    state.navSessionStartedAt = Date.now();
    state.navSessionPausedAt = null;
    state.navPauseAccumulatedMs = 0;
    state.arrivedTarget = false;
    state.lastArrivalNoticeKey = "";
    state.activeLegIndex = 0;
    resetRouteProgressBaseline();
    const target = state.savedAnchors.find(a => a.id === state.navTargetId);
    setMessage(`開始導航：${target ? target.name : "目標"}`);
    speakText(`開始導航，前往 ${target ? target.name : "目標"}`);
    render();
  }

  function pauseNavSession() {
    if (state.navSessionState !== "active") return;
    state.navSessionState = "paused";
    state.navSessionPausedAt = Date.now();
    setMessage("導航已暫停。");
    speakText("導航已暫停");
    render();
  }

  function resumeNavSession() {
    if (state.navSessionState !== "paused" || !state.navSessionPausedAt) return;
    state.navPauseAccumulatedMs += Date.now() - state.navSessionPausedAt;
    state.navSessionPausedAt = null;
    state.navSessionState = "active";
    setMessage("導航已繼續。");
    speakText("導航已繼續");
    render();
  }

  function finishNavSession(finalStatus = "completed") {
    if (state.navSessionState === "idle" || !state.navSessionStartedAt) return;
    const target = state.savedAnchors.find(a => a.id === state.navTargetId);
    const total = Math.max(state.startedRouteDistance || getCurrentRouteTotalDistance(), 0);
    const record = {
      id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
      targetId: state.navTargetId,
      targetName: target ? target.name : "未命名目標",
      startedAt: state.navSessionStartedAt,
      endedAt: Date.now(),
      durationMs: sessionDurationMs(Date.now()),
      durationText: durationTextFromMs(sessionDurationMs(Date.now())),
      totalDistance: total,
      totalDistanceText: `${total.toFixed(1)} m`,
      routeMode: state.routeMode,
      waypointCount: state.waypointIds.length,
      status: finalStatus
    };
    state.navHistory.unshift(record);
    persistNavHistory();
    state.navSessionState = "idle";
    state.navSessionStartedAt = null;
    state.navSessionPausedAt = null;
    state.navPauseAccumulatedMs = 0;
    setMessage(finalStatus === "arrived" ? "本次導航完成並已記錄。" : "本次導航已結束並記錄。");
    render();
  }

  function exportNavHistory() {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      history: state.navHistory
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `indoor-nav-history-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("已匯出導航歷史。");
  }



  function loadMapElements() {
    try {
      state.mapElements = loadJsonArrayStorage(STORAGE_KEYS.mapElements);
    } catch (e) {
      state.mapElements = [];
    }
    renderMapElements();
  }

  function persistMapElements() {
    saveJsonStorage(STORAGE_KEYS.mapElements, state.mapElements);
    renderMapElements();
    drawEditorCanvas();
  }
