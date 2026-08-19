// ComfyUI-LinkLite — 轻量连线美化插件 V0.1
// 走线：节点盒"走廊"正交路由 + evenodd clip 挖孔(基线置于面板下方/贴边)，特效在 clip 之外绘制
// 形态：曲线/直线/折线/贴板/波浪/置底/弹性/避让 共8种（曲线曲率固定为最高）
// 特效：水滴/流点/箭头/彩带/虚线/脉动/彗星/光环/流星/流光/波纹/光子（样本路径致密化，拐角同样生效）
// 连线高光：勾选后，选中节点 → 下一个节点之间的连线加粗+2档、透明度+30%
// 性能：路径几何缓存(静止帧零重算) + 前台画布节流重绘(~22fps,跳过背景)，多工作流流畅、GPU/显存占用小
// 纯 Canvas2D，动画 rAF + 前台画布重绘驱动；无 WebGL/Shader、无泛光、无曲率调节
import { app } from "../../../scripts/app.js";

/* ---------------- 文案（中英双语） ---------------- */
const T = {
  zh: {
    title: "连线美化", on: "启用",
    style: "连线形态", fx: "连线动效",
    color: "颜色", colorFixed: "固定颜色",
    highlight: "连线高光", arrow: "方向箭头",
    flowSpeed: "速度", opacity: "透明度",
    width: "粗细", lang: "界面语言", reset: "重置默认",
    loaded: "LinkLite 已启用 ✓",
    auto: "自动", zh_l: "中文", en_l: "English",
    st_curve: "曲线", st_straight: "直线", st_linear: "折线",
    st_board: "贴板", st_wave: "波浪", st_under: "置底",
    st_elastic: "弹性", st_ortho: "避让",
    fx_none: "无", fx_dots: "流点", fx_spider: "水滴", fx_arrow: "箭头",
    fx_rgb: "彩带", fx_dash: "虚线", fx_pulse: "脉动",
    fx_comet: "彗星", fx_ring: "光环",
    fx_meteor: "流星", fx_sweep: "流光", fx_ripple: "波纹", fx_photon: "光子",
    tr_always: "始终流动", tr_off: "关闭",
    cl_auto: "跟随类型", cl_fixed: "固定",
  },
  en: {
    title: "Link Beautify", on: "Enable",
    style: "Line Style", fx: "Effect", trigger: "Trigger",
    color: "Color", colorFixed: "Fixed Color",
    highlight: "Highlight link", arrow: "Direction arrow",
    flowSpeed: "Speed", opacity: "Opacity",
    width: "Width", lang: "Language", reset: "Reset defaults",
    loaded: "LinkLite loaded ✓",
    auto: "Auto", zh_l: "中文", en_l: "English",
    st_curve: "Curve", st_straight: "Straight", st_linear: "Linear",
    st_board: "Orthogonal", st_wave: "Wave", st_under: "Understated",
    st_elastic: "Elastic", st_ortho: "Auto-avoid",
    fx_none: "None", fx_dots: "Flow dots", fx_spider: "Water drop", fx_arrow: "Arrow",
    fx_rgb: "RGB", fx_dash: "Dash flow", fx_pulse: "Pulse",
    fx_comet: "Comet", fx_ring: "Energy Ring",
    fx_meteor: "Meteor", fx_sweep: "Sweep", fx_ripple: "Ripple", fx_photon: "Photon",
    tr_always: "Always", tr_off: "Off",
    cl_auto: "By type", cl_fixed: "Fixed",
  },
};

/* ---------------- 配置 ---------------- */
const KEY = "comfyui.linklite.v6";
const STYLES = ["curve", "straight", "linear", "board", "wave", "under", "elastic", "ortho"];
const FXS = ["none", "spider", "dots", "arrow", "rgb", "dash", "pulse", "comet", "ring", "meteor", "sweep", "ripple", "photon"];
const CURVE_MAX = 1.6;               // 曲线曲率固定为最高
const HL_WIDTH_LIFT = 1;               // 连线高光：粗细 +1 档（含蓄，仅比普通线略粗）
const HL_ALPHA_LIFT = 0.30;            // 连线高光：透明度 +30%
const DEFAULTS = {
  enabled: true,
  style: "curve",
  fx: "spider",
  colorMode: "auto",
  color: "#7aa6ff",
  highlight: false,   // 连线高光：仅"选中节点→下一节点"的连线加粗提亮
  arrow: false,
  flowSpeed: 1.0,
  opacity: 1.0,
  width: 2.4,
  clipNodes: true,   // 挖空节点面板，连线视觉上"在面板下方/贴边"
  lang: "auto",
};
let cfg = load();
let lang = resolveLang();

function load() {
  let o = {};
  try { const raw = localStorage.getItem(KEY); if (raw) o = JSON.parse(raw) || {}; } catch (e) {}
  const c = Object.assign({}, DEFAULTS, o);
  if (STYLES.indexOf(c.style) < 0) c.style = DEFAULTS.style;
  if (FXS.indexOf(c.fx) < 0) c.fx = DEFAULTS.fx;
  return c;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }
