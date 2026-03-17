/**
 * Brightcove A/B Test Plugin
 *
 * Randomly assigns viewers to variant A or B and swaps the poster image
 * before playback. Uses aggressive poster replacement to override
 * Brightcove's catalog-loaded poster.
 *
 * Configured via player options:
 *   experimentId: string — unique experiment identifier
 *   variants: array — [{id: "A", posterUrl: "..."}, {id: "B", posterUrl: "..."}]
 *   trackingEndpoint: string — URL to POST tracking events to (optional)
 *   debug: boolean — if true, shows variant label overlay on the player
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
  var posterApplied = false;

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

  // --- Force poster through every available method ---
  function forcePoster() {
    if (!variant.posterUrl) return;

    // Method 1: Player API
    player.poster(variant.posterUrl);

    // Method 2: Override mediainfo poster so catalog doesn't reset it
    if (player.mediainfo) {
      player.mediainfo.poster = variant.posterUrl;
      player.mediainfo.posterSources = [{ src: variant.posterUrl }];
    }

    // Method 3: Direct DOM manipulation on the poster element
    var posterEl = player.el().querySelector('.vjs-poster');
    if (posterEl) {
      posterEl.style.backgroundImage = 'url("' + variant.posterUrl + '")';
    }

    // Method 4: Find and replace any <img> inside the poster
    var posterImg = player.el().querySelector('.vjs-poster img');
    if (posterImg) {
      posterImg.src = variant.posterUrl;
    }
  }

  // --- Debug overlay ---
  function showDebugOverlay() {
    if (!debug) return;
    // Remove any existing overlay
    var existing = player.el().querySelector('.bc-ab-debug');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.className = 'bc-ab-debug';
    overlay.style.cssText = 'position:absolute;top:10px;left:10px;background:rgba(255,0,0,0.85);color:#fff;padding:8px 16px;font-size:16px;font-weight:bold;font-family:sans-serif;z-index:9999;border-radius:4px;pointer-events:none;';
    overlay.textContent = 'VARIANT ' + variant.id;
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
      // silent fail
    }
  }

  // --- Assign variant immediately ---
  var variant = getOrAssignVariant();

  // --- Apply aggressively on every relevant event ---
  // The problem: Brightcove loads video data from its catalog API,
  // which includes the original poster. This can overwrite our poster.
  // Solution: keep re-applying on every event until playback starts.

  player.on('loadstart', function () {
    forcePoster();
    track('variant_assigned');
  });

  player.on('loadedmetadata', function () {
    forcePoster();
  });

  player.on('loadeddata', function () {
    forcePoster();
  });

  // Watch for Brightcove resetting the poster via posterchange event
  player.on('posterchange', function () {
    if (!posterApplied) {
      posterApplied = true;
      forcePoster();
    }
  });

  // Delayed application — ensures we run AFTER Brightcove's own setup
  player.ready(function () {
    showDebugOverlay();
    // Apply after a short delay to beat Brightcove's catalog load
    setTimeout(function () { forcePoster(); }, 100);
    setTimeout(function () { forcePoster(); }, 500);
    setTimeout(function () { forcePoster(); }, 1500);
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
