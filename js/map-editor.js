// map editor and route-network functions extracted from app.js for maintainability.

  function setEditorMode(mode) {
    state.editorMode = mode;
    state.editorDraftPoints = [];
    const modeText = mode === "point" ? "point" : mode === "line" ? "line" : mode === "area" ? "area" : "idle";
    setEditorMessage(
      mode === "point" ? "點位模式：點一下畫布建立點位。" :
      mode === "line" ? "線段模式：依序點兩個位置建立線段。" :
      mode === "area" ? "區域模式：依序點四個角點建立矩形/多邊形區域。" :
      "瀏覽模式：查看目前地圖元素。"
    );
    render();
  }

  function editorCanvasToWorld(evt) {
    const wrap = $("editorCanvasWrap");
    const canvas = $("editorCanvas");
    const rect = canvas.getBoundingClientRect();
    const local = {
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top
    };
    return viewportScreenToWorld(local, state.editorViewport, wrap);
  }

  function currentEditorName() {
    return $("editorNameInput")?.value?.trim() || "未命名";
  }

  function addMapElement(el) {
    state.mapElements.unshift(el);
    persistMapElements();
  }

  function handleEditorCanvasClick(evt) {
    const world = editorCanvasToWorld(evt);
    const name = currentEditorName();
    const now = new Date().toISOString();

    if (state.editorMode === "idle") {
      const hitId = hitTestMapElement(world.x, world.y);
      if (hitId) {
        selectMapElement(hitId);
      } else {
        state.selectedMapElementId = "";
        render();
      }
      return;
    }

    if (state.editorMode === "point") {
      addMapElement({
        id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
        type: "point",
        name,
        x: Number(world.x.toFixed(2)),
        y: Number(world.y.toFixed(2)),
        semantic: currentEditorSemantic(),
        createdAt: now
      });
      if (state.anchorCreationMode) {
        const heading = Math.round(normalizeAngle(state.orientation.heading || latestPose().heading || 0));
        const anchor = {
          id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + 1),
          name,
          x: Number(world.x.toFixed(2)),
          y: Number(world.y.toFixed(2)),
          heading,
          source: "map-point",
          payload: `INDOOR_ANCHOR:${Number(world.x.toFixed(2))},${Number(world.y.toFixed(2))},${heading}`,
          createdAt: now
        };
        state.savedAnchors.unshift(anchor);
        persistSavedAnchors();
        state.anchorCreationMode = false;
        setEditorMessage(`已在地圖上新增標定點：${name}`);
      } else {
        setEditorMessage(`已新增點位：${name} (${world.x.toFixed(1)}, ${world.y.toFixed(1)})`);
      }
      render();
      return;
    }

    if (state.editorMode === "line") {
      const snapped = snapPointToNearbyEndpoint(world);
      state.editorDraftPoints.push({ x: snapped.x, y: snapped.y });
      if (state.editorDraftPoints.length < 2) {
        setEditorMessage("線段模式：已記錄第 1 個點，請再點第 2 個點。");
        drawEditorCanvas();
        return;
      }
      const [a, b] = state.editorDraftPoints;
      addMapElement({
        id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
        type: "line",
        name,
        points: [
          { x: Number(a.x.toFixed(2)), y: Number(a.y.toFixed(2)) },
          { x: Number(b.x.toFixed(2)), y: Number(b.y.toFixed(2)) }
        ],
        semantic: currentEditorSemantic(),
        createdAt: now
      });
      state.editorDraftPoints = [];
      normalizeLineNetwork();
      setEditorMessage(`已新增線段：${name}`);
      render();
      return;
    }

    if (state.editorMode === "area") {
      state.editorDraftPoints.push(world);
      if (state.editorDraftPoints.length < 4) {
        setEditorMessage(`區域模式：已記錄 ${state.editorDraftPoints.length} / 4 個點。`);
        drawEditorCanvas();
        return;
      }
      addMapElement({
        id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
        type: "area",
        name,
        points: state.editorDraftPoints.map(p => ({
          x: Number(p.x.toFixed(2)),
          y: Number(p.y.toFixed(2))
        })),
        semantic: currentEditorSemantic(),
        createdAt: now
      });
      state.editorDraftPoints = [];
      setEditorMessage(`已新增區域：${name}`);
      render();
    }
  }

  function drawEditorCanvas() {
    const canvas = $("editorCanvas");
    const wrapEl = $("editorCanvasWrap");
    if (!canvas || !wrapEl) return;
    ensureCanvasSize(canvas, wrapEl);
    updateFilteredPose();
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid(ctx, wrapEl, state.editorViewport);
    drawCrosshair(ctx, wrapEl, state.editorViewport);
    ctx.font = "12px system-ui, sans-serif";

    drawMapElementsOnCanvas(ctx, true, state.editorViewport, wrapEl);

    if (state.trail.length) {
      const displayTrail = getDisplayTrail();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = lineWidthForWorld(3, state.editorViewport);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      displayTrail.forEach((p, i) => {
        const pt = viewportWorldToScreen({ x: Number(p.x || 0), y: Number(p.y || 0) }, state.editorViewport, wrapEl);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();

      const start = state.trail[0];
      const last = latestPose();

      const startPt = viewportWorldToScreen({ x: Number(start.x || 0), y: Number(start.y || 0) }, state.editorViewport, wrapEl);
      ctx.fillStyle = "#16a34a";
      ctx.beginPath();
      ctx.arc(startPt.x, startPt.y, fixedRadius(8), 0, Math.PI * 2);
      ctx.fill();
      labelBox(ctx, startPt.x + 10, startPt.y - 10, "起點", "#166534");

      const lastPt = viewportWorldToScreen({ x: Number(last.x || 0), y: Number(last.y || 0) }, state.editorViewport, wrapEl);
      ctx.fillStyle = "#dc2626";
      ctx.beginPath();
      ctx.arc(lastPt.x, lastPt.y, fixedRadius(8), 0, Math.PI * 2);
      ctx.fill();
      labelBox(ctx, lastPt.x + 10, lastPt.y - 10, "目前位置", "#991b1b");
    }

    drawScaleRuler(ctx, wrapEl, state.editorViewport, "bottom-left");
    drawStartToCurrentDistanceBadge(ctx, wrapEl, state.editorViewport, "起點→目前位置");

    if (state.savedAnchors.length) {
      state.savedAnchors.forEach((a) => {
        const pt = viewportWorldToScreen({ x: Number(a.x || 0), y: Number(a.y || 0) }, state.editorViewport, wrapEl);
        ctx.fillStyle = "#2563eb";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, fixedRadius(5), 0, Math.PI * 2);
        ctx.fill();
        labelBox(ctx, pt.x + 8, pt.y - 8, a.name || "anchor", "#1e3a8a");
      });
    }

    if (state.editorDraftPoints.length) {
      ctx.strokeStyle = "#ef4444";
      ctx.fillStyle = "#ef4444";
      ctx.lineWidth = lineWidthForWorld(2, state.editorViewport);
      ctx.beginPath();
      state.editorDraftPoints.forEach((p, i) => {
        const pt = viewportWorldToScreen({ x: Number(p.x || 0), y: Number(p.y || 0) }, state.editorViewport, wrapEl);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, fixedRadius(5), 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  function renderMapElements() {

    const el = $("mapElementList");
    if (!el) return;
    if (!state.mapElements.length) {
      el.innerHTML = '<div class="item">尚未建立任何地圖元素。</div>';
      return;
    }
    el.innerHTML = state.mapElements.map((m) => `
      <div class="item">
        <div class="item-top">
          <strong>${m.name || "未命名"}</strong>
          <span style="display:flex; gap:6px; align-items:center;"><span class="badge">${m.type}</span><span class="badge">${m.semantic || "walkable"}</span>${m.source === "anchor" ? '<span class="badge">anchor</span>' : ""}</span>
        </div>
        ${
          m.type === "point"
            ? `<div>x: ${m.x} / y: ${m.y}</div>`
            : `<div>points: ${(m.points || []).map(p => `(${p.x}, ${p.y})`).join(" -> ")}</div>`
        }
        <div class="btns" style="margin-top:10px; margin-bottom:0;">
          <button data-map-select="${m.id}">選取</button>
          <button data-map-load="${m.id}">載入名稱</button>
          <button data-map-anchor="${m.id}" class="secondary">轉 Anchor</button>
          <button data-map-del="${m.id}" class="danger">刪除</button>
        </div>
      </div>
    `).join("");

    el.querySelectorAll("[data-map-select]").forEach(btn => {
      btn.addEventListener("click", () => selectMapElement(btn.getAttribute("data-map-select")));
    });

    el.querySelectorAll("[data-map-load]").forEach(btn => {
      btn.addEventListener("click", () => {
        const m = state.mapElements.find(x => x.id === btn.getAttribute("data-map-load"));
        if (!m) return;
        $("editorNameInput").value = m.name || "";
        render();
      });
    });

    el.querySelectorAll("[data-map-del]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-map-del");
        state.mapElements = state.mapElements.filter(x => x.id !== id);
        persistMapElements();
      });
    });
    el.querySelectorAll("[data-map-anchor]").forEach(btn => {
      btn.addEventListener("click", () => convertMapElementToAnchorById(btn.getAttribute("data-map-anchor")));
    });
  }

  function undoMapElement() {
    if (state.editorDraftPoints.length) {
      state.editorDraftPoints.pop();
      drawEditorCanvas();
      return;
    }
    state.mapElements.shift();
    persistMapElements();
  }

  function exportMapData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      mapElements: state.mapElements
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `indoor-map-data-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setEditorMessage("已匯出地圖 JSON。");
  }

  async function importMapData(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const elements = Array.isArray(data) ? data : data.mapElements;
      if (!Array.isArray(elements)) throw new Error("JSON 裡找不到 mapElements 陣列");
      state.mapElements = elements;
      persistMapElements();
      setEditorMessage(`已匯入 ${elements.length} 個地圖元素。`);
    } catch (e) {
      alert("匯入失敗：" + e.message);
    }
  }



  function selectedMapElement() {
    return state.mapElements.find(x => x.id === state.selectedMapElementId) || null;
  }

  function selectMapElement(id) {
    state.selectedMapElementId = id || "";
    const el = selectedMapElement();
    if ($("selectedMapElementType")) $("selectedMapElementType").textContent = el ? el.type : "none";
    if ($("selectedMapElementName")) $("selectedMapElementName").value = el ? (el.name || "") : "";
    if ($("selectedMapElementSemantic")) $("selectedMapElementSemantic").value = el ? (el.semantic || "walkable") : "walkable";
    if (el) {
      setEditorMessage(`已選取元素：${el.name || "未命名"} (${el.type})`);
    }
    render();
  }

  function updateSelectedMapElementName() {
    const el = selectedMapElement();
    if (!el) {
      alert("請先選一個地圖元素");
      return;
    }
    const name = $("selectedMapElementName").value.trim() || "未命名";
    const semantic = $("selectedMapElementSemantic").value || "walkable";
    el.name = name;
    el.semantic = semantic;
    persistMapElements();
    setEditorMessage(`已更新元素名稱：${name}`);
    render();
  }

  function deleteSelectedMapElement() {
    const el = selectedMapElement();
    if (!el) {
      alert("請先選一個地圖元素");
      return;
    }
    if (!confirm(`確定要刪除「${el.name || "未命名"}」嗎？`)) return;
    state.mapElements = state.mapElements.filter(x => x.id !== el.id);
    state.selectedMapElementId = "";
    persistMapElements();
    setEditorMessage("已刪除所選地圖元素。");
    render();
  }

  function hitTestMapElement(worldX, worldY) {
    const threshold = 1.2;
    for (const el of state.mapElements) {
      const isSelected = el.id === state.selectedMapElementId;
      if (el.type === "point") {
        const dx = Number(el.x || 0) - worldX;
        const dy = Number(el.y || 0) - worldY;
        if (Math.sqrt(dx * dx + dy * dy) <= threshold) return el.id;
      } else if (el.type === "line" && Array.isArray(el.points) && el.points.length >= 2) {
        const [a, b] = el.points;
        const ax = Number(a.x || 0), ay = Number(a.y || 0), bx = Number(b.x || 0), by = Number(b.y || 0);
        const abx = bx - ax, aby = by - ay;
        const apx = worldX - ax, apy = worldY - ay;
        const ab2 = abx * abx + aby * aby || 1;
        const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
        const cx = ax + t * abx, cy = ay + t * aby;
        const dx = cx - worldX, dy = cy - worldY;
        if (Math.sqrt(dx * dx + dy * dy) <= threshold) return el.id;
      } else if (el.type === "area" && Array.isArray(el.points) && el.points.length >= 3) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        el.points.forEach((p) => {
          minX = Math.min(minX, Number(p.x || 0));
          minY = Math.min(minY, Number(p.y || 0));
          maxX = Math.max(maxX, Number(p.x || 0));
          maxY = Math.max(maxY, Number(p.y || 0));
        });
        if (worldX >= minX && worldX <= maxX && worldY >= minY && worldY <= maxY) return el.id;
      }
    }
    return "";
  }



  function pointElementToAnchor(pointEl) {
    if (!pointEl || pointEl.type !== "point") return null;
    return {
      id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
      name: pointEl.name || "未命名校正點",
      x: Number(pointEl.x ?? 0),
      y: Number(pointEl.y ?? 0),
      heading: null,
      payload: `INDOOR_ANCHOR:${Number(pointEl.x ?? 0)},${Number(pointEl.y ?? 0)}`,
      createdAt: new Date().toISOString()
    };
  }

  function saveAnchorObject(anchor) {
    if (!anchor) return false;
    const exists = state.savedAnchors.findIndex(a => a.name === anchor.name);
    if (exists >= 0) {
      state.savedAnchors[exists] = anchor;
    } else {
      state.savedAnchors.unshift(anchor);
    }
    persistSavedAnchors();
    return true;
  }

  function convertSelectedMapElementToAnchor() {
    const el = selectedMapElement();
    if (!el) {
      alert("請先選一個地圖元素");
      return;
    }
    if (el.type !== "point") {
      alert("目前只有點位元素可以直接轉成 Anchor。");
      return;
    }
    const anchor = pointElementToAnchor(el);
    if (saveAnchorObject(anchor)) {
      setEditorMessage(`已將點位「${el.name || "未命名"}」轉成 Anchor。`);
      setMessage(`已新增 Anchor：${anchor.name}`);
      render();
    }
  }

  function convertMapElementToAnchorById(id) {
    const el = state.mapElements.find(x => x.id === id);
    if (!el) return;
    if (el.type !== "point") {
      alert("目前只有點位元素可以直接轉成 Anchor。");
      return;
    }
    const anchor = pointElementToAnchor(el);
    if (saveAnchorObject(anchor)) {
      setEditorMessage(`已將點位「${el.name || "未命名"}」轉成 Anchor。`);
      setMessage(`已新增 Anchor：${anchor.name}`);
      render();
    }
  }



  function anchorToPointMapElement(anchor) {
    if (!anchor) return null;
    return {
      id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
      type: "point",
      name: anchor.name || "未命名校正點",
      x: Number(anchor.x ?? 0),
      y: Number(anchor.y ?? 0),
      source: "anchor",
      anchorId: anchor.id || "",
      createdAt: new Date().toISOString()
    };
  }

  function syncAnchorToMapById(anchorId) {
    const anchor = state.savedAnchors.find(a => a.id === anchorId);
    if (!anchor) return;

    const existing = state.mapElements.find(
      (m) => m.type === "point" && (m.anchorId === anchor.id || (m.source === "anchor" && m.name === anchor.name))
    );

    if (existing) {
      existing.name = anchor.name || existing.name;
      existing.x = Number(anchor.x ?? existing.x ?? 0);
      existing.y = Number(anchor.y ?? existing.y ?? 0);
      existing.source = "anchor";
      existing.anchorId = anchor.id || existing.anchorId || "";
    } else {
      const point = anchorToPointMapElement(anchor);
      if (point) state.mapElements.unshift(point);
    }

    persistMapElements();
    setMessage(`已將 Anchor「${anchor.name || "未命名"}」同步到地圖。`);
    render();
  }

  function syncAllAnchorsToMap() {
    if (!state.savedAnchors.length) {
      alert("目前沒有可同步的 Anchor。");
      return;
    }
    state.savedAnchors.forEach((a) => {
      const existing = state.mapElements.find(
        (m) => m.type === "point" && (m.anchorId === a.id || (m.source === "anchor" && m.name === a.name))
      );
      if (existing) {
        existing.name = a.name || existing.name;
        existing.x = Number(a.x ?? existing.x ?? 0);
        existing.y = Number(a.y ?? existing.y ?? 0);
        existing.source = "anchor";
        existing.anchorId = a.id || existing.anchorId || "";
      } else {
        const point = anchorToPointMapElement(a);
        if (point) state.mapElements.unshift(point);
      }
    });
    persistMapElements();
    setMessage(`已同步 ${state.savedAnchors.length} 個 Anchor 到地圖。`);
    render();
  }



  function networkLineElements() {
    return state.mapElements.filter((m) => m.type === "line" && Array.isArray(m.points) && m.points.length >= 2 && (m.semantic || "walkable") !== "wall" && (m.semantic || "walkable") !== "restricted");
  }

  function pointKey(p) {
    return `${Number(p.x).toFixed(2)},${Number(p.y).toFixed(2)}`;
  }

  function nearestGraphNode(target, nodes) {
    if (!nodes.length) return null;
    let best = null;
    let bestDist = Infinity;
    for (const n of nodes) {
      const d = distanceBetween(target, n);
      if (d < bestDist) {
        bestDist = d
        best = n
      }
    }
    return best;
  }

  function buildLineGraph() {
    const nodesMap = new Map();
    const edges = new Map();

    const ensureNode = (p) => {
      let existing = null;
      for (const node of nodesMap.values()) {
        if (distanceBetween(node, p) <= state.snapThreshold) {
          existing = node;
          break;
        }
      }
      if (existing) {
        if (!edges.has(existing.key)) edges.set(existing.key, []);
        return existing;
      }

      const key = pointKey(p);
      if (!nodesMap.has(key)) {
        nodesMap.set(key, { x: Number(p.x), y: Number(p.y), key });
      }
      if (!edges.has(key)) edges.set(key, []);
      return nodesMap.get(key);
    };

    networkLineElements().forEach((line) => {
      for (let i = 1; i < line.points.length; i++) {
        const a = ensureNode(line.points[i - 1]);
        const b = ensureNode(line.points[i]);
        const w = distanceBetween(a, b);
        if (!segmentBlockedByWalls(a, b) && !pointInsideRestrictedArea(a) && !pointInsideRestrictedArea(b)) {
          edges.get(a.key).push({ to: b.key, weight: w });
          edges.get(b.key).push({ to: a.key, weight: w });
        }
      }
    });

    return { nodes: Array.from(nodesMap.values()), edges, nodesMap };
  }

  function shortestPathOnGraph(start, goal, graph) {
    if (!start || !goal) return [];
    const dist = new Map();
    const prev = new Map();
    const unvisited = new Set(graph.nodes.map((n) => n.key));

    graph.nodes.forEach((n) => dist.set(n.key, Infinity));
    dist.set(start.key, 0);

    while (unvisited.size) {
      let currentKey = null;
      let currentDist = Infinity;
      for (const key of unvisited) {
        const d = dist.get(key);
        if (d < currentDist) {
          currentDist = d;
          currentKey = key;
        }
      }
      if (!currentKey || currentDist === Infinity) break;
      if (currentKey === goal.key) break;

      unvisited.delete(currentKey);
      for (const edge of graph.edges.get(currentKey) || []) {
        if (!unvisited.has(edge.to)) continue;
        const alt = currentDist + edge.weight;
        if (alt < (dist.get(edge.to) || Infinity)) {
          dist.set(edge.to, alt);
          prev.set(edge.to, currentKey);
        }
      }
    }

    const path = [];
    let cursor = goal.key;
    while (cursor) {
      const node = graph.nodesMap.get(cursor);
      if (node) path.unshift({ x: node.x, y: node.y, key: node.key });
      cursor = prev.get(cursor);
      if (cursor === start.key) {
        const s = graph.nodesMap.get(start.key);
        if (s) path.unshift({ x: s.x, y: s.y, key: s.key });
        break;
      }
    }

    if (!path.length) return [];
    if (path[0].key !== start.key) {
      const s = graph.nodesMap.get(start.key);
      if (s) path.unshift({ x: s.x, y: s.y, key: s.key });
    }
    return path;
  }

  function routeDistanceFromPoints(points) {
    if (!points || points.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += distanceBetween(points[i - 1], points[i]);
    }
    return total;
  }

  function computeNetworkRoute() {
    const target = state.savedAnchors.find(a => a.id === state.navTargetId);
    const current = latestPose();
    if (!target) {
      state.plannedRoutePoints = [];
      return [];
    }

    const graph = buildLineGraph();
    if (!graph.nodes.length) {
      state.plannedRoutePoints = [
        { x: Number(current.x || 0), y: Number(current.y || 0), name: "目前位置" },
        { x: Number(target.x || 0), y: Number(target.y || 0), name: target.name || "目標" }
      ];
      return state.plannedRoutePoints;
    }

    const startNode = nearestGraphNode({ x: Number(current.x || 0), y: Number(current.y || 0) }, graph.nodes);
    const goalNode = nearestGraphNode({ x: Number(target.x || 0), y: Number(target.y || 0) }, graph.nodes);
    const path = shortestPathOnGraph(startNode, goalNode, graph);

    const route = [];
    route.push({ x: Number(current.x || 0), y: Number(current.y || 0), name: "目前位置" });

    if (startNode && distanceBetween(current, startNode) > 0.1) {
      route.push({ x: startNode.x, y: startNode.y, name: "起始線段點" });
    }

    path.forEach((p, idx) => {
      if (idx === 0 && startNode && p.key === startNode.key) return;
      if (goalNode && idx === path.length - 1 && p.key === goalNode.key) {
        route.push({ x: p.x, y: p.y, name: "目標線段點" });
      } else {
        route.push({ x: p.x, y: p.y, name: `路網點 ${idx + 1}` });
      }
    });

    if (!goalNode || distanceBetween(target, goalNode) > 0.1) {
      route.push({ x: Number(target.x || 0), y: Number(target.y || 0), name: target.name || "目標" });
    } else {
      route.push({ x: Number(target.x || 0), y: Number(target.y || 0), name: target.name || "目標" });
    }

    // dedupe adjacent identical
    const deduped = [];
    for (const p of route) {
      const prev = deduped[deduped.length - 1];
      if (!prev || distanceBetween(prev, p) > 0.05) deduped.push(p);
    }

    state.plannedRoutePoints = deduped;
    return deduped;
  }



  function getAllLineEndpoints() {
    const pts = [];
    state.mapElements.forEach((el) => {
      if (el.type === "line" && Array.isArray(el.points)) {
        el.points.forEach((p) => pts.push({ x: Number(p.x || 0), y: Number(p.y || 0) }));
      }
    });
    return pts;
  }

  function snapPointToNearbyEndpoint(p) {
    if (!state.snapEnabled) return { x: p.x, y: p.y, snapped: false };
    let best = null;
    let bestDist = Infinity;
    getAllLineEndpoints().forEach((ep) => {
      const dx = ep.x - p.x;
      const dy = ep.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) {
        bestDist = d;
        best = ep;
      }
    });
    if (best && bestDist <= state.snapThreshold) {
      return { x: best.x, y: best.y, snapped: true };
    }
    return { x: p.x, y: p.y, snapped: false };
  }

  function segmentIntersection(a, b, c, d) {
    const denom = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
    if (Math.abs(denom) < 1e-9) return null;
    const px = ((a.x * b.y - a.y * b.x) * (c.x - d.x) - (a.x - b.x) * (c.x * d.y - c.y * d.x)) / denom;
    const py = ((a.x * b.y - a.y * b.x) * (c.y - d.y) - (a.y - b.y) * (c.x * d.y - c.y * d.x)) / denom;

    function within(p1, p2, q) {
      return q >= Math.min(p1, p2) - 1e-6 && q <= Math.max(p1, p2) + 1e-6;
    }

    if (
      within(a.x, b.x, px) && within(a.y, b.y, py) &&
      within(c.x, d.x, px) && within(c.y, d.y, py)
    ) {
      return { x: Number(px.toFixed(2)), y: Number(py.toFixed(2)) };
    }
    return null;
  }

  function splitLineByIntersections(line, intersections) {
    if (!intersections.length) return [line];
    const pts = [
      { x: Number(line.points[0].x), y: Number(line.points[0].y) },
      ...intersections,
      { x: Number(line.points[1].x), y: Number(line.points[1].y) }
    ];

    const a = pts[0];
    pts.sort((p1, p2) => {
      const d1 = (p1.x - a.x) ** 2 + (p1.y - a.y) ** 2;
      const d2 = (p2.x - a.x) ** 2 + (p2.y - a.y) ** 2;
      return d1 - d2;
    });

    const dedup = [];
    pts.forEach((p) => {
      const prev = dedup[dedup.length - 1];
      if (!prev || Math.hypot(prev.x - p.x, prev.y - p.y) > 0.05) dedup.push(p);
    });

    const pieces = [];
    for (let i = 1; i < dedup.length; i++) {
      pieces.push({
        id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + i),
        type: "line",
        name: line.name,
        points: [
          { x: Number(dedup[i - 1].x.toFixed(2)), y: Number(dedup[i - 1].y.toFixed(2)) },
          { x: Number(dedup[i].x.toFixed(2)), y: Number(dedup[i].y.toFixed(2)) }
        ],
        createdAt: line.createdAt,
        source: line.source,
        anchorId: line.anchorId
      });
    }
    return pieces;
  }

  function normalizeLineNetwork() {
    if (!state.autoIntersectEnabled) return;
    const lines = state.mapElements.filter((m) => m.type === "line" && Array.isArray(m.points) && m.points.length >= 2);
    if (lines.length < 2) return;

    const lineIntersections = new Map();
    lines.forEach((l) => lineIntersections.set(l.id, []));

    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const a1 = { x: Number(lines[i].points[0].x), y: Number(lines[i].points[0].y) };
        const a2 = { x: Number(lines[i].points[1].x), y: Number(lines[i].points[1].y) };
        const b1 = { x: Number(lines[j].points[0].x), y: Number(lines[j].points[0].y) };
        const b2 = { x: Number(lines[j].points[1].x), y: Number(lines[j].points[1].y) };
        const hit = segmentIntersection(a1, a2, b1, b2);
        if (hit) {
          const isEndpointHit =
            (Math.hypot(hit.x - a1.x, hit.y - a1.y) < 0.05) ||
            (Math.hypot(hit.x - a2.x, hit.y - a2.y) < 0.05) ||
            (Math.hypot(hit.x - b1.x, hit.y - b1.y) < 0.05) ||
            (Math.hypot(hit.x - b2.x, hit.y - b2.y) < 0.05);
          if (!isEndpointHit) {
            lineIntersections.get(lines[i].id).push(hit);
            lineIntersections.get(lines[j].id).push(hit);
          }
        }
      }
    }

    let changed = false
    const nextElements = [];
    state.mapElements.forEach((el) => {
      if (el.type !== "line" || !lineIntersections.has(el.id)) {
        nextElements.push(el);
        return;
      }
      const hits = lineIntersections.get(el.id);
      if (!hits.length) {
        nextElements.push(el);
        return;
      }
      changed = true
      splitLineByIntersections(el, hits).forEach((piece) => nextElements.push(piece));
    });

    if (changed) {
      state.mapElements = nextElements;
      persistMapElements();
      setEditorMessage("已完成路網修正：交點已節點化。");
    }
  }



  function currentEditorSemantic() {
    return $("editorElementSemantic")?.value || "walkable";
  }

  function ccw(A, B, C) {
    return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
  }

  function segmentsCross(a, b, c, d) {
    // Exclude shared endpoints / near-touch as blocking crossings
    const shared =
      distanceBetween(a, c) < 0.05 || distanceBetween(a, d) < 0.05 ||
      distanceBetween(b, c) < 0.05 || distanceBetween(b, d) < 0.05;
    if (shared) return false;
    return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
  }

  function segmentBlockedByWalls(a, b) {
    const walls = state.mapElements.filter(m => m.semantic === "wall" && m.type === "line" && Array.isArray(m.points) && m.points.length >= 2);
    return walls.some((w) => {
      const p1 = { x: Number(w.points[0].x || 0), y: Number(w.points[0].y || 0) };
      const p2 = { x: Number(w.points[1].x || 0), y: Number(w.points[1].y || 0) };
      return segmentsCross(a, b, p1, p2);
    });
  }

  function pointInsideRestrictedArea(p) {
    const areas = state.mapElements.filter(m => m.semantic === "restricted" && m.type === "area" && Array.isArray(m.points) && m.points.length >= 3);
    return areas.some((area) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      area.points.forEach(pt => {
        minX = Math.min(minX, Number(pt.x || 0));
        minY = Math.min(minY, Number(pt.y || 0));
        maxX = Math.max(maxX, Number(pt.x || 0));
        maxY = Math.max(maxY, Number(pt.y || 0));
      });
      return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
    });
  }


  function render() {
    $("messageBox").textContent = state.message;
    $("guidanceBanner").textContent = state.currentGuidanceText;
    $("toggleVoiceGuide").checked = state.voiceGuideEnabled;
    $("btnNavSessionStart").disabled = !state.navTargetId || state.navSessionState === "active";
    $("btnNavSessionPause").disabled = state.navSessionState !== "active";
    $("btnNavSessionResume").disabled = state.navSessionState !== "paused";
    $("btnNavSessionEnd").disabled = state.navSessionState === "idle";
    const editorModeBadge = $("editorModeBadge");
    if (editorModeBadge) editorModeBadge.textContent = state.editorMode;
    const editorDraftInfo = $("editorDraftInfo");
    if (editorDraftInfo) editorDraftInfo.textContent = $("editorNameInput") ? ($("editorNameInput").value.trim() || "未命名") : "未命名";
    if ($("toggleSnapMode")) $("toggleSnapMode").checked = state.snapEnabled;
    if ($("editorElementSemantic")) $("editorElementSemantic").value = $("editorElementSemantic").value || "walkable";
    if ($("toggleAutoIntersect")) $("toggleAutoIntersect").checked = state.autoIntersectEnabled;
    const editorMessageBox = $("editorMessageBox");
    if (editorMessageBox) editorMessageBox.textContent = state.editorMessage;
    const selectedEl = selectedMapElement();
    if ($("selectedMapElementType")) $("selectedMapElementType").textContent = selectedEl ? selectedEl.type : "none";
    $("permissionBadge").textContent = state.permissionState;
    $("gpsBadge").textContent = gpsBadgeText();
    $("trackBadge").textContent = state.tracking ? "tracking" : "idle";

    const pose = latestPose();
    $("poseValue").textContent = `x ${fmt(pose.x)} m / y ${fmt(pose.y)} m`;
    $("headingValue").textContent = `${fmt(pose.heading, 1)}°`;
    $("gpsAccValue").textContent = state.geoReading ? `${fmt(state.geoReading.accuracy, 1)} m` : "-";
    $("stepCountValue").textContent = String(state.stepCount);
    $("accValue").textContent = `${fmt(state.motion.ax)}, ${fmt(state.motion.ay)}, ${fmt(state.motion.az)}`;
    $("motionValue").textContent = `raw ${fmt(state.motionMagnitude)} / smooth ${fmt(state.smoothedMagnitude)}`;
    $("lastStepValue").textContent = state.lastStepAt ? new Date(state.lastStepAt).toLocaleTimeString() : "-";
    $("geoValue").textContent = state.geoReading ? `${fmt(state.geoReading.lat, 6)}, ${fmt(state.geoReading.lng, 6)}` : "-";
    $("stepLengthValue").textContent = `${fmt(state.stepLength, 2)} m`;
    $("toggleAnchorOverlay").checked = state.showAnchorOverlay;
    $("toggleMapOverlay").checked = state.showMapOverlay;
    $("arrivalThresholdInput").value = String(state.arrivalThreshold);
    renderRouteControls();
    updateTargetSummary();


    $("btnStop").disabled = !state.tracking;
    $("btnStart").disabled = state.tracking;
    $("btnPosCorrection").disabled = state.positionSampleMode || !state.geoReading;
    $("btnHeadingCorrection").disabled = state.headingSampleMode;

    $("btnPosCorrection").textContent = state.positionSampleMode ? "位置收樣中..." : "按鈕 1：位置校正";
    $("btnHeadingCorrection").textContent = state.headingSampleMode ? "方向收樣中..." : "按鈕 2：方向校正";

    updateGuidanceBanner(false);
    renderArrowGuidance();
    renderRouteProgress();
    renderCorrections();
    updateAnchorCorrectionSelect();
    updateAutoStepStatus();
    ensureNavViewportVisible(false);
    drawTrack();
    drawEditorCanvas();
    renderMapElements();
    refreshViewportUI();
  }

  async function requestPermissions() {
    try {
      if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
        await DeviceMotionEvent.requestPermission();
      }
      if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
        await DeviceOrientationEvent.requestPermission();
      }
      if (!navigator.geolocation) throw new Error("此瀏覽器不支援 Geolocation。");

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
            ts: Date.now()
          };
          state.geoReading = next;
          if (!state.anchor) state.anchor = { lat: next.lat, lng: next.lng };
          updateAutoStepCalibration(next);
          state.permissionState = "granted";
          setMessage("授權完成，可以開始追蹤。建議先在入口或窗邊設定起點。");
        },
        (err) => {
          state.permissionState = "denied";
          setMessage(`定位授權失敗：${err.message}`);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } catch (err) {
      state.permissionState = "denied";
      setMessage(`感測器授權失敗：${err.message}`);
    }
  }

  function handleOrientation(event) {
    const webkitHeading = event.webkitCompassHeading;
    const alphaHeading = typeof event.alpha === "number" ? 360 - event.alpha : 0;
    const heading = normalizeAngle(typeof webkitHeading === "number" ? webkitHeading : alphaHeading);
    state.orientation = { heading, supported: true };
    state.currentPose.heading = heading;
    render();
  }

  function maybeFinishStepCalibration() {
    if (!state.calibratingStepLength) return;
    const walked = state.stepCount - state.stepCalStart;
    if (walked >= 10) {
      const meters = Number(prompt("請輸入你剛剛 10 步實際走了幾公尺（例如 7.2）", "7.2"));
      if (Number.isFinite(meters) && meters > 0) {
        state.stepLength = meters / 10;
        $("stepLength").value = String(Math.min(1.0, Math.max(0.4, state.stepLength)));
        setMessage(`步長校正完成：新步長 ${fmt(state.stepLength, 2)} m/步。`);
      } else {
        setMessage("步長校正取消：輸入不是有效距離。");
      }
      state.calibratingStepLength = false;
      render();
    }
  }

  function handleMotion(event) {
    const acc = event.accelerationIncludingGravity || event.acceleration;
    const ax = acc?.x ?? 0;
    const ay = acc?.y ?? 0;
    const az = acc?.z ?? 0;
    const magnitude = Math.sqrt(ax * ax + ay * ay + az * az);
    const nextSmoothed = smoothedMagnitudeRef * (1 - STEP_SMOOTHING) + magnitude * STEP_SMOOTHING;
    const delta = magnitude - nextSmoothed;

    smoothedMagnitudeRef = nextSmoothed;
    state.motion = { ax, ay, az, supported: true };
    state.motionMagnitude = magnitude;
    state.smoothedMagnitude = nextSmoothed;

    if (!state.tracking) {
      render();
      return;
    }

    const now = Date.now();
    if (delta > STEP_THRESHOLD && now - lastStepAtRef > STEP_DEBOUNCE_MS) {
      lastStepAtRef = now;
      state.lastStepAt = now;
      state.stepCount += 1;
      const last = latestPose();
      const heading = state.orientation.heading;
      const rad = (heading * Math.PI) / 180;
      const next = {
        x: last.x + Math.sin(rad) * state.stepLength,
        y: last.y - Math.cos(rad) * state.stepLength,
        heading,
        t: now
      };
      state.currentPose = next;
      state.trail.push(next);
      maybeFinishStepCalibration();
      updateArrivalProgress();
    }
    render();
  }

  function startTracking() {
    if (state.permissionState !== "granted") {
      setMessage("請先授權。iPhone 通常需要按鈕觸發權限。");
      return;
    }
    state.tracking = true;
    if (geoWatchId != null) navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        state.geoReading = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          ts: Date.now()
        };
        updateAutoStepCalibration(state.geoReading);
        if (state.tracking && Number.isFinite(state.geoReading.accuracy) && state.geoReading.accuracy <= 10 && Date.now() - state.lastGeoCorrectionAt > 12000) {
          applySoftGpsCorrection(state.geoReading, "gps-live");
        }
        render();
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
    setMessage("開始追蹤。現在會嘗試用加速度峰值偵測步伐來推進軌跡，並可在 GPS 較佳時做手動校正。");
    render();
  }

  function stopTracking() {
    state.tracking = false;
    if (geoWatchId != null) navigator.geolocation.clearWatch(geoWatchId);
    setMessage("已停止追蹤。");
    render();
  }

  function resetAll() {
    stopTracking();
    state.trail = [{ x: 0, y: 0, heading: 0, t: Date.now() }];
    state.currentPose = { x: 0, y: 0, heading: 0 };
    state.filteredPose = { x: 0, y: 0, heading: 0 };
    state.corrections = [];
    state.positionSamples = [];
    state.headingSamples = [];
    state.stepCount = 0;
    state.lastStepAt = 0;
    lastStepAtRef = 0;
    smoothedMagnitudeRef = 0;
    state.motionMagnitude = 0;
    state.smoothedMagnitude = 0;
    state.calibratingStepLength = false;
    if (state.exportUrl) {
      URL.revokeObjectURL(state.exportUrl);
      state.exportUrl = "";
      $("downloadLink").style.display = "none";
    }
    setMessage("資料已清空。可重新設定起點後再開始。");
    render();
  }

  function setCurrentGpsAsAnchor() {
    if (!state.geoReading) {
      setMessage("目前沒有 GPS/Geolocation 讀值，不能設定起點。");
      return;
    }
    state.anchor = { lat: state.geoReading.lat, lng: state.geoReading.lng };
    setMessage("已把目前 GPS 位置設為地圖參考原點。後續可用 GPS 建標定點與做柔性位置校正。");
    render();
  }

  function beginPositionCorrection() {
    if (!state.geoReading) {
      setMessage("目前沒有可用定位訊號。請到窗邊或入口再試。");
      return;
    }
    if (Number.isFinite(state.geoReading.accuracy) && state.geoReading.accuracy > MIN_GPS_ACCURACY_METERS) {
      setMessage(`目前 GPS accuracy 約 ${fmt(state.geoReading.accuracy, 1)} m，超過門檻 ${MIN_GPS_ACCURACY_METERS} m，先不要校正。`);
      return;
    }
    state.positionSampleMode = true;
    state.positionSamples = [];
    render();
    setMessage(`開始位置收樣 ${POSITION_SAMPLE_SECONDS} 秒，請盡量站定。系統會只取較可信樣本再平均。`);

    const startedAt = Date.now();
    clearInterval(positionTimer);
    positionTimer = setInterval(() => {
      if (state.geoReading) {
        state.positionSamples.push({
          lat: state.geoReading.lat,
          lng: state.geoReading.lng,
          accuracy: state.geoReading.accuracy,
          ts: Date.now()
        });
      }
      if (Date.now() - startedAt >= POSITION_SAMPLE_SECONDS * 1000) {
        clearInterval(positionTimer);
        finalizePositionCorrection();
      }
    }, SAMPLE_MS);
  }

  function finalizePositionCorrection() {
    state.positionSampleMode = false;
    if (!state.positionSamples.length) {
      setMessage("位置校正失敗：缺少 GPS 樣本。");
      render();
      return;
    }

    ensureGeoAnchorReference();
    if (!state.anchor) {
      setMessage("位置校正失敗：尚未設定 GPS 參考原點。");
      render();
      return;
    }

    const filtered = state.positionSamples.filter(
      (s) => Number.isFinite(s.accuracy) && s.accuracy <= MIN_GPS_ACCURACY_METERS
    );
    const base = filtered.length >= 3 ? filtered : state.positionSamples;
    const weights = base.map((s) => 1 / Math.max(s.accuracy || MIN_GPS_ACCURACY_METERS, 1));
    const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
    const avgLat = base.reduce((sum, s, i) => sum + s.lat * weights[i], 0) / weightSum;
    const avgLng = base.reduce((sum, s, i) => sum + s.lng * weights[i], 0) / weightSum;
    const avgAcc = base.reduce((sum, s) => sum + (s.accuracy || 0), 0) / base.length;

    applySoftGpsCorrection({ lat: avgLat, lng: avgLng, accuracy: avgAcc }, "gps-sampled");
    setMessage(`GPS 柔性校正完成。採用 ${base.length} 筆樣本加權平均，平均誤差 ${fmt(avgAcc, 1)} m。`);
    updateArrivalProgress();
    render();
  }

  function beginHeadingCorrection() {
    state.headingSampleMode = true;
    state.headingSamples = [];
    render();
    setMessage(`開始方向收樣 ${HEADING_SAMPLE_SECONDS} 秒，請保持手機朝向固定。`);
    const startedAt = Date.now();
    clearInterval(headingTimer);
    headingTimer = setInterval(() => {
      state.headingSamples.push({ heading: state.orientation.heading, ts: Date.now() });
      if (Date.now() - startedAt >= HEADING_SAMPLE_SECONDS * 1000) {
        clearInterval(headingTimer);
        finalizeHeadingCorrection();
      }
    }, SAMPLE_MS);
  }

  function finalizeHeadingCorrection() {
    state.headingSampleMode = false;
    if (!state.headingSamples.length) {
      setMessage("方向校正失敗：沒有收集到方向樣本。");
      render();
      return;
    }

    const avgHeading = normalizeAngle(average(state.headingSamples.map((s) => s.heading)));
    const before = latestPose().heading ?? state.currentPose.heading;
    const delta = angleDelta(avgHeading, before);

    state.trail = state.trail.map((p) => {
      const rotated = rotatePoint(p, delta);
      return { ...p, x: rotated.x, y: rotated.y, heading: normalizeAngle((p.heading ?? 0) + delta) };
    });

    const rotated = rotatePoint(state.currentPose, delta);
    state.currentPose = { ...state.currentPose, x: rotated.x, y: rotated.y, heading: normalizeAngle((state.currentPose.heading ?? 0) + delta) };

    state.corrections.unshift({
      id: crypto.randomUUID(),
      type: "heading",
      beforeHeading: before,
      afterHeading: avgHeading,
      delta,
      sampleCount: state.headingSamples.length,
      ts: Date.now()
    });

    setMessage(`方向校正完成。已用 ${state.headingSamples.length} 筆樣本平均，修正 ${fmt(delta, 1)}°。`);
    render();
  }

  function exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      anchor: state.anchor,
      latestPose: latestPose(),
      stepCount: state.stepCount,
      stepLength: state.stepLength,
      geoReading: state.geoReading,
      trail: state.trail,
      corrections: state.corrections,
      settings: {
        positionSampleSeconds: POSITION_SAMPLE_SECONDS,
        headingSampleSeconds: HEADING_SAMPLE_SECONDS,
        minGpsAccuracyMeters: MIN_GPS_ACCURACY_METERS
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    if (state.exportUrl) URL.revokeObjectURL(state.exportUrl);
    state.exportUrl = URL.createObjectURL(blob);
    const link = $("downloadLink");
    link.href = state.exportUrl;
    link.download = `indoor-track-${Date.now()}.json`;
    link.style.display = "inline-flex";
    setMessage("已產生 JSON 匯出檔，可下載目前軌跡與校正資料。");
  }

  function setManualHeading() {
    const current = Math.round(normalizeAngle((state.orientation?.heading ?? latestPose()?.heading ?? 0) || 0));
    const raw = window.prompt("請輸入手機行進方向（0~359）", String(current));
    if (raw === null) return;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 359) {
      setMessage("方向輸入無效，請輸入 0 到 359 的數字。");
      return;
    }
    const heading = Math.round(value);
    state.orientation.heading = heading;
    state.currentPose = { ...(state.currentPose || {}), heading };
    if (state.filteredPose) state.filteredPose = { ...state.filteredPose, heading };
    if (Array.isArray(state.trail) && state.trail.length) {
      const last = state.trail[state.trail.length - 1];
      state.trail[state.trail.length - 1] = { ...last, heading };
    }
    setMessage(`已設定手機行進方向：${heading}°`);
    refreshViewportUI();
    render();
  }

  function beginStepLengthCalibration() {
    if (state.calibratingStepLength) return;
    state.calibratingStepLength = true;
    state.stepCalStart = state.stepCount;
    setMessage("開始 10 步步長校正：請正常走 10 步，系統會自動計算步長。");
    render();
  }

  async function openQrCalibration() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMessage("此瀏覽器不支援相機掃描。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      state.qrStream = stream;
      const modal = $("qrModal");
      const video = $("qrVideo");
      video.srcObject = stream;
      await video.play();
      modal.style.display = "flex";
      state.qrScanMode = true;
      setMessage("請把 QR 對準鏡頭。");
      requestAnimationFrame(scanQrFrame);
    } catch (e) {
      setMessage("無法開啟相機：" + e.message);
    }
  }

  function closeQrCalibration() {
    state.qrScanMode = false;
    $("qrModal").style.display = "none";
    const video = $("qrVideo");
    if (state.qrStream) {
      state.qrStream.getTracks().forEach(t => t.stop());
      state.qrStream = null;
    }
    video.srcObject = null;
  }

  function applyQrAnchor(text) {
    if (!text.startsWith(QR_TARGET_PREFIX)) return false;
    const payload = text.slice(QR_TARGET_PREFIX.length).trim();
    const parts = payload.split(",").map(s => Number(s.trim()));
    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return false;

    const target = {
      x: parts[0],
      y: parts[1],
      heading: Number.isFinite(parts[2]) ? normalizeAngle(parts[2]) : null
    };
    const before = latestPose();
    const dx = target.x - before.x;
    const dy = target.y - before.y;

    state.trail = state.trail.map(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
    state.currentPose = { ...state.currentPose, x: state.currentPose.x + dx, y: state.currentPose.y + dy };

    if (target.heading != null) {
      const delta = angleDelta(target.heading, before.heading ?? state.currentPose.heading);
      state.trail = state.trail.map((p) => {
        const rotated = rotatePoint(p, delta);
        return { ...p, x: rotated.x, y: rotated.y, heading: normalizeAngle((p.heading ?? 0) + delta) };
      });
      const rp = rotatePoint(state.currentPose, delta);
      state.currentPose = { ...state.currentPose, x: rp.x, y: rp.y, heading: normalizeAngle((state.currentPose.heading ?? 0) + delta) };
      state.corrections.unshift({
        id: crypto.randomUUID(),
        type: "qr",
        beforeX: before.x,
        beforeY: before.y,
        afterX: target.x,
        afterY: target.y,
        beforeHeading: before.heading,
        afterHeading: target.heading,
        ts: Date.now()
      });
    } else {
      state.corrections.unshift({
        id: crypto.randomUUID(),
        type: "qr",
        beforeX: before.x,
        beforeY: before.y,
        afterX: target.x,
        afterY: target.y,
        ts: Date.now()
      });
    }

    setMessage("已套用 QR 校正點。");
    updateArrivalProgress();
    render();
    return true;
  }

  function scanQrFrame() {
    if (!state.qrScanMode) return;
    const video = $("qrVideo");
    if (video.readyState >= 2 && typeof jsQR !== "undefined") {
      const c = document.createElement("canvas");
      c.width = video.videoWidth || 640;
      c.height = video.videoHeight || 480;
      const cctx = c.getContext("2d");
      cctx.drawImage(video, 0, 0, c.width, c.height);
      const img = cctx.getImageData(0, 0, c.width, c.height);
      const code = jsQR(img.data, img.width, img.height);
      if (code && code.data) {
        if (applyQrAnchor(code.data)) {
          closeQrCalibration();
          return;
        }
      }
    }
    requestAnimationFrame(scanQrFrame);
  }

  function normalizeHeadingValue(v) {
    if (v === "" || v == null) return null;
    let n = Number(v);
    if (!Number.isFinite(n)) return null;
    n = n % 360;
    if (n < 0) n += 360;
    return Math.round(n);
  }