function resolveLang() {
  if (cfg.lang && cfg.lang !== "auto") return cfg.lang;
  return (navigator.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en";
}
function tr() { return T[lang]; }
function setCfg(patch, redraw) {
  Object.assign(cfg, patch);
  if ("lang" in patch) lang = resolveLang();
  save();
  if (redraw === false) return;
  if (app.canvas) app.canvas.setDirtyCanvas(true, true);
}

/* ---------------- 几何：端口方向 + 节点盒走廊路由 ---------------- */
function isPointLike(v) { return Array.isArray(v) && v.length >= 2 && typeof v[0] === "number"; }
function getDirs(rest, a, b) {
  let dS = 0, dE = 0;
  if (Array.isArray(rest) && rest.length) {
    const nums = rest.filter(v => typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 5);
    if (nums.length >= 2) { dS = nums[0]; dE = nums[1]; return { dS, dE }; }
  }
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (Math.abs(dx) >= Math.abs(dy)) { dS = dx >= 0 ? 4 : 3; dE = dx >= 0 ? 3 : 4; }
  else { dS = dy >= 0 ? 2 : 1; dE = dy >= 0 ? 1 : 2; }
  return { dS, dE };
}
function unitOut(d, ax, ay, bx, by) {
  switch (d) {
    case 4: return [1, 0];
    case 3: return [-1, 0];
    case 2: return [0, 1];
    case 1: return [0, -1];
    default: const dx = bx - ax, dy = by - ay, di = Math.hypot(dx, dy) || 1; return [dx / di, dy / di];
  }
}
function outset(a, b, dirs, w) {
  const o = Math.max(5, w * 1.6);
  const v1 = unitOut(dirs.dS, a[0], a[1], b[0], b[1]);
  const v2 = unitOut(dirs.dE, b[0], b[1], a[0], a[1]);
  return [
    [a[0] + v1[0] * o, a[1] + v1[1] * o],
    [b[0] + v2[0] * o, b[1] + v2[1] * o],
  ];
}
function bezierPts(x0, y0, c1x, c1y, c2x, c2y, x1, y1, N) {
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    pts.push([
      u*u*u*x0 + 3*u*u*t*c1x + 3*u*t*t*c2x + t*t*t*x1,
      u*u*u*y0 + 3*u*u*t*c1y + 3*u*t*t*c2y + t*t*t*y1,
    ]);
  }
  return pts;
}
function rectOf(node) {
  if (!node || !node.pos) return null;
  const s = node.size || [0, 0];
  return { x0: node.pos[0], y0: node.pos[1], x1: node.pos[0] + (s[0] || 0), y1: node.pos[1] + (s[1] || 0) };
}
function linkNodes(canvas, link) {
  if (!canvas || !canvas.graph || !link) return [null, null];
  const g = canvas.graph;
  let A = null, B = null;
  try { if (g.getNodeById) { A = g.getNodeById(link.origin_id); B = g.getNodeById(link.target_id); } } catch (e) {}
  if ((!A || !B) && Array.isArray(g._nodes)) {
    for (const n of g._nodes) {
      if (!A && String(n.id) === String(link.origin_id)) A = n;
      if (!B && String(n.id) === String(link.target_id)) B = n;
    }
  }
  return [A, B];
}
function dedupePts(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], q = out[out.length - 1];
    if (p[0] === q[0] && p[1] === q[1]) continue;
    out.push(p);
  }
  return out;
}
function pickOrthoCoord(ga, gb, axis, def, gap) {
  const boxes = [];
  if (ga) boxes.push(ga);
  if (gb) boxes.push(gb);
  const hit = (v) => {
    for (const r0 of boxes) {
      if (axis === "y") { if (v > r0.y0 && v < r0.y1) return true; }
      else if (v > r0.x0 && v < r0.x1) return true;
    }
    return false;
  };
  let v = def;
  for (let k = 0; k < 8 && hit(v); k++) v = def + gap * (1 + k) * (k % 2 === 0 ? 1 : -1);
  return hit(v) ? def : v;
}
// 折线：取两端节点包围盒之外的中间"走廊"
function flexWay(a, b, dirs, w, nodes) {
  const off = Math.max(10, w * 2.5);
  const gA = rectOf(nodes ? nodes[0] : null), gB = rectOf(nodes ? nodes[1] : null);
  const vA = unitOut(dirs.dS, a[0], a[1], b[0], b[1]);
  const vB = unitOut(dirs.dE, b[0], b[1], a[0], a[1]);
  const horiz = Math.abs(vA[0]) >= Math.abs(vA[1]);
  const aOut = [a[0] + vA[0] * off, a[1] + vA[1] * off];
  const bIn = [b[0] + vB[0] * off, b[1] + vB[1] * off];
  if (horiz) {
    const cy = pickOrthoCoord(gA, gB, "y", (aOut[1] + bIn[1]) / 2, off);
    return dedupePts([[a[0], a[1]], aOut, [aOut[0], cy], [bIn[0], cy], bIn, [b[0], b[1]]]);
  }
  const cx = pickOrthoCoord(gA, gB, "x", (aOut[0] + bIn[0]) / 2, off);
  return dedupePts([[a[0], a[1]], aOut, [cx, aOut[1]], [cx, bIn[1]], bIn, [b[0], b[1]]]);
}
// 贴板：走线紧贴两端节点面板外侧边缘（沿面板边"走廊"，不过头也贴合）
function boardWay(a, b, dirs, w, nodes) {
  const off = Math.max(6, w * 1.8);
  const gA = rectOf(nodes ? nodes[0] : null), gB = rectOf(nodes ? nodes[1] : null);
  const vA = unitOut(dirs.dS, a[0], a[1], b[0], b[1]);
  const vB = unitOut(dirs.dE, b[0], b[1], a[0], a[1]);
  const horiz = Math.abs(vA[0]) >= Math.abs(vA[1]);
  const aOut = [a[0] + vA[0] * off, a[1] + vA[1] * off];
  const bIn = [b[0] + vB[0] * off, b[1] + vB[1] * off];
  // 两者都取"合并包围盒"朝走廊一侧的外边，确保始终在面板外侧贴着走
  if (horiz) {
    const cy = Math.min(
      (gA ? gA.y0 : aOut[1]), (gB ? gB.y0 : bIn[1]), aOut[1], bIn[1]
    ) - off;
    return dedupePts([[a[0], a[1]], aOut, [aOut[0], cy], [bIn[0], cy], bIn, [b[0], b[1]]]);
  }
  const cx = Math.min(
    (gA ? gA.x0 : aOut[0]), (gB ? gB.x0 : bIn[0]), aOut[0], bIn[0]
  ) - off;
  return dedupePts([[a[0], a[1]], aOut, [cx, aOut[1]], [cx, bIn[1]], bIn, [b[0], b[1]]]);
}
// 弹性曲线：橡皮筋式。控制点随两端距离动态变化——离得越远弯度越大、越近平直，
// 弯向偏向两端端口朝向的合方向，避免压到面板。
function elasticPts(x0, y0, x1, y1, dirs, d) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const vS = unitOut(dirs.dS, x0, y0, x1, y1);
  const vE = unitOut(dirs.dE, x1, y1, x0, y0);
  let ax = vS[0] + vE[0], ay = vS[1] + vE[1];
  if (Math.hypot(ax, ay) < 1e-3) { ax = -(y1 - y0) / d; ay = (x1 - x0) / d; }
  const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
  const off = Math.min(d * 0.4, 10 + Math.sqrt(d) * 2.6);   // 随距离动态增长的弯度
  const cxp = mx + ax * off, cyp = my + ay * off;
  const pts = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30, u = 1 - t;
    pts.push([u * u * x0 + 2 * u * t * cxp + t * t * x1, u * u * y0 + 2 * u * t * cyp + t * t * y1]);
  }
  return pts;
}
function graphNodes(canvas, nodes) {
  const g = canvas ? (canvas.graph || canvas) : null;
  return (g && Array.isArray(g._nodes)) ? g._nodes : (nodes || []);
}
function nodeRects(list) {
  const rs = [];
  for (const n of list || []) { const r = rectOf(n); if (r) rs.push(r); }
  return rs;
}
// 正交避让：在由端点与各节点盒坐标构成的 Hanan 网格上跑 A*，自动绕开所有中间节点，
// 得正交路径后再圆角化，形成智能规划的 PCB 走线（复杂工作流友好）。
function orthoRoute(a, b, obs) {
  const xs = [a[0], b[0]], ys = [a[1], b[1]];
  for (const r of obs) { xs.push(r.x0, r.x1); ys.push(r.y0, r.y1); }
  const X = Array.from(new Set(xs)).sort((p, q) => p - q);
  const Y = Array.from(new Set(ys)).sort((p, q) => p - q);
  const W = X.length, H = Y.length, N = W * H;
  const id = (x, y) => y * W + x;
  const segClear = (x1, y1, x2, y2) => {
    for (const q of obs) {
      if (x1 === x2) {
        if (x1 > q.x0 && x1 < q.x1) {
          const m = Math.min(y1, y2), M = Math.max(y1, y2);
          if (M > q.y0 && m < q.y1) return false;
        }
      } else if (y1 > q.y0 && y1 < q.y1) {
        const m = Math.min(x1, x2), M = Math.max(x1, x2);
        if (M > q.x0 && m < q.x1) return false;
      }
    }
    return true;
  };
  const si = X.indexOf(a[0]), sj = Y.indexOf(a[1]);
  const ti = X.indexOf(b[0]), tj = Y.indexOf(b[1]);
  const start = id(si, sj), target = id(ti, tj);
  const g = new Array(N).fill(Infinity), par = new Array(N).fill(-1);
  const open = new Set(), f = new Array(N);
  g[start] = 0; f[start] = Math.abs(ti - si) + Math.abs(tj - sj); open.add(start);
  let found = false;
  while (open.size) {
    let cur = -1, cf = Infinity;
    for (const n of open) { if (f[n] < cf) { cf = f[n]; cur = n; } }
    if (cur === target) { found = true; break; }
    open.delete(cur);
    const cx = cur % W, cy = (cur / W) | 0;
    const nb = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
    for (const nv of nb) {
      const nx = nv[0], ny = nv[1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (!segClear(X[cx], Y[cy], X[nx], Y[ny])) continue;
      const nn = id(nx, ny);
      const ng = g[cur] + (Math.abs(X[nx] - X[cx]) + Math.abs(Y[ny] - Y[cy]));
      if (ng < g[nn]) {
        g[nn] = ng; par[nn] = cur;
        f[nn] = ng + Math.abs(ti - nx) + Math.abs(tj - ny);
        open.add(nn);
      }
    }
  }
  if (!found || g[target] === Infinity) return dedupePts([[a[0], a[1]], [a[0], b[1]], [b[0], b[1]]]);
  const pts = [];
  for (let c = target; c !== -1; c = par[c]) { pts.push([X[c % W], Y[(c / W) | 0]]); if (c === start) break; }
  pts.reverse();
  return dedupePts(pts);
}
function buildPts(a, b, c, dirs, w, nodes, canvas) {
  const s = c.style;
  const [p1, p2] = outset(a, b, dirs, w);
  const x0 = p1[0], y0 = p1[1], x1 = p2[0], y1 = p2[1];
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
  if (s === "curve") {
    const ctrl = (Math.max(24, d * 0.25) * CURVE_MAX + 6);
    const v1p = unitOut(dirs.dS, x0, y0, x1, y1);
    const v2p = unitOut(dirs.dE, x1, y1, x0, y0);
    return bezierPts(x0, y0, x0 + v1p[0] * ctrl, y0 + v1p[1] * ctrl,
      x1 + v2p[0] * ctrl, y1 + v2p[1] * ctrl, x1, y1, 36);
  }
  if (s === "straight" || s === "under") return dedupePts([p1, p2]);
  if (s === "elastic") return elasticPts(x0, y0, x1, y1, dirs, d);
  if (s === "ortho") {
    const obs = nodeRects(graphNodes(canvas, nodes));
    const route = orthoRoute(p1, p2, obs);
    return roundedPts(route, 5);
  }
  if (s === "linear") return flexWay(p1, p2, dirs, w, nodes);
  if (s === "board") return roundedPts(boardWay(p1, p2, dirs, w, nodes), 6);
  if (s === "wave") {
    const prx = -dy / d, pry = dx / d;
    const amp = Math.min(7, d * 0.05) * 0.6;
    const pts = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      const wav = Math.sin(t * Math.PI * 3) * amp * (t * (1 - t)) * 4;
      pts.push([x0 + dx * t + prx * wav, y0 + dy * t + pry * wav]);
    }
    return pts;
  }
  return dedupePts([p1, p2]);
}
function strokePath(ctx, pts) {
  if (!pts.length) return;
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}
function ptsToPath2D(pts) {
  if (!pts.length) return null;
  const p2 = new Path2D();
  p2.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p2.lineTo(pts[i][0], pts[i][1]);
  return p2;
}
function measure(pts) {
  const lens = new Array(pts.length - 1);
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    lens[i - 1] = seg; total += seg;
  }
  return { lens, total };
}
function pointAtLen(pts, lens, total, off) {
  if (!(total > 0) || !(lens.length)) return pts[pts.length - 1];
  let t = ((off % total) + total) % total;
  for (let i = 0; i < lens.length; i++) {
    const seg = lens[i];
    if (t <= seg) {
      const p0 = pts[i], p1 = pts[i + 1];
      const f = seg > 0 ? t / seg : 0;
      return [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f];
    }
    t -= seg;
  }
  return pts[pts.length - 1];
}
function indexAtLen(lens, total, off) {
  if (!(total > 0)) return Math.max(0, lens.length - 1);
  let t = ((off % total) + total) % total;
  for (let i = 0; i < lens.length; i++) {
    if (t <= lens[i]) return i;
    t -= lens[i];
  }
  return lens.length - 1;
}
// 圆角化：把正交折线（贴板/折线）的每个 90° 拐角换成二次贝塞尔圆角，呈现 PCB 板走线观感
function roundedPts(pts, radius) {
  if (!pts || pts.length < 3) return pts;
  const rad = Math.max(2, radius || 6);
  const out = [pts[0].slice()];
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], c = pts[i], p1 = pts[i + 1];
    const v0x = c[0] - p0[0], v0y = c[1] - p0[1];
    const v1x = p1[0] - c[0], v1y = p1[1] - c[1];
    const l0 = Math.hypot(v0x, v0y), l1 = Math.hypot(v1x, v1y);
    if (l0 < 1e-6 || l1 < 1e-6) { out.push(c.slice()); continue; }
    const r = Math.max(1, Math.min(rad, l0 / 2, l1 / 2));
    const ux0 = v0x / l0, uy0 = v0y / l0, ux1 = v1x / l1, uy1 = v1y / l1;
    const bx = c[0] - ux0 * r, by = c[1] - uy0 * r;   // 圆角起点
    const ex = c[0] + ux1 * r, ey = c[1] + uy1 * r;   // 圆角终点
    out.push([bx, by]);
    const N = 6;
    for (let k = 1; k <= N; k++) {
      const t = k / N, u = 1 - t;
      out.push([u*u*bx + 2*u*t*c[0] + t*t*ex, u*u*by + 2*u*t*c[1] + t*t*ey]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return dedupePts(out);
}
// 路径致密化：统一重采样为 ~step 步长，保证折线/贴板等"拐角样式"与直线一样都有均匀特效
function densify(pts, step) {
  const out = [pts[0].slice()];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a0 = pts[i - 1], a1 = pts[i];
    const dx = a1[0] - a0[0], dy = a1[1] - a0[1];
    const seg = Math.hypot(dx, dy);
    if (seg <= 1e-6) continue;
    let placed = step - carry;
    while (placed <= seg - 1e-6) {
      const f = placed / seg;
      out.push([a0[0] + dx * f, a0[1] + dy * f]);
      placed += step;
    }
    carry = seg - (placed - step);
    if (carry < 0) carry = 0;
    else if (carry >= step) carry = 0;
    out.push(a1.slice());
  }
  return out;
}

