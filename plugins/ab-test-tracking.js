videojs.registerPlugin('abTestTracking', function (options) {
  var player = this;
  if (!options || !options.variants || options.variants.length < 2 || !options.experimentId || !options.trackingEndpoint) return;

  var experimentId = options.experimentId;
  var variants = options.variants;
  var trackingEndpoint = options.trackingEndpoint;
  var debug = options.debug || false;

  // Session ID: unique per page load, no persistence
  var sessionId = 'ses_' + Math.random().toString(16).slice(2, 14);

  // Pure random assignment -- fresh coin flip every page load
  var variant = variants[Math.floor(Math.random() * variants.length)];

  // Flag: play_start fires only once per session
  var playTracked = false;

  // Override player.poster() so catalog response can never overwrite us
  // This is the battle-tested fix from ab-test-final.js
  if (variant.posterUrl) {
    var original = player.poster.bind(player);
    player.poster = function (u) {
      if (arguments.length > 0) return original(variant.posterUrl);
      return variant.posterUrl;
    };
    original(variant.posterUrl);
  }

  player.on('loadstart', function () {
    if (player.mediainfo && variant.posterUrl) {
      player.mediainfo.poster = variant.posterUrl;
      player.mediainfo.posterSources = [{ src: variant.posterUrl }];
    }
    track('variant_assigned');
  });

  player.on('play', function () {
    if (!playTracked) {
      playTracked = true;
      track('play_start');
    }
  });

  // Tracking via sendBeacon -- fire and forget, never throws
  function track(eventType) {
    try {
      navigator.sendBeacon(trackingEndpoint, JSON.stringify({
        experiment_id: experimentId,
        variant: variant.id,
        video_id: (player.mediainfo && player.mediainfo.id) || '',
        event_type: eventType,
        session_id: sessionId,
        timestamp: Date.now(),
        page_url: window.location.href
      }));
    } catch (e) {}
  }

  // Debug overlay
  player.ready(function () {
    if (!debug) return;
    var d = document.createElement('div');
    d.style.cssText = 'position:absolute;top:10px;left:10px;background:rgba(255,0,0,0.9);color:#fff;padding:8px 16px;font-size:18px;font-weight:bold;font-family:sans-serif;z-index:9999;border-radius:4px;pointer-events:none;';
    d.textContent = 'VARIANT ' + variant.id;
    player.el().appendChild(d);
  });
});
