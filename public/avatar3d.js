// Keisha's World — 3D blocky avatar made of CSS 3D boxes (no libraries needed)
(function () {
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function f(c) { return Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt))); }
    return "rgb(" + f(r) + "," + f(g) + "," + f(b) + ")";
  }
  // a box of w×h×d centred at (x,y,z); y grows downwards
  function box(w, h, d, x, y, z, color, front) {
    var el = document.createElement("div");
    el.className = "cb";
    el.style.cssText = "width:" + w + "px;height:" + h + "px;left:" + (-w / 2) + "px;top:" + (-h / 2) + "px;transform:translate3d(" + x + "px," + y + "px," + z + "px)";
    var faces = [
      ["f", w, h, "translateZ(" + d / 2 + "px)", color],
      ["k", w, h, "rotateY(180deg) translateZ(" + d / 2 + "px)", shade(color, -0.22)],
      ["r", d, h, "rotateY(90deg) translateZ(" + w / 2 + "px)", shade(color, -0.14)],
      ["l", d, h, "rotateY(-90deg) translateZ(" + w / 2 + "px)", shade(color, -0.14)],
      ["t", w, d, "rotateX(90deg) translateZ(" + h / 2 + "px)", shade(color, 0.16)],
      ["b", w, d, "rotateX(-90deg) translateZ(" + h / 2 + "px)", shade(color, -0.3)]
    ];
    faces.forEach(function (f) {
      var fe = document.createElement("div");
      fe.className = "fc";
      fe.style.cssText = "width:" + f[1] + "px;height:" + f[2] + "px;left:" + (w - f[1]) / 2 + "px;top:" + (h - f[2]) / 2 + "px;transform:" + f[3] + ";background:" + f[4];
      if (f[0] === "f" && front) fe.innerHTML = front;
      el.appendChild(fe);
    });
    return el;
  }

  var HAIR = { black: "#2a1f2e", brown: "#7b4a2a", lilac: "#b28cff", pink: "#ff8fc3", blonde: "#f2c94c" };
  var TOPS = { purple: "#8e5be8", black: "#2c2c36", mint: "#6fe3c1", yellow: "#ffd23f", red: "#ff5a5f" };
  var SKIRTS = { pink: "#ff7ab6", black: "#2c2c36", blue: "#4fb3ff", white: "#f4f4f8" };
  var PHONES = { white: "#f2f2f7", pink: "#ff7ab6", black: "#30303a", gold: "#ffc93c" };
  var SKIN = "#f7dcc8";

  function face(hair) {
    return '<div class="av-face">' +
      '<i style="left:0;top:0;width:100%;height:13px;background:' + hair + '"></i>' +
      '<i style="left:12px;top:12px;width:13px;height:7px;background:' + hair + ';border-radius:0 0 7px 7px"></i>' +
      '<i style="left:33px;top:12px;width:15px;height:6px;background:' + hair + ';border-radius:0 0 7px 7px"></i>' +
      '<i class="eye" style="left:15px;top:24px"></i><i class="eye" style="left:37px;top:24px"></i>' +
      '<i style="left:9px;top:37px;width:9px;height:5px;background:#ff9cc2;border-radius:50%"></i>' +
      '<i style="left:42px;top:37px;width:9px;height:5px;background:#ff9cc2;border-radius:50%"></i>' +
      '<i style="left:24px;top:38px;width:12px;height:6px;border-bottom:3px solid #1b1b2b;border-radius:0 0 8px 8px;box-sizing:border-box"></i></div>';
  }

  function buildGirl(rig, look) {
    var hair = HAIR[look.hair] || HAIR.black, top = TOPS[look.top] || TOPS.purple,
      skirt = SKIRTS[look.skirt] || SKIRTS.pink, ph = PHONES[look.phones] || PHONES.white, style = look.style || "long";
    var parts = [];
    // shoes, socks, legs
    [-13, 13].forEach(function (x) {
      parts.push(box(24, 12, 28, x, -6, 3, "#2a2a33"));
      parts.push(box(22, 14, 22, x, -19, 0, "#ffffff"));
      parts.push(box(21, 32, 21, x, -42, 0, SKIN));
    });
    parts.push(box(64, 28, 40, 0, -70, 0, skirt));
    parts.push(box(54, 50, 30, 0, -104, 0, top));
    [-36, 36].forEach(function (x) {
      parts.push(box(17, 22, 19, x, -118, 0, top));
      parts.push(box(15, 30, 16, x, -92, 0, SKIN));
    });
    parts.push(box(60, 56, 50, 0, -158, 0, SKIN, face(hair)));
    // hair
    parts.push(box(66, 14, 56, 0, -190, -1, hair));
    var backH = style === "bob" ? 44 : 78;
    parts.push(box(66, backH, 10, 0, -183 + backH / 2, -28, hair));
    [-31, 31].forEach(function (x) { parts.push(box(6, style === "bob" ? 40 : 56, 48, x, style === "bob" ? -168 : -160, -2, hair)); });
    if (style === "buns") { [-20, 20].forEach(function (x) { parts.push(box(20, 18, 20, x, -204, -6, hair)); }); }
    // headphones
    parts.push(box(74, 7, 10, 0, -199, 2, ph));
    [-38, 38].forEach(function (x) { parts.push(box(8, 22, 20, x, -162, 2, ph)); });
    // bow
    parts.push(box(18, 10, 6, 18, -194, 24, "#ff4f9a"));
    parts.forEach(function (p) { rig.appendChild(p); });
  }

  var PETS = {
    cat: { c: "#ffffff", ear: "tri" }, bunny: { c: "#ffd6e8", ear: "long" },
    puppy: { c: "#d9a066", ear: "flop" }, panda: { c: "#f4f4f8", ear: "round" }
  };
  function petFace(type) {
    var eye = type === "panda" ? '<i style="left:5px;top:9px;width:9px;height:11px;background:#1b1b2b;border-radius:50%"></i><i style="left:16px;top:9px;width:9px;height:11px;background:#1b1b2b;border-radius:50%"></i>' : "";
    return '<div class="av-face">' + eye +
      '<i style="left:8px;top:11px;width:5px;height:6px;background:' + (type === "panda" ? "#fff" : "#1b1b2b") + ';border-radius:50%"></i>' +
      '<i style="left:18px;top:11px;width:5px;height:6px;background:' + (type === "panda" ? "#fff" : "#1b1b2b") + ';border-radius:50%"></i>' +
      '<i style="left:12px;top:19px;width:6px;height:4px;background:#ff7ab6;border-radius:50%"></i></div>';
  }
  function buildPet(rig, pet, x) {
    var p = PETS[pet.type]; if (!p) return;
    var parts = [];
    parts.push(box(28, 20, 34, x, -16, -6, p.c));
    parts.push(box(30, 28, 26, x, -38, 10, p.c, petFace(pet.type)));
    var ear = p.ear === "long" ? [8, 22] : p.ear === "flop" ? [8, 16] : [9, 9];
    [-9, 9].forEach(function (dx) {
      var ec = p.ear === "flop" ? "#8a5a2b" : pet.type === "panda" ? "#1b1b2b" : p.c;
      var ex = p.ear === "flop" ? (dx < 0 ? -17 : 17) : dx;
      var ey = p.ear === "flop" ? -38 : -52 - ear[1] / 2 + 4;
      parts.push(box(ear[0], ear[1], 6, x + ex, ey, 10, ec));
    });
    if (pet.acc && pet.acc.indexOf("crown") >= 0) parts.push(box(22, 8, 16, x, -57, 10, "#ffc93c"));
    if (pet.acc && pet.acc.indexOf("bow") >= 0) parts.push(box(16, 8, 5, x + 10, -50, 24, "#ff4f9a"));
    if (pet.acc && pet.acc.indexOf("glasses") >= 0) parts.push(box(26, 6, 3, x, -38, 25, "#1b1b2b"));
    parts.forEach(function (q) { rig.appendChild(q); });
  }

  // mount(el, {look, pet, size}) — returns {destroy}
  window.Avatar3D = {
    mount: function (el, opts) {
      el.innerHTML = "";
      el.classList.add("av-stage");
      var size = opts.size || 1;
      var holder = document.createElement("div");
      holder.className = "av-holder";
      holder.style.transform = "scale(" + size + ")";
      var rig = document.createElement("div");
      rig.className = "av-rig";
      holder.appendChild(rig);
      el.appendChild(holder);
      buildGirl(rig, opts.look || {});
      if (opts.pet && opts.pet.type) buildPet(rig, opts.pet, 70);
      // ground shadow
      var sh = document.createElement("div"); sh.className = "av-shadow"; rig.appendChild(sh);
      var angle = opts.angle != null ? opts.angle : -20, dragging = false, lastX = 0, vel = 0.25, alive = true;
      function draw() { rig.style.transform = "rotateX(-10deg) rotateY(" + angle + "deg)"; }
      function tick() {
        if (!alive) return;
        if (!dragging) { angle += vel; vel += (0.25 - vel) * 0.02; }
        draw(); requestAnimationFrame(tick);
      }
      el.addEventListener("pointerdown", function (e) { dragging = true; lastX = e.clientX; try { el.setPointerCapture(e.pointerId); } catch (x) {} });
      el.addEventListener("pointermove", function (e) { if (!dragging) return; var dx = e.clientX - lastX; lastX = e.clientX; angle += dx * 0.8; vel = dx * 0.3; draw(); });
      el.addEventListener("pointerup", function () { dragging = false; });
      el.addEventListener("pointercancel", function () { dragging = false; });
      draw(); requestAnimationFrame(tick);
      return { destroy: function () { alive = false; } };
    },
    colors: { HAIR: HAIR, TOPS: TOPS, SKIRTS: SKIRTS, PHONES: PHONES }
  };
})();