/* ---------------- 性能：路径几何缓存 ---------------- */
// 几何仅在 端口/样式/粗细/缩放/节点盒 变化时才重算；静止帧零计算、零分配，
// 直接复用走线结果、致密化路径、长度测量与命中 Path2D（多工作流大量连线时
// 从"逐帧重跑 A*/圆角/致密/测量"降为"零开销"，是防卡顿的关键）。
const geoCaches = new WeakMap();
function hashRect(r, h) {
  if (!r) return h;
  h = ((h * 33) + ((r.x0 * 7 + r.y0 * 13) | 0)) | 0;
  h = ((h * 33) + ((r.x1 * 3 + r.y1 * 5) | 0)) | 0;
  return h;
}
function getGeo(canvas, link, a, b, c, dirs, w, scale, nodes) {
  let m = geoCaches.get(canvas);
  if (!m) { m = new Map(); geoCaches.set(canvas, m); }
  if (m.size > 1200) m.clear();   // 内存护栏：超大图自动清理，避免缓存无限增长
  const s = c.style, id = String(link.id);
  let sig = s + '|' + w.toFixed(2) + '|' + scale.toFixed(3) + '|' +
    a[0].toFixed(1) + ',' + a[1].toFixed(1) + ',' + b[0].toFixed(1) + ',' + b[1].toFixed(1);
  if (s === 'linear' || s === 'board') {
    // 这两种只受两端节点盒影响，用两端包围盒哈希参与签名即可
    sig += '|N' + hashRect(rectOf(nodes[0]), 0) + '.' + hashRect(rectOf(nodes[1]), 0);
  } else if (s === 'ortho') {
    // 正交避让受全图所有节点盒影响，任一中继节点移动都要重算路径
    let ah = 0; const gl = graphNodes(canvas, nodes);
    for (const n of gl) ah = hashRect(rectOf(n), ah);
    sig += '|O' + ah;
  }
  const e = m.get(id);
  if (e && e.sig === sig) return e;
  const g = { sig, pts: buildPts(a, b, { style: s }, dirs, w, nodes, canvas), fpts: null, mm: null, path: null };
  m.set(id, g);
  return g;
}
function ensureFxGeo(e) {
  if (!e || e.fpts) return e;
  e.fpts = densify(e.pts, 4);
  e.mm = measure(e.fpts);
  return e;
}

