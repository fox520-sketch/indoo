window.IndoorNavStorage = (() => {
  const STORAGE_KEYS = {
    poseSmoothingAlpha: "indoor_pose_smoothing_alpha",
    navHistory: "indoor_nav_history",
    mapElements: "indoor_map_elements",
    savedAnchors: "indoor_saved_anchors",
  };

  function loadJsonArrayStorage(key, fallback = []) {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : fallback;
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function saveJsonStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadNumberStorage(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      const value = Number(raw);
      return Number.isFinite(value) ? value : fallback;
    } catch (e) {
      return fallback;
    }
  }

  return {
    STORAGE_KEYS,
    loadJsonArrayStorage,
    saveJsonStorage,
    loadNumberStorage,
  };
})();
