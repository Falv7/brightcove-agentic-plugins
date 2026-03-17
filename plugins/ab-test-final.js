videojs.registerPlugin('abTestFinal', function (options) {
  var player = this;
  if (!options || !options.variants || options.variants.length < 2) return;

  var variants = options.variants;
  var debug = options.debug || false;

  // Pure random — no persistence. Every page load is a fresh coin flip.
  var variant = variants[Math.floor(Math.random() * variants.length)];

  // Override player.poster() so catalog response can never overwrite us
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
  });

  player.ready(function () {
    if (!debug) return;
    var d = document.createElement('div');
    d.style.cssText = 'position:absolute;top:10px;left:10px;background:rgba(255,0,0,0.9);color:#fff;padding:8px 16px;font-size:18px;font-weight:bold;font-family:sans-serif;z-index:9999;border-radius:4px;pointer-events:none;';
    d.textContent = 'VARIANT ' + variant.id;
    player.el().appendChild(d);
  });
});