/* ---------------- 渲染上下文 ---------------- */
function getScale(canvas) {
  let s = 1;
  try { s = (canvas && (canvas.ds && canvas.ds.scale)) || (canvas && canvas.zoom) || 1; } catch (e) {}
  return typeof s === "number" && s > 0 ? s : 1;
}
function linkColor(canvas, link, c) {
  if (c.colorMode === "fixed") return c.color;
  let table = null;
  try {
    table = canvas && canvas.link_type_colors
      ? canvas.link_type_colors
      : (globalThis.LGraphCanvas && globalThis.LGraphCanvas.link_type_colors) || null;
  } catch (e) {}
  let col = table ? table[link.type] : null;
  if (!col && link.color) col = link.color;
  return col || c.color;
}

/* 选中节点集合（每次实时构建，不依赖帧缓存） */
function getSelectedSet(canvas) {
  const raw = canvas ? canvas.selected_nodes : null, out = {};
  if (!raw) return out;
  if (Array.isArray(raw)) {
    for (const v of raw) out[String(v && v.id != null ? v.id : v)] = 1;
  } else if (raw instanceof Map) {
    for (const v of raw.values()) out[String(v && v.id != null ? v.id : v)] = 1;
  } else if (raw instanceof Set) {
    for (const v of raw) out[String(v && v.id != null ? v.id : v)] = 1;
  } else {
    for (const k in raw) { const v = raw[k]; out[String(v && v.id != null ? v.id : v)] = 1; }
  }
  return out;
}
// 动效开关：已移除"触发方式"——选了动效就持续流动，"无"即关闭
function isActive(c, link) { return true; }
// 高光开关：仅当连线的任一端点是"已被选中的节点"时生效（点击节点才点亮该通道，
// 与触发方式无关，避免"开了高光就全图加粗"）
function isChannelSelected(canvas, link) {
  const sel = getSelectedSet(canvas);
  return !!(sel[String(link.origin_id)] || sel[String(link.target_id)]);
}

