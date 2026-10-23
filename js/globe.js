(function () {
  var FEATURED = {
    Ukraine: "4.3 M",
    Afghanistan: "11.7 M",
    Nigeria: "12.7 M",
    Bangladesh: "8 M",
    Ethiopia: "22.4 M",
    Peru: "3.9 M",
    Brazil: "17.2 M",
    Indonesia: "3.4 M"
  };
  var CENTER_LAT = 20;
  var SHOW_LON = 16;
  var KEEP_LON = 26;
  var MIN_HOLD = 4500;
  var DEGREES_PER_SECOND = 6;
  var LAND = "#6bb6b2";
  var ACTIVE = "#ff7a3c";

  var canvas = document.getElementById("globe");
  var popup = document.getElementById("popup");
  var popupName = document.getElementById("popup-name");
  var popupValue = document.getElementById("popup-value");
  var ctx = canvas.getContext("2d");

  var countries = [];
  var featured = [];
  var rotation = 18;
  var shown = null;
  var shownAt = 0;
  var mode = "idle";
  var lastTime = 0;
  var radius = 100;
  var originX = 0;
  var originY = 0;

  function project(lat, lon, rot) {
    var latR = lat * Math.PI / 180;
    var lonR = (lon - rot) * Math.PI / 180;
    var x = Math.cos(latR) * Math.sin(lonR);
    var y = Math.sin(latR);
    var z = Math.cos(latR) * Math.cos(lonR);
    var tilt = CENTER_LAT * Math.PI / 180;
    return {
      x: x,
      y: y * Math.cos(tilt) - z * Math.sin(tilt),
      z: y * Math.sin(tilt) + z * Math.cos(tilt)
    };
  }

  function decodeArc(topology, index) {
    var reverse = index < 0;
    var arc = topology.arcs[reverse ? ~index : index];
    var scale = topology.transform.scale;
    var translate = topology.transform.translate;
    var x = 0;
    var y = 0;
    var points = arc.map(function (delta) {
      x += delta[0];
      y += delta[1];
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
    return reverse ? points.reverse() : points;
  }

  function ringCoordinates(topology, indexes) {
    var points = [];
    indexes.forEach(function (index) {
      decodeArc(topology, index).forEach(function (point, pointIndex) {
        if (points.length && pointIndex === 0) return;
        points.push(point);
      });
    });
    return points;
  }

  function splitRing(points) {
    var rings = [];
    var current = [];
    points.forEach(function (point, index) {
      if (index > 0 && Math.abs(point[0] - points[index - 1][0]) > 180) {
        if (current.length > 2) rings.push(current);
        current = [];
      }
      current.push(point);
    });
    if (current.length > 2) rings.push(current);
    return rings;
  }

  function centroid(ring) {
    var sx = 0;
    var sy = 0;
    var sz = 0;
    ring.forEach(function (point) {
      var latR = point[1] * Math.PI / 180;
      var lonR = point[0] * Math.PI / 180;
      sx += Math.cos(latR) * Math.sin(lonR);
      sy += Math.sin(latR);
      sz += Math.cos(latR) * Math.cos(lonR);
    });
    var length = Math.hypot(sx, sy, sz) || 1;
    return {
      lat: Math.asin(sy / length) * 180 / Math.PI,
      lon: Math.atan2(sx, sz) * 180 / Math.PI
    };
  }

  function buildCountries(topology) {
    topology.objects.countries.geometries.forEach(function (geometry) {
      var polygons = geometry.type === "Polygon" ? [geometry.arcs] : geometry.arcs;
      var rings = [];
      polygons.forEach(function (polygon) {
        polygon.forEach(function (indexes) {
          splitRing(ringCoordinates(topology, indexes)).forEach(function (ring) {
            rings.push(ring);
          });
        });
      });
      if (!rings.length) return;
      var country = { name: geometry.properties.name, rings: rings };
      var center = centroid(rings[0]);
      country.lat = center.lat;
      country.lon = center.lon;
      countries.push(country);
      if (FEATURED[country.name]) {
        country.value = FEATURED[country.name];
        featured.push(country);
      }
    });
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var stage = document.getElementById("stage");
    var scale = stage.getBoundingClientRect().width / stage.offsetWidth || 1;
    var width = rect.width / scale;
    var height = rect.height / scale;
    var ratio = 2;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    radius = Math.min(width, height) * 0.36 * ratio;
    originX = canvas.width * 0.5;
    originY = canvas.height * 0.64;
  }

  function screenPoint(point) {
    return {
      x: originX + point.x * radius,
      y: originY - point.y * radius
    };
  }

  function clipRing(ring, rot) {
    var projected = ring.map(function (point) {
      return project(point[1], point[0], rot);
    });
    var output = [];
    for (var i = 0; i < projected.length; i++) {
      var start = projected[i];
      var end = projected[(i + 1) % projected.length];
      var startIn = start.z > 0.02;
      var endIn = end.z > 0.02;
      if (startIn && endIn) {
        output.push(end);
      } else if (startIn || endIn) {
        var t = (0.02 - start.z) / (end.z - start.z);
        var edge = {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
          z: 0.02
        };
        output.push(edge);
        if (endIn) output.push(end);
      }
    }
    return output;
  }

  function drawCountry(country, rot, color) {
    ctx.beginPath();
    var visible = false;
    country.rings.forEach(function (ring) {
      var clipped = clipRing(ring, rot);
      if (clipped.length < 3) return;
      clipped.forEach(function (point, index) {
        var pos = screenPoint(point);
        if (index === 0) ctx.moveTo(pos.x, pos.y);
        else ctx.lineTo(pos.x, pos.y);
      });
      ctx.closePath();
      visible = true;
    });
    if (!visible) return;
    ctx.fillStyle = color;
    ctx.fill("evenodd");
  }

  function drawSphere() {
    var gradient = ctx.createRadialGradient(
      originX - radius * 0.35,
      originY - radius * 0.4,
      radius * 0.1,
      originX,
      originY,
      radius
    );
    gradient.addColorStop(0, "#1a6f93");
    gradient.addColorStop(0.55, "#04384f");
    gradient.addColorStop(1, "#012433");
    var glow = ctx.createRadialGradient(originX, originY, radius * 0.86, originX, originY, radius * 1.14);
    glow.addColorStop(0, "rgba(110, 198, 224, 0.28)");
    glow.addColorStop(1, "rgba(110, 198, 224, 0)");
    ctx.beginPath();
    ctx.arc(originX, originY, radius * 1.14, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(originX, originY, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  function lonDelta(lon, rot) {
    var delta = lon - rot;
    delta = ((delta + 540) % 360) - 180;
    return Math.abs(delta);
  }

  function isFront(country, rot) {
    return project(country.lat, country.lon, rot).z > 0.15;
  }

  function countriesInView(rot, limit) {
    return featured.filter(function (country) {
      return isFront(country, rot) && lonDelta(country.lon, rot) < limit;
    }).sort(function (a, b) {
      return lonDelta(a.lon, rot) - lonDelta(b.lon, rot);
    });
  }

  function showGap() {
    shown = null;
    mode = "gap";
    document.getElementById("popup-country").hidden = true;
    document.getElementById("popup-gap").hidden = false;
  }

  function showPopup(country, now) {
    shown = country;
    mode = "shown";
    shownAt = now;
    popupName.textContent = country.name;
    popupValue.textContent = country.value;
    document.getElementById("popup-country").hidden = false;
    document.getElementById("popup-gap").hidden = true;
  }

  function updatePopup(rot, now) {
    var next = countriesInView(rot, SHOW_LON)[0];
    if (mode === "shown" && shown) {
      var age = now - shownAt;
      var still = isFront(shown, rot) && lonDelta(shown.lon, rot) < KEEP_LON;
      var others = countriesInView(rot, SHOW_LON).filter(function (country) {
        return country !== shown;
      });
      if (age < MIN_HOLD) return;
      if (others.length) {
        showPopup(others[0], now);
        return;
      }
      if (!still) showGap();
      return;
    }
    if (next) showPopup(next, now);
    else showGap();
  }

  function frame(time) {
    if (!lastTime) lastTime = time;
    var delta = Math.min(0.05, (time - lastTime) / 1000);
    lastTime = time;
    rotation = (rotation + DEGREES_PER_SECOND * delta) % 360;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSphere();
    ctx.save();
    ctx.beginPath();
    ctx.arc(originX, originY, radius - 1, 0, Math.PI * 2);
    ctx.clip();
    countries.forEach(function (country) {
      if (country === shown) return;
      drawCountry(country, rotation, LAND);
    });
    if (shown) drawCountry(shown, rotation, ACTIVE);
    ctx.restore();

    if (featured.length) updatePopup(rotation, time);
    window.requestAnimationFrame(frame);
  }

  window.addEventListener("stage-fit", resize);
  window.addEventListener("resize", resize);
  resize();

  buildCountries(window.COUNTRY_TOPOLOGY);
  window.requestAnimationFrame(frame);
})();
