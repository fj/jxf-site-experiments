/*
 * Quote Card — canvas rendering.
 *
 * Draws a card from resolved style structs (see app.js resolveStyles): plain
 * data, already merged from the basic controls and any advanced-mode CSS.
 * Colors are raw CSS color strings (the canvas parses them), lengths are
 * design px at a 1200px-wide card, transforms are affine matrices.
 */
(function () {
  "use strict";

  var Q = window.QCard = window.QCard || {};

  function pathRoundedRect(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // The rounded-rect perimeter as parametric segments with outward normals,
  // for the wavy style (which offsets sample points along the normal).
  function perimeterSegments(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    var HP = Math.PI / 2;
    var segs = [];
    function line(x1, y1, x2, y2, nx, ny) {
      var len = Math.hypot(x2 - x1, y2 - y1);
      if (len > 0.01) segs.push({ arc: false, x1: x1, y1: y1, x2: x2, y2: y2, nx: nx, ny: ny, len: len });
    }
    function arc(cx, cy, a0) {
      if (r > 0.01) segs.push({ arc: true, cx: cx, cy: cy, a0: a0, len: r * HP });
    }
    line(x + r, y, x + w - r, y, 0, -1);
    arc(x + w - r, y + r, -HP);
    line(x + w, y + r, x + w, y + h - r, 1, 0);
    arc(x + w - r, y + h - r, 0);
    line(x + w - r, y + h, x + r, y + h, 0, 1);
    arc(x + r, y + h - r, HP);
    line(x, y + h - r, x, y + r, -1, 0);
    arc(x + r, y + r, Math.PI);
    return { segs: segs, r: r };
  }

  function pathWavy(c, x, y, w, h, r, amp) {
    var per = perimeterSegments(x, y, w, h, r);
    var total = 0;
    per.segs.forEach(function (s) { total += s.len; });
    // An integral number of waves closes the loop seamlessly.
    var waves = Math.max(6, Math.round(total / Math.max(amp * 7, 30)));
    var k = waves * 2 * Math.PI / total;
    c.beginPath();
    var s0 = 0, first = true;
    per.segs.forEach(function (seg) {
      var n = Math.max(2, Math.ceil(seg.len / 3));
      for (var i = 0; i < n; i++) {
        var t = i / n, px, py, nx, ny;
        if (seg.arc) {
          var a = seg.a0 + t * Math.PI / 2;
          nx = Math.cos(a); ny = Math.sin(a);
          px = seg.cx + per.r * nx; py = seg.cy + per.r * ny;
        } else {
          px = seg.x1 + t * (seg.x2 - seg.x1); py = seg.y1 + t * (seg.y2 - seg.y1);
          nx = seg.nx; ny = seg.ny;
        }
        var off = amp * Math.sin((s0 + t * seg.len) * k);
        if (first) { c.moveTo(px + nx * off, py + ny * off); first = false; }
        else c.lineTo(px + nx * off, py + ny * off);
      }
      s0 += seg.len;
    });
    c.closePath();
  }

  // Runs fn with an affine matrix applied about (cx, cy); translation
  // components are design px, scaled by K.
  function withTransform(ctx, m, cx, cy, K, fn) {
    if (!m) { fn(); return; }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.transform(m[0], m[1], m[2], m[3], m[4] * K, m[5] * K);
    ctx.translate(-cx, -cy);
    fn();
    ctx.restore();
  }

  // Draws the border and returns how far it extends inward from the card edge
  // (margin + stroke), so the text layout can pad past it.
  function drawBorder(ctx, W, H, K, frame) {
    var t = frame.borderWidth * K;
    var margin = frame.borderInset / 100 * Math.min(W, H);
    if (frame.borderStyle === "none" || t <= 0) return margin;
    var r = frame.borderRadius * K;
    var mid = margin + t / 2;
    withTransform(ctx, frame.transform, W / 2, H / 2, K, function () {
      ctx.save();
      ctx.strokeStyle = frame.borderColor;
      ctx.lineWidth = t;
      if (frame.borderStyle === "double") {
        ctx.lineWidth = t / 3;
        pathRoundedRect(ctx, margin + t / 6, margin + t / 6, W - 2 * margin - t / 3, H - 2 * margin - t / 3, r);
        ctx.stroke();
        pathRoundedRect(ctx, margin + t * 5 / 6, margin + t * 5 / 6, W - 2 * margin - t * 5 / 3, H - 2 * margin - t * 5 / 3, Math.max(0, r - t * 2 / 3));
        ctx.stroke();
      } else if (frame.borderStyle === "wavy") {
        ctx.lineWidth = Math.max(t * 0.35, 1.5);
        pathWavy(ctx, mid, mid, W - 2 * mid, H - 2 * mid, Math.max(0, r - t / 2), t / 2);
        ctx.stroke();
      } else {
        if (frame.borderStyle === "dashed") ctx.setLineDash([t * 2.6, t * 1.5]);
        if (frame.borderStyle === "dotted") { ctx.setLineDash([0.01, t * 2.2]); ctx.lineCap = "round"; }
        pathRoundedRect(ctx, mid, mid, W - 2 * mid, H - 2 * mid, Math.max(0, r - t / 2));
        ctx.stroke();
      }
      ctx.restore();
    });
    return margin + t;
  }

  function drawCard(ctx, W, H, doc, styles) {
    var K = W / Q.REF_W;
    var text = styles.text, attr = styles.attr, frame = styles.frame;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = frame.background;
    ctx.fillRect(0, 0, W, H);

    var borderExtent = drawBorder(ctx, W, H, K, frame);
    var pad = borderExtent + frame.padding / 100 * Math.min(W, H);
    var cw = W - 2 * pad, ch = H - 2 * pad;
    if (cw < 20 || ch < 20 || !doc) return;

    var opts = {
      lineHeight: text.lineHeight,
      attrSize: function (bodySize) {
        return attr.sizePx != null ? Math.max(attr.sizePx * K, 4) : Math.max(bodySize * attr.sizePct / 100, 8);
      }
    };
    var size = text.autoSize ? Q.layout.fit(doc, cw, ch, opts) : Math.max(4, text.fontSize * K);
    var L = Q.layout.layoutDoc(doc, size, cw, opts);
    if (!L.lines.length) return;

    var bg = Q.css.color(frame.background);
    var chip = Q.css.isDark(bg && bg.hex) ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.08)";
    var top = pad + Math.max(0, (ch - L.height) / 2);

    function drawLine(line) {
      var family = line.attr ? attr.family : text.family;
      var align = line.attr ? attr.align : text.align;
      var x;
      if (align === "left") x = pad;
      else if (align === "right") x = pad + cw - line.width;
      else x = pad + (cw - line.width) / 2;
      var baseline = top + line.top + line.size * 0.8;
      var k = line.size / Q.layout.MEASURE_SIZE;

      line.frags.forEach(function (frag) {
        if (frag.gap) { x += frag.w; return; }
        var w = frag.ref * k;
        ctx.save();
        if (text.shadow) {
          ctx.shadowColor = text.shadow.color;
          ctx.shadowBlur = text.shadow.blur * K;
          ctx.shadowOffsetX = text.shadow.x * K;
          ctx.shadowOffsetY = text.shadow.y * K;
        }
        var tx = x;
        if (frag.code) {
          ctx.save();
          ctx.shadowColor = "transparent";
          ctx.fillStyle = chip;
          pathRoundedRect(ctx, x, baseline - line.size * 0.74, w, line.size * 0.98, line.size * 0.16);
          ctx.fill();
          ctx.restore();
          tx = x + Q.layout.CHIP_PAD * k;
        }
        ctx.font = Q.layout.fontString(frag, line.size, family);
        ctx.fillStyle = line.attr ? attr.color : text.color;
        ctx.fillText(frag.text, tx, baseline);
        if (frag.strike) {
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = Math.max(line.size / 18, 1);
          ctx.beginPath();
          ctx.moveTo(x, baseline - line.size * 0.27);
          ctx.lineTo(x + w, baseline - line.size * 0.27);
          ctx.stroke();
        }
        ctx.restore();
        x += w;
      });
    }

    // Body and attribution draw in separate passes so each group's transform
    // applies to its own lines (both pivot on the content-box center).
    var ccx = pad + cw / 2, ccy = pad + ch / 2;
    ctx.save();
    ctx.textBaseline = "alphabetic";
    withTransform(ctx, text.transform, ccx, ccy, K, function () {
      L.lines.forEach(function (line) { if (!line.attr) drawLine(line); });
    });
    withTransform(ctx, attr.transform, ccx, ccy, K, function () {
      L.lines.forEach(function (line) { if (line.attr) drawLine(line); });
    });
    ctx.restore();
  }

  Q.render = { drawCard: drawCard };
})();