/* ---------------- 特效：相位滑动 + life 头尾淡出 ---------------- */
// 稳定显色的光点：纯 source-over 绘制，不依赖 lighter 加法混合（部分主题/渲染环境下
// lighter 不显色，是此前光点类特效"看似失效"的根因）。深色衬底 → 亮色本体 → 白色热芯，
// 浅色/深色主题下都清晰可见。
// ---------------------------------------------------------------------
// 特效统一约定：与彗星使用"绝对速度"位移 u = (time*spd) % total（速度恒为
// spd 像素/秒，不随路径长度放大）；水滴/流动点/箭头均"与线同色、不描边、不
// 泛光、不突兀"——去掉了旧版的深色衬底与白色热芯。
// ---------------------------------------------------------------------
function dotAt(ctx, x, y, r, col, a) {
  if (a < 0.04 || r <= 0) return;
  ctx.fillStyle = col;
  ctx.globalAlpha = Math.min(1, a);
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  ctx.globalAlpha = 1;
}
function dirAt(pts, m, u) {
  const idx = indexAtLen(m.lens, m.total, u);
  let dx, dy;
  if (idx < pts.length - 1) { const A = pts[idx], B = pts[idx + 1]; dx = B[0] - A[0]; dy = B[1] - A[1]; }
  else { dx = pts[pts.length - 1][0] - pts[0][0]; dy = pts[pts.length - 1][1] - pts[0][1]; }
  const d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d];
}
// 彗星式拖尾：从头部向后依次渐隐渐细的圆链
function cometTrail(ctx, pts, m, u, R, col, op, steps, e) {
  ctx.fillStyle = col;
  const N = steps || 18, exp = e || 2;
  for (let L = 0; L < N; L++) {
    const q = pointAtLen(pts, m.lens, m.total, ((u - L * R * 1.5) % m.total + m.total) % m.total);
    const t = 1 - L / N;
    const a = Math.pow(t, exp) * 0.55 * op;
    if (a < 0.045) break;
    const r = R * (1 - L * 0.04);
    if (r <= 0) break;
    ctx.globalAlpha = Math.min(1, a);
    ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 6.2832); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
// 纯色三角箭头（无深色衬底、无白芯）
function arrowHead(ctx, p, dx, dy, sz, col, a) {
  if (a < 0.05) return;
  const nx = -dy, ny = dx, half = sz * 0.5;
  ctx.fillStyle = col;
  ctx.globalAlpha = Math.min(1, a);
  ctx.beginPath();
  ctx.moveTo(p[0] + dx * 3, p[1] + dy * 3);
  ctx.lineTo(p[0] - dx * sz * 0.8 + nx * half, p[1] - dy * sz * 0.8 + ny * half);
  ctx.lineTo(p[0] - dx * sz * 0.8 - nx * half, p[1] - dy * sz * 0.8 - ny * half);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
}
// 流动点：均匀散布的纯色小光点沿路径流动（无泛光；速度全程与彗星一致）
function fxDots(ctx, pts, c, time, col, w, op, mm) {
  const m = mm || measure(pts); if (!(m.total > 0)) return;
  const count = Math.max(2, Math.min(7, Math.floor(m.total / 42)));
  const spd = 56 * c.flowSpeed;
  const R = Math.max(2.0, w * 1.0);
  const u0 = ((time * spd) % m.total + m.total) % m.total;
  for (let i = 0; i < count; i++) {
    const base = (u0 + (m.total / count) * i) % m.total;
    const life = Math.sin((base / m.total) * Math.PI);
    if (life < 0.08) continue;
    const p = pointAtLen(pts, m.lens, m.total, base);
    dotAt(ctx, p[0], p[1], R * (0.65 + 0.35 * life), col, op * (0.6 + 0.4 * life));
  }
  ctx.globalAlpha = 1;
}
// 水滴：较大的水珠亮核 + 彗星式渐隐拖尾（更疏；速度与彗星一致；无泛光）
function fxSpider(ctx, pts, c, time, col, w, op, mm) {
  const m = mm || measure(pts); if (!(m.total > 0)) return;
  const count = Math.max(1, Math.min(3, Math.floor(m.total / 100)));
  const spd = 56 * c.flowSpeed;
  const R = Math.max(2.6, w * 1.15);
  const u0 = ((time * spd) % m.total + m.total) % m.total;
  for (let i = 0; i < count; i++) {
    const u = (u0 + (m.total / count) * i) % m.total;
    const life = Math.sin((u / m.total) * Math.PI);
    if (life < 0.1) continue;
    cometTrail(ctx, pts, m, u, R, col, op, 14);
    const p = pointAtLen(pts, m.lens, m.total, u);
    dotAt(ctx, p[0], p[1], R * 1.25 * (0.8 + 0.2 * life), col, op * (0.75 + 0.25 * life));
  }
  ctx.globalAlpha = 1;
}
// 箭头：箭头本体 + 身后渐隐渐细的箭头拖尾（学习彗星拖尾样式；与线同色、无衬底、无白芯）
function fxArrowRun(ctx, pts, c, time, col, w, scale, op, mm) {
  const m = mm || measure(pts); if (!(m.total > 0)) return;
  const count = Math.max(2, Math.min(5, Math.floor(m.total / 54)));
  const spd = 56 * c.flowSpeed;
  const sz = Math.max(4, w * 2.1);
  const u0 = ((time * spd) % m.total + m.total) % m.total;
  for (let i = 0; i < count; i++) {
    const u = (u0 + (m.total / count) * i) % m.total;
    const life = Math.sin((u / m.total) * Math.PI);
    if (life < 0.1) continue;
    const pos = pointAtLen(pts, m.lens, m.total, u);
    const [dx, dy] = dirAt(pts, m, u);
    // 更长的箭头拖尾：12 段渐隐渐细，拉开间距让"彗星式拖尾"更明显
    for (let L = 0; L < 12; L++) {
      const t = 1 - L / 12, a = Math.pow(t, 2.0);
      if (a < 0.05) break;
      const q = pointAtLen(pts, m.lens, m.total, ((u - L * sz * 1.4) % m.total + m.total) % m.total);
      arrowHead(ctx, q, dx, dy, sz * (0.96 - L * 0.055), col, a * 0.7 * op);
    }
    arrowHead(ctx, pos, dx, dy, sz, col, (0.75 + 0.25 * life) * op);
  }
  ctx.globalAlpha = 1;
}
// RGB：沿路径流动的渐变彩带（去掉大泛光，只保留与线同宽的单层彩色线）
function fxRgb(ctx, pts, c, time, w, op) {
  const n = pts.length; if (n < 2) return;
  const speed = 26 * c.flowSpeed;
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  for (let i = 0; i < n - 1; i++) {
    const t = i / (n - 1);
    const hue = (t * 360 + time * speed * 3) % 360;
    ctx.strokeStyle = `hsl(${hue},90%,62%)`;
    ctx.globalAlpha = op; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
// 虚线：流动虚线（速度参考基准，最快速度较之前减半）
function fxDash(ctx, pts, c, time, col, w, op) {
  const dash = Math.max(12, w * 6);
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.15 * op; ctx.lineWidth = w * 3;
  strokePath(ctx, pts);
  ctx.setLineDash([dash, dash * 0.7]);
  ctx.lineDashOffset = -((time * (80 * c.flowSpeed)) % (dash * 1.7));
  ctx.globalAlpha = op; ctx.lineWidth = w;
  strokePath(ctx, pts);
  ctx.setLineDash([]); ctx.globalAlpha = 1;
}
// 点拨：单个与线同色的柔和亮点沿路径奔走（无描边、无泛光，轻微呼吸不突兀）
function fxPulse(ctx, pts, c, time, col, w, scale, op, mm) {
  const m = mm || measure(pts); if (!(m.total > 0)) return;
  const spd = 72 * c.flowSpeed;
  const u = ((time * spd) % m.total + m.total) % m.total;
  const p = pointAtLen(pts, m.lens, m.total, u);
  const t = u / m.total;
  const r = Math.max(2.2, w * 1.1) * (0.7 + 0.3 * Math.sin(Math.PI * t));
  ctx.fillStyle = col;
  ctx.globalAlpha = op;
  ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.2832); ctx.fill();
  ctx.globalAlpha = 1;
}
// 彗星：与线同色的单颗亮核 + 渐隐尾迹（参考实现；无深色衬底、无白芯泛光）
function fxComet(ctx, pts, c, time, col, w, op, mm) {
  const m = mm || measure(pts); if (!(m.total > 0)) return;
  const spd = 56 * c.flowSpeed;
  const u = ((time * spd) % m.total + m.total) % m.total;
  const R = Math.max(2.0, w * 0.9);
  cometTrail(ctx, pts, m, u, R, col, op, 18);
  const p = pointAtLen(pts, m.lens, m.total, u);
  dotAt(ctx, p[0], p[1], R * 1.1, col, op);
}
// 能量环：与线同色的单层细圆环沿连线推进（无深色衬底、无水纹泛光、无白芯）
function fxRing(ctx, pts, c, time, col, w, op, mm) {
  const m = mm || measure(pts); if (!(m.total > 0)) return;
  const u = ((time * (30 * c.flowSpeed)) % m.total + m.total) % m.total;
  const p = pointAtLen(pts, m.lens, m.total, u);
  const R = Math.max(3.0, w * 1.8);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.8, w * 0.75);
  ctx.globalAlpha = op;
  ctx.beginPath(); ctx.arc(p[0], p[1], R, 0, 6.2832); ctx.stroke();
  ctx.globalAlpha = 1;
}

/* ---------------- 新增 4 种带拖尾动效（均与线同色、无泛光） ---------------- */
// 流星雨：4 颗彗星错峰并行，均带彗星式拖尾
function fxMeteor(ctx, pts, c, time, col, w, op, mm) {
  const m = mm || measure(pts); if (!(m.total > 0)) return;
  const N = 4;
  const spd = 56 * c.flowSpeed;
  const R = Math.max(1.9, w * 0.85);
  const u0 = ((time * spd) % m.total + m.total) % m.total;
  for (let i = 0; i < N; i++) {
    const u = (u0 + (m.total / N) * i) % m.total;
    const life = Math.sin((u / m.total) * Math.PI);
    if (life < 0.1) continue;
    cometTrail(ctx, pts, m, u, R, col, op * (0.6 + 0.4 * life), 16);
    const p = pointAtLen(pts, m.lens, m.total, u);
    dotAt(ctx, p[0], p[1], R * 1.05, col, op * (0.7 + 0.3 * life));
  }
  ctx.globalAlpha = 1;
}
// 光子：单颗小而亮的核 + 较短较细的渐隐拖尾，速度略快于彗星
function fxPhoton(ctx, pts, c, time, col, w, op, mm) {
  const m = mm || measure(pts); if (!(m.total > 0)) return;
  const spd = 64 * c.flowSpeed;
  const R = Math.max(1.8, w * 0.7);
  const u = ((time * spd) % m.total + m.total) % m.total;
  cometTrail(ctx, pts, m, u, R, col, op, 10, 2.4);
  const p = pointAtLen(pts, m.lens, m.total, u);
  dotAt(ctx, p[0], p[1], R * 1.0, col, op);
}
// 波纹：前进亮点 + 身后呈正弦摆动的渐隐拖尾
function fxRipple(ctx, pts, c, time, col, w, op, mm) {
  const m = mm || measure(pts); if (!(m.total > 0)) return;
  const spd = 52 * c.flowSpeed;
  const R = Math.max(2.1, w * 1.0);
  const u = ((time * spd) % m.total + m.total) % m.total;
  for (let L = 0; L < 22; L++) {
    const t = 1 - L / 22, a = Math.pow(t, 1.8) * 0.55 * op;
    if (a < 0.05) break;
    const back = ((u - L * R * 1.1) % m.total + m.total) % m.total;
    const q = pointAtLen(pts, m.lens, m.total, back);
    const d = dirAt(pts, m, back), n = [-d[1], d[0]];
    const side = Math.sin(L * 0.9) * R * 0.45 * t;
    dotAt(ctx, q[0] + n[0] * side, q[1] + n[1] * side, R * (1 - L * 0.035), col, a);
  }
  const p = pointAtLen(pts, m.lens, m.total, u);
  dotAt(ctx, p[0], p[1], R * 1.15, col, op);
}
// 流光：偏慢的长光带（渐细渐暗的拖尾线段 + 圆头亮核）
function fxSweep(ctx, pts, c, time, col, w, op, mm) {
  const m = mm || measure(pts); if (!(m.total > 0)) return;
  const spd = 40 * c.flowSpeed;
  const R = Math.max(2.0, w * 1.1);
  const u = ((time * spd) % m.total + m.total) % m.total;
  const LONG = 26;
  ctx.strokeStyle = col; ctx.lineCap = "round"; ctx.lineJoin = "round";
  let prev = null;
  for (let L = 0; L <= LONG; L++) {
    const t = 1 - L / LONG, a = Math.pow(t, 1.4) * 0.6 * op;
    if (a < 0.04) break;
    const q = pointAtLen(pts, m.lens, m.total, ((u - L * R * 1.1) % m.total + m.total) % m.total);
    if (prev) {
      ctx.globalAlpha = Math.min(1, a);
      ctx.lineWidth = Math.max(0.5, R * 0.8 * (0.3 + 0.7 * t));
      ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }
    prev = q;
  }
  const p = pointAtLen(pts, m.lens, m.total, u);
  dotAt(ctx, p[0], p[1], R, col, op);
}

/* 静态箭头（目标端） */
function drawArrow(ctx, pts, scale, color) {
  const n = pts.length; if (n < 2) return;
  let p0 = pts[n - 2], p1 = pts[n - 1];
  let dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
  const sz = Math.max(5, 7 * scale);
  const tip = [p1[0] - dx * 4, p1[1] - dy * 4];
  const nx = -dy, ny = dx, half = sz * 0.5;
  ctx.fillStyle = color; ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(tip[0], tip[1]);
  ctx.lineTo(tip[0] - dx * sz + nx * half, tip[1] - dy * sz + ny * half);
  ctx.lineTo(tip[0] - dx * sz - nx * half, tip[1] - dy * sz - ny * half);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
}

/* ---------------- 贴边：挖空节点面板，基线视觉在面板下方 ---------------- */
function clipOutNodes(ctx, nodes) {
  let n = 0;
  ctx.beginPath();
  ctx.rect(-1e5, -1e5, 2e5, 2e5);
  for (const node of nodes || []) {
    const r = rectOf(node);
    if (r) { ctx.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); n++; }
  }
  if (!n) return false;
  try { ctx.clip("evenodd"); return true; } catch (e) { return false; }
}

