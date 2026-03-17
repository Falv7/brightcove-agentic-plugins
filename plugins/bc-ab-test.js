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
  var cookieName = 'bc_ab_' + experimentId;

  // --- Cookie helpers ---
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Lax';
  }

  // --- Variant assignment ---
  function getOrAssignVariant() {
    var savedId = getCookie(cookieName);
    if (savedId) {
      var found = variants.find(function (v) { return v.id === savedId; });
      if (found) return found;
    }
    var picked = variants[Math.floor(Math.random() * variants.length)];
    setCookie(cookieName, picked.id, 30);
    return picked;
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

  // --- Assign variant once ---
  var variant = getOrAssignVariant();

  // --- Apply variant on loadstart (before viewer sees the poster) ---
  player.on('loadstart', function () {
    if (variant.posterUrl) {
      player.poster(variant.posterUrl);
      if (player.mediainfo) {
        player.mediainfo.poster = variant.posterUrl;
      }
    }
    if (variant.title && player.mediainfo) {
      player.mediainfo.name = variant.title;
    }
    if (variant.description && player.mediainfo) {
      player.mediainfo.description = variant.description;
    }
    track('variant_assigned');
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
