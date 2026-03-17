/**
 * Brightcove A/B Test Plugin
 *
 * Randomly assigns viewers to variant A or B and swaps the poster image.
 *
 * Root cause of previous failures: Brightcove's catalog API fetches the
 * video data (including poster URL) AFTER plugins initialize, overwriting
 * any poster set by the plugin. The fix: override player.poster() itself
 * so that ALL poster sets (including from the catalog) are intercepted
 * and replaced with the variant's poster.
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

  // --- Storage (localStorage with cookie fallback) ---
  function getStored(key) {
    try { return localStorage.getItem(key); }
    catch (e) {
      var m = document.cookie.match(new RegExp('(?:^|; )' + key + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    }
  }
  function setStored(key, value) {
    try { localStorage.setItem(key, value); }
    catch (e) {
      document.cookie = key + '=' + encodeURIComponent(value) +
        '; expires=' + new Date(Date.now() + 30 * 864e5).toUTCString() +
        '; path=/; SameSite=Lax';
    }
  }

  // --- Assign variant ---
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

  var variant = getOrAssignVariant();

  // =============================================================
  // THE FIX: Override player.poster() so Brightcove's catalog
  // response can never overwrite our variant poster.
  // =============================================================
  if (variant.posterUrl) {
    var originalPosterFn = player.poster.bind(player);

    // Override the poster method
    player.poster = function (url) {
      // If someone is SETTING a poster (catalog, etc.), redirect to our variant
      if (arguments.length > 0) {
        return originalPosterFn(variant.posterUrl);
      }
      // If someone is GETTING the poster, return our variant
      return variant.posterUrl;
    };

    // Set it now
    originalPosterFn(variant.posterUrl);
  }

  // Also override mediainfo when it becomes available
  player.on('loadstart', function () {
    if (player.mediainfo && variant.posterUrl) {
      player.mediainfo.poster = variant.posterUrl;
      player.mediainfo.posterSources = [{ src: variant.posterUrl }];
    }
    track('variant_assigned');
  });

  // --- Debug overlay ---
  player.ready(function () {
    if (!debug) return;
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;top:10px;left:10px;background:rgba(255,0,0,0.85);color:#fff;padding:8px 16px;font-size:16px;font-weight:bold;font-family:sans-serif;z-index:9999;border-radius:4px;pointer-events:none;';
    overlay.textContent = 'VARIANT ' + variant.id;
    player.el().appendChild(overlay);
  });

  // --- Tracking ---
  function track(eventType) {
    if (!trackingEndpoint) return;
    try {
      navigator.sendBeacon(trackingEndpoint, JSON.stringify({
        experiment_id: experimentId,
        variant: variant.id,
        video_id: (player.mediainfo && player.mediainfo.id) || '',
        event_type: eventType,
        timestamp: Date.now(),
        page_url: window.location.href
      }));
    } catch (e) {}
  }

  player.on('play', function () { track('play_start'); });
  player.on('ended', function () { track('play_complete'); });

  var milestones = { 25: false, 50: false, 75: false };
  player.on('timeupdate', function () {
    var dur = player.duration();
    if (!dur) return;
    var pct = Math.floor((player.currentTime() / dur) * 100);
    [25, 50, 75].forEach(function (m) {
      if (pct >= m && !milestones[m]) {
        milestones[m] = true;
        track('milestone_' + m);
      }
    });
  });
});