function drawStyled(canvas, ctx, a, b, link, c, scale, dirs) {
  // 总开关：关闭「启用」时不再接管渲染，回退给 ComfyUI 原始画线（特效/高光/样式全部不生效）
  if (!c || !c.enabled) return false;
  const nodes = linkNodes(canvas, link);
  const w = Math.max(1, c.width * scale);
  const geo = getGeo(canvas, link, a, b, c, dirs, w, scale, nodes);
  const pts = geo.pts;
  if (!pts || pts.length < 2) return false;
  const col = linkColor(canvas, link, c);
  const active = isActive(c, link);
  const hl = c.highlight && isChannelSelected(canvas, link);
  const op = Math.max(0.05, Math.min(1, c.opacity || 1));
  const time = performance.now() / 1000;

  // 1) 基线：在挖空 clip 内绘制 → 视觉上位于面板下方/贴边；
  // 仅当连线的任一端点是"已选中的节点"时应用连线高光（加粗 +HL_WIDTH_LIFT、透明度 +HL_ALPHA_LIFT），
  // 只提亮这条通道，不会全图生效
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (c.clipNodes) clipOutNodes(ctx, nodes);

  const baseW = c.style === "under" ? w * 0.9 : w;
  const baseA = op * (c.style === "under" ? 0.55 : 1);
  const strokeW = hl ? (c.width + HL_WIDTH_LIFT) * scale : baseW;
  const strokeA = hl ? Math.min(1, baseA + HL_ALPHA_LIFT) : baseA;
  ctx.strokeStyle = col;
  ctx.globalAlpha = strokeA;
  ctx.lineWidth = strokeW;
  strokePath(ctx, pts);

  if (hl) {
    // 连线高光：一层非常克制的辉光（衬底略加宽 → 主线 → 细白芯），只对"选中节点直连的这条线"生效。
    // 相比旧版刻意做薄做淡：不加额外深晕，辉光宽度与透明度都远低于主线，避免"几层外泛光"感。
    ctx.globalCompositeOperation = "source-over";
    ctx.lineWidth = strokeW + 3 * scale; ctx.globalAlpha = 0.10 * strokeA;
    ctx.strokeStyle = col; strokePath(ctx, pts);
    ctx.lineWidth = strokeW + 1.4 * scale; ctx.globalAlpha = 0.18 * strokeA; strokePath(ctx, pts);
    ctx.lineWidth = strokeW;               ctx.globalAlpha = strokeA;        strokePath(ctx, pts);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(1, strokeW * 0.55); ctx.globalAlpha = 0.32 * strokeA; strokePath(ctx, pts);
  }
  ctx.setLineDash([]);
  ctx.restore();

  // 2) 动效：在 clip 之外绘制，且使用致密化路径 → 折线/贴板等拐角样式同样有均匀特效
  if (active && c.fx && c.fx !== "none") {
    ensureFxGeo(geo);
    const fpts = geo.fpts, mm = geo.mm;   // 致密化路径与长度测量均缓存在几何缓存中，静止帧零重算
    ctx.setLineDash([]);
    switch (c.fx) {
      case "dots": fxDots(ctx, fpts, c, time, col, w, op, mm); break;
      case "spider": fxSpider(ctx, fpts, c, time, col, w, op, mm); break;
      case "arrow": fxArrowRun(ctx, fpts, c, time, col, w, scale, op, mm); break;
      case "rgb": fxRgb(ctx, fpts, c, time, w, op); break;
      case "dash": fxDash(ctx, fpts, c, time, col, w, op); break;
      case "pulse": fxPulse(ctx, fpts, c, time, col, w, scale, op, mm); break;
      case "comet": fxComet(ctx, fpts, c, time, col, w, op, mm); break;
      case "ring": fxRing(ctx, fpts, c, time, col, w, op, mm); break;
      case "meteor": fxMeteor(ctx, fpts, c, time, col, w, op, mm); break;
      case "sweep": fxSweep(ctx, fpts, c, time, col, w, op, mm); break;
      case "ripple": fxRipple(ctx, fpts, c, time, col, w, op, mm); break;
      case "photon": fxPhoton(ctx, fpts, c, time, col, w, op, mm); break;
    }
  }
  if (c.arrow && active) drawArrow(ctx, pts, scale, col);

  if (link && typeof link === "object") {
    try { if (!geo.path) geo.path = ptsToPath2D(pts); link.path = geo.path; } catch (e) {}
  }
  return true;
}

