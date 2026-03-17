videojs.registerPlugin('forcePoster', function (options) {
  var player = this;
  var url = options && options.posterUrl;
  if (!url) return;

  var original = player.poster.bind(player);
  player.poster = function (u) {
    if (arguments.length > 0) return original(url);
    return url;
  };
  original(url);

  player.on('loadstart', function () {
    if (player.mediainfo) {
      player.mediainfo.poster = url;
      player.mediainfo.posterSources = [{ src: url }];
    }
  });

  player.ready(function () {
    var label = options.label || '?';
    var d = document.createElement('div');
    d.style.cssText = 'position:absolute;top:10px;left:10px;background:rgba(255,0,0,0.9);color:#fff;padding:8px 16px;font-size:18px;font-weight:bold;font-family:sans-serif;z-index:9999;border-radius:4px;pointer-events:none;';
    d.textContent = label;
    player.el().appendChild(d);
  });
});
