(function () {
  // Reload the TV page when a new deploy is detected. Delay is fine.
  var INTERVAL = 3 * 60 * 1000;
  var PATHS = [
    "index.html",
    "css/styles.css",
    "js/globe.js",
    "js/refresh.js",
    "data/countries-110m.js",
    "images/hsh-logo.png",
    "images/ecw-logo.png",
    "fonts/barlow-latin-600.woff2",
    "fonts/barlow-latin-ext-600.woff2",
    "fonts/barlow-latin-700.woff2",
    "fonts/barlow-latin-ext-700.woff2"
  ];

  var snapshot = null;

  function hashBuffer(buffer) {
    var bytes = new Uint8Array(buffer);
    var hash = 5381;
    for (var i = 0; i < bytes.length; i++) {
      hash = ((hash << 5) + hash) ^ bytes[i];
    }
    return (hash >>> 0).toString(36);
  }

  function fileTag(path) {
    return fetch(path + "?_=" + Date.now(), { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error(path);
      return res.arrayBuffer().then(function (buffer) {
        return path + "=" + hashBuffer(buffer);
      });
    });
  }

  function check() {
    Promise.all(PATHS.map(fileTag)).then(function (tags) {
      var next = tags.join("|");
      if (snapshot && snapshot !== next) {
        var url = new URL(location.href);
        url.searchParams.set("r", Date.now());
        location.replace(url.href);
        return;
      }
      snapshot = next;
    }).catch(function () {});
  }

  check();
  setInterval(check, INTERVAL);
})();