/* ---------------- 渲染接入 ---------------- */
// 自适应识别绘制上下文、link 对象与两个端点，兼容 ComfyUI 各版本 renderLink / renderLinkDirect
// 的参数差异：端点既可能以「两个 2 元素数组」传入，也可能以「一个 [x1,y1,x2,y2] 四元素数组」或
// 「{node,slot,x,y} 连接信息」传入；若仍解不出来，再用 link 的两个端点节点 getConnectionPos 兜底
// 重新计算。找不到时回退到原方法，绝不阻塞本期渲染。
function findCtxArg(t) {
  for (const v of t) if (v && typeof v === "object" && typeof v.beginPath === "function") return v;
  return null;
}
function flattenPts(v) {
  if (!Array.isArray(v)) return null;
  if (v.length >= 4 && typeof v[0] === "number" && typeof v[2] === "number")
    return [[v[0], v[1]], [v[2], v[3]]];
  if (v.length >= 2 && typeof v[0] === "number")
    return [[v[0], v[1]]];
  return null;
}
function resolveRender(t) {
  let link = null;
  const pts = [], cpts = [];
  let quad = null, a = null, b = null;
  for (const v of t) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      const f = flattenPts(v);
      if (f && f.length === 2) quad = f;
      else if (f) pts.push(f[0]);
      continue;
    }
    if (typeof v === "object") {
      if (!link && "origin_id" in v && "target_id" in v) { link = v; continue; }
      if (typeof v.x === "number" && typeof v.y === "number" && ("node" in v || "slot" in v))
        cpts.push([v.x, v.y]);
    }
  }
  if (quad) { a = quad[0]; b = quad[1]; }
  if (!a && pts.length) a = pts[0];
  if (!b && pts.length > 1) b = pts[1];
  if (!a && cpts.length) a = cpts[0];
  if (!b && cpts.length > 1) b = cpts[1];
  return { link, a, b };
}
function normPt(p) { return Array.isArray(p) && p.length >= 2 && typeof p[0] === "number" ? [p[0], p[1]] : null; }
function computeLinkPts(lg, link) {
  const out = { a: null, b: null };
  if (!lg || !lg.graph || !link) return out;
  let A = null, B = null;
  try {
    if (lg.graph.getNodeById) { A = lg.graph.getNodeById(link.origin_id); B = lg.graph.getNodeById(link.target_id); }
  } catch (e) {}
  try { if (A && typeof A.getConnectionPos === "function") out.a = normPt(A.getConnectionPos(false, link.origin_slot)); } catch (e) {}
  try { if (B && typeof B.getConnectionPos === "function") out.b = normPt(B.getConnectionPos(true, link.target_slot)); } catch (e) {}
  return out;
}
function findLinkById(graph, id) {
  if (!graph) return null;
  if (typeof graph.getLinkById === "function") { try { const l = graph.getLinkById(id); if (l) return l; } catch (e) {} }
  if (graph._links) {
    for (const k in graph._links) {
      const l = graph._links[k];
      if (l && (l.id === id || l.id === Number(id))) return l;
    }
  }
  return null;
}
function installPatch() {
  const live = globalThis.LiteGraph && globalThis.LiteGraph.LGraphCanvas
    ? globalThis.LiteGraph.LGraphCanvas
    : (app.canvas && app.canvas.constructor);
  if (!live) return false;
  const proto = live.prototype;
  const names = [];
  if (typeof proto.renderLink === "function") names.push("renderLink");
  if (typeof proto.renderLinkDirect === "function") names.push("renderLinkDirect");
  function lgOf(self) { return (self && self.graph) ? self : (app.canvas || self); }
  function renderStyled(self, ctxArg, link, args) {
    let { a, b } = resolveRender(args);
    if (link && !(a && b)) {
      const r = computeLinkPts(self, link);
      if (!a) a = r.a;
      if (!b) b = r.b;
    }
    if (!ctxArg || !a || !b || !link) return false;
    // 仅当本插件真正画了这条线才视为"已接管"；否则（含"启用"关闭时）交给调用方回退原方法
    return drawStyled(self, ctxArg, a, b, link, cfg, getScale(self), getDirs(args, a, b)) !== false;
  }
  let drawHandled = false;
  if (typeof proto.drawLink === "function" && names.length === 0) {
    // 经典 drawLink(link_id, ctx, x1,y1,x2,y2, ...) 仅在无 render* 时兜底接管，
    // 避免与 render* 同时存在时被重复调用
    const orig = proto.drawLink;
    proto.drawLink = function (link_id, ctx, x1, y1, x2, y2, link_index, skip_border, fillStyle, strokeStyle, lineWidth) {
      try {
        const lg = lgOf(this);
        const link = findLinkById(lg && lg.graph, link_id);
        if (link && typeof ctx.beginPath === "function") {
          const drew = drawStyled(lg, ctx, [x1, y1], [x2, y2], link, cfg, getScale(lg), getDirs([], [x1, y1], [x2, y2]));
          if (drew !== false) return undefined;
        }
      } catch (e) {}
      return orig ? orig.apply(this, arguments) : undefined;
    };
    drawHandled = true;
  }
  if (!names.length) return drawHandled;
  names.forEach(function (nm) {
    const orig = proto[nm];
    proto[nm] = function () {
      const args = Array.prototype.slice.call(arguments);
      try {
        const lg = lgOf(this);
        const ctxArg = findCtxArg(args);
        const { link } = resolveRender(args);
        if (!ctxArg || !link) return orig ? orig.apply(this, args) : undefined;
        if (renderStyled(lg, ctxArg, link, args)) return undefined;
        return orig ? orig.apply(this, args) : undefined;
      } catch (e) {
        return orig ? orig.apply(this, args) : undefined;
      }
    };
  });
  return true;
}

/* ---------------- 动画循环（不依赖鼠标移动） ---------------- */
let rafStarted = false;
function ensureAnim() {
  if (rafStarted) return;
  rafStarted = true;
  // GPU 友好：时间节流的强制重绘。动效用绝对相位(performance.now)，仅受采样帧率影响，
  // 降到 ~22fps 依旧平滑，却省掉满帧时冗余的整图重光栅（这是开启插件后 GPU 高出 10-20% 的主因）。
  let lastFxDraw = 0;
  const tick = (now) => {
    requestAnimationFrame(tick);
    const c = app.canvas;
    if (!c || !cfg.enabled || !cfg.fx || cfg.fx === "none" || now - lastFxDraw < 45) return;
    // 没有连线就不必强行重绘，空图/纯节点图零额外开销
    const g = c.graph;
    if (!g || !g._links || !Object.keys(g._links).length) return;
    lastFxDraw = now;
    try {
      // 仅强制重绘"前台画布"(节点/连线/特效所在层)，跳过背景网格 → 减少 GPU 重光栅
      if (typeof c.draw === "function") c.draw(false, true);
      else if (typeof c.setDirtyCanvas === "function") c.setDirtyCanvas(false, true);
    } catch (e) {}
  };
  requestAnimationFrame(tick);
}

