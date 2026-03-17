/**
 * Brightcove A/B Test Plugin
 *
 * Randomly assigns viewers to variant A or B and swaps the poster image
 * (or title/description) before playback. Tracks variant assignment and
 * playback events to an external tracking endpoint.
 *
 * Configured via player options:
 *   experimentId: string — unique experiment identifier
 *   variants: array — [{id: "A", posterUrl: "..."}, {id: "B", posterUrl: "..."}]
 *   trackingEndpoint: string — URL to POST tracking events to
 *   debug: boolean — if true, shows variant label overlay on the player
 *
 * Usage: pushed to a Brightcove player via the Player Management API.
 * The customer does nothing — the agent handles setup and teardown.
 */
videojs.registerPlugin('bcAbTest', function (options) {
  var player = this;

  if (!options || !options.variants || options.variants.length < 2) {
    return;
  }

  var experimentId = options.experimentId || 'unknown';
  var variants = options.variants;
  var trackingEndpoint = options.trackingEndpoint || null;
  var debug = options.debug || false;
  var storageKey = 'bc_ab_' + experimentId;

  // --- Storage helpers (localStorage with cookie fallback) ---
  function getStored(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      var match = document.cookie.match(new RegExp('(?:^|; )' + key + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    }
  }

  function setStored(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      var expires = new Date(Date.now() + 30 * 864e5).toUTCString();
      document.cookie = key + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Lax';
    }
  }

  // --- Variant assignment ---
  function getOrAssignVariant() {
    var savedId = getStored(storageKey);
    if (savedId) {
      var found = variants.find(function (v) { return v.id === savedId; });
      if (found) return found;
    }
    var picked = variants[Math.floor(Math.random() * variants.length)];
    setStored(storageKey, picked.id);
    return picked;
  }

  // --- Apply variant ---
  function applyVariant() {
    if (variant.posterUrl) {
      player.poster(variant.posterUrl);
      // Also force the poster image element directly
      var posterEl = player.el().querySelector('.vjs-poster');
      if (posterEl) {
        posterEl.style.backgroundImage = 'url("' + variant.posterUrl + '")';
      }
    }
    if (variant.title && player.mediainfo) {
      player.mediainfo.name = variant.title;
    }
    if (variant.description && player.mediainfo) {
      player.mediainfo.description = variant.description;
    }
  }

  // --- Debug overlay ---
  function showDebugOverlay() {
    if (!debug) return;
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;top:10px;left:10px;background:rgba(0,0,0,0.7);color:#fff;padding:6px 12px;font-size:14px;font-family:sans-serif;z-index:9999;border-radius:4px;pointer-events:none;';
    overlay.textContent = 'Variant ' + variant.id + ' | Exp: ' + experimentId;
    player.el().appendChild(overlay);
  }

  // --- Tracking ---
  function track(eventType) {
    if (!trackingEndpoint) return;
    var payload = {
      experiment_id: experimentId,
      variant: variant.id,
      video_id: (player.mediainfo && player.mediainfo.id) || '',
      event_type: eventType,
      timestamp: Date.now(),
      page_url: window.location.href
    };
    try {
      navigator.sendBeacon(trackingEndpoint, JSON.stringify(payload));
    } catch (e) {
      // silent fail — tracking should never break playback
    }
  }

  // --- Assign variant immediately (before any events) ---
  var variant = getOrAssignVariant();

  // --- Apply on multiple events to ensure it sticks ---
  player.on('loadstart', function () {
    applyVariant();
    track('variant_assigned');
  });

  // Also apply on loadedmetadata as a fallback
  player.on('loadedmetadata', function () {
    applyVariant();
  });

  // Apply immediately if player is already ready
  player.ready(function () {
    applyVariant();
    showDebugOverlay();
  });

  // --- Track playback events ---
  player.on('play', function () {
    track('play_start');
  });

  player.on('ended', function () {
    track('play_complete');
  });

  // --- Track engagement milestones (25%, 50%, 75%) ---
  var milestones = { 25: false, 50: false, 75: false };
  player.on('timeupdate', function () {
    var duration = player.duration();
    if (!duration) return;
    var pct = Math.floor((player.currentTime() / duration) * 100);
    [25, 50, 75].forEach(function (m) {
      if (pct >= m && !milestones[m]) {
        milestones[m] = true;
        track('milestone_' + m);
      }
    });
  });
});