/* ---------------- 精简侧边设置面板 ---------------- */
let panel = null, btn = null;
function buildPanel() {
  if (panel) return panel;
  panel = document.createElement("div");
  panel.id = "comfyui-linklite-panel";
  panel.style.cssText =
    "position:fixed;top:52px;right:12px;width:244px;z-index:2000;background:#1a1a1f;color:#e8e8ec;" +
    "border:1px solid #3a3a44;border-radius:8px;padding:12px 14px;font:12px/1.4 system-ui,sans-serif;" +
    "box-shadow:0 8px 30px rgba(0,0,0,.5);display:none;";
  document.body.appendChild(panel);
  return panel;
}
function togglePanel() {
  buildPanel();
  const vis = panel.style.display === "block";
  panel.style.display = vis ? "none" : "block";
  if (!vis) renderPanel();
}
function row(label, controlHtml) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;margin:6px 0;gap:8px">
    <span style="opacity:.85;flex:0 0 auto">${label}</span>${controlHtml}</div>`;
}
function selHtml(opts, cur, id) {
  const o = opts.map(([v, lab]) => `<option value="${v}" ${String(cur) === String(v) ? "selected" : ""}>${lab}</option>`).join("");
  return `<select id="${id || ""}" style="width:126px;background:#23232b;color:#e8e8ec;border:1px solid #3a3a44;border-radius:4px;padding:2px 4px">${o}</select>`;
}
function renderPanel() {
  const t = tr();
  const P = (h) => panel.innerHTML = h;
  const stOpts = [
    ["curve", t.st_curve], ["straight", t.st_straight], ["linear", t.st_linear],
    ["board", t.st_board], ["wave", t.st_wave], ["under", t.st_under],
    ["elastic", t.st_elastic], ["ortho", t.st_ortho],
  ];
  const fxOpts = [
    ["none", t.fx_none], ["spider", t.fx_spider], ["dots", t.fx_dots], ["arrow", t.fx_arrow],
    ["rgb", t.fx_rgb], ["dash", t.fx_dash], ["pulse", t.fx_pulse], ["comet", t.fx_comet],
    ["ring", t.fx_ring], ["meteor", t.fx_meteor], ["sweep", t.fx_sweep],
    ["ripple", t.fx_ripple], ["photon", t.fx_photon],
  ];
  const clOpts = [["auto", t.cl_auto], ["fixed", t.cl_fixed]];
  P(`
    <div style="display:flex;align-items:center;justify-content:space-between">
      <b>${t.title}</b>
      <span>
        <button id="lt-reset" style="background:none;border:none;color:#7aa6ff;cursor:pointer;font-size:11px">${t.reset}</button>
        <button id="lt-hide" style="background:none;border:none;color:#888;cursor:pointer;font-size:11px" title="×">×</button>
      </span>
    </div>
    ${row(t.on, `<input id="lt-sel-on" type="checkbox" ${cfg.enabled ? "checked" : ""}>`)}
    ${row(t.style, selHtml(stOpts, cfg.style, "lt-sel-style"))}
    ${row(t.fx, selHtml(fxOpts, cfg.fx, "lt-sel-fx"))}
    ${row(t.highlight, `<input id="lt-sel-hl" type="checkbox" ${cfg.highlight ? "checked" : ""}>`)}
    ${row(t.arrow, `<input id="lt-sel-arrow" type="checkbox" ${cfg.arrow ? "checked" : ""}>`)}
    ${row(t.color, selHtml(clOpts, cfg.colorMode, "lt-sel-mode"))}
    <div id="lt-color-row" style="display:${cfg.colorMode === "fixed" ? "flex" : "none"};align-items:center;justify-content:flex-end;margin:4px 0">
      <input id="lt-color" type="color" value="${cfg.color}" style="padding:0;border:none;border-radius:4px;background:none;height:22px;width:44px">
    </div>
    ${row(t.flowSpeed, `<input id="lt-range-speed" type="range" min="0.1" max="3" step="0.1" value="${cfg.flowSpeed}" style="width:126px">`)}
    ${row(t.width, `<input id="lt-range-w" type="range" min="1" max="5" step="0.2" value="${cfg.width}" style="width:126px">`)}
    ${row(t.opacity, `<input id="lt-range-op" type="range" min="0.1" max="1" step="0.05" value="${cfg.opacity}" style="width:126px">`)}
    ${row(t.lang, `<select id="lt-sel-lang"><option value="auto" ${cfg.lang === "auto" ? "selected" : ""}>${t.auto}</option><option value="zh" ${cfg.lang === "zh" ? "selected" : ""}>${t.zh_l}</option><option value="en" ${cfg.lang === "en" ? "selected" : ""}>${t.en_l}</option></select>`)}
  `);
  const $ = (id) => panel.querySelector(id);
  $("#lt-sel-on").onchange = (e) => setCfg({ enabled: e.target.checked });
  $("#lt-sel-style").onchange = (e) => setCfg({ style: e.target.value });
  $("#lt-sel-fx").onchange = (e) => setCfg({ fx: e.target.value });
  $("#lt-sel-hl").onchange = (e) => setCfg({ highlight: e.target.checked });
  $("#lt-sel-arrow").onchange = (e) => setCfg({ arrow: e.target.checked }, true);
  $("#lt-sel-mode").onchange = (e) => { setCfg({ colorMode: e.target.value }); $("#lt-color-row").style.display = e.target.value === "fixed" ? "flex" : "none"; };
  $("#lt-color").oninput = (e) => setCfg({ color: e.target.value });
  $("#lt-range-speed").oninput = (e) => setCfg({ flowSpeed: parseFloat(e.target.value) }, false);
  $("#lt-range-w").oninput = (e) => setCfg({ width: parseFloat(e.target.value) }, false);
  $("#lt-range-op").oninput = (e) => setCfg({ opacity: parseFloat(e.target.value) }, false);
  $("#lt-sel-lang").onchange = (e) => { setCfg({ lang: e.target.value }); if (typeof showButton === "function") showButton(); renderPanel(); };
  $("#lt-reset").onclick = () => { cfg = Object.assign({}, DEFAULTS); lang = resolveLang(); save(); renderPanel(); if (app.canvas) app.canvas.setDirtyCanvas(true, true); };
  $("#lt-hide").onclick = () => { panel.style.display = "none"; };
}
function ensureButton() {
  if (btn) return;
  btn = document.createElement("button");
  btn.id = "comfyui-linklite-btn";
  btn.textContent = "⚡";
  btn.title = "LinkLite 连线美化";
  btn.style.cssText =
    "position:fixed;top:52px;right:258px;z-index:2000;width:30px;height:26px;border:1px solid #3a3a44;" +
    "border-radius:6px;background:#1a1a1f;color:#7aa6ff;cursor:pointer;display:none;";
  btn.onclick = togglePanel;
  document.body.appendChild(btn);
  btn.style.display = "block";
}
function showBadge() {
  try {
    const b = document.createElement("div");
    b.textContent = "LinkLite V0.1 ✓";
    b.style.cssText =
      "position:fixed;top:46px;right:300px;z-index:2001;background:#1f2c45;color:#9cc0ff;" +
      "border:1px solid #3a5a8a;border-radius:6px;padding:5px 10px;font:11px system-ui;box-shadow:0 4px 14px rgba(0,0,0,.4);";
    document.body.appendChild(b);
    setTimeout(() => { b.style.opacity = "0"; b.style.transition = "opacity .6s"; setTimeout(() => b.remove(), 700); }, 4500);
  } catch (e) {}
}
function showButton() { ensureButton(); btn.title = tr().title + "  V0.1"; }

/* ---------------- 注册 ---------------- */
app.registerExtension({
  name: "ComfyUI.LinkLite",
  async setup() {
    const patched = installPatch();
    if (patched) {
      console.info("%c[LinkLite V0.1] %c已加载 / loaded (%c渲染管线已接入 + 几何缓存 + 低GPU重绘)",
        "color:#7aa6ff", "color:#888", "color:#7cf0a0");
    } else {
      console.warn("[LinkLite V0.1] 未能接入渲染管线（renderLink / renderLinkDirect / drawLink 均不存在），本次未启用（不影响其他功能）");
    }
    ensureAnim();
    showButton();
    showBadge();
  },
});