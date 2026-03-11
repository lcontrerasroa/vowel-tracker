import { useState, useEffect, useRef, useCallback } from "react";

// ─── Vowel reference data (F1, F2, F3 in Hz) ───
const VOWEL_REFS = [
  { ipa: "i", f1: 280, f2: 2250, f3: 3050, lang: "fr", desc: "fermée antérieure non arrondie" },
  { ipa: "y", f1: 280, f2: 1900, f3: 2200, lang: "fr", desc: "fermée antérieure arrondie" },
  { ipa: "e", f1: 370, f2: 2100, f3: 2900, lang: "fr", desc: "mi-fermée antérieure non arrondie" },
  { ipa: "ø", f1: 370, f2: 1700, f3: 2350, lang: "fr", desc: "mi-fermée antérieure arrondie" },
  { ipa: "ɛ", f1: 530, f2: 1850, f3: 2750, lang: "fr", desc: "mi-ouverte antérieure non arrondie" },
  { ipa: "œ", f1: 530, f2: 1550, f3: 2450, lang: "fr", desc: "mi-ouverte antérieure arrondie" },
  { ipa: "a", f1: 750, f2: 1400, f3: 2600, lang: "fr", desc: "ouverte antérieure non arrondie" },
  { ipa: "ɑ", f1: 750, f2: 1100, f3: 2500, lang: "fr", desc: "ouverte postérieure non arrondie" },
  { ipa: "ɔ", f1: 500, f2: 900, f3: 2550, lang: "fr", desc: "mi-ouverte postérieure arrondie" },
  { ipa: "o", f1: 380, f2: 850, f3: 2550, lang: "fr", desc: "mi-fermée postérieure arrondie" },
  { ipa: "u", f1: 310, f2: 750, f3: 2300, lang: "fr", desc: "fermée postérieure arrondie" },
  { ipa: "ə", f1: 500, f2: 1400, f3: 2550, lang: "fr", desc: "moyenne centrale" },
  { ipa: "iː", f1: 270, f2: 2290, f3: 3010, lang: "en", desc: "close front unrounded" },
  { ipa: "ɪ", f1: 390, f2: 1990, f3: 2550, lang: "en", desc: "near-close near-front unrounded" },
  { ipa: "eɪ", f1: 380, f2: 2080, f3: 2800, lang: "en", desc: "close-mid front (diphthong onset)" },
  { ipa: "ɛ", f1: 530, f2: 1840, f3: 2680, lang: "en", desc: "open-mid front unrounded" },
  { ipa: "æ", f1: 660, f2: 1720, f3: 2530, lang: "en", desc: "near-open front unrounded" },
  { ipa: "ɑː", f1: 730, f2: 1090, f3: 2540, lang: "en", desc: "open back unrounded" },
  { ipa: "ɔː", f1: 570, f2: 840, f3: 2540, lang: "en", desc: "open-mid back rounded" },
  { ipa: "oʊ", f1: 380, f2: 940, f3: 2500, lang: "en", desc: "close-mid back (diphthong onset)" },
  { ipa: "ʊ", f1: 440, f2: 1020, f3: 2360, lang: "en", desc: "near-close near-back rounded" },
  { ipa: "uː", f1: 300, f2: 870, f3: 2240, lang: "en", desc: "close back rounded" },
  { ipa: "ʌ", f1: 640, f2: 1190, f3: 2550, lang: "en", desc: "open-mid back unrounded" },
  { ipa: "ɝ", f1: 470, f2: 1380, f3: 1650, lang: "en", desc: "rhotacized mid central" },
  { ipa: "ə", f1: 500, f2: 1400, f3: 2550, lang: "en", desc: "mid central (schwa)" },
];

// ─── Voice presets ───
const VOICE_PRESETS = {
  none:  { label: "Neutre",       f1Scale: 1.0,  f2Scale: 1.0,  icon: "—" },
  grave: { label: "Voix grave",   f1Scale: 0.85, f2Scale: 0.88, icon: "🔈" },
  aigu:  { label: "Voix aiguë",   f1Scale: 1.17, f2Scale: 1.14, icon: "🔊" },
};
function getScaledVowels(refs, preset) {
  const p = VOICE_PRESETS[preset];
  if (!p || preset === "none") return refs;
  return refs.map(v => ({ ...v, f1: Math.round(v.f1 * p.f1Scale), f2: Math.round(v.f2 * p.f2Scale), f3: Math.round(v.f3 * (p.f2Scale * 0.95 + 0.05)) }));
}

// ─── DSP ───
function hammingWindow(n) { const w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1)); return w; }
function preEmphasis(s, c = 0.97) { const o = new Float64Array(s.length); o[0] = s[0]; for (let i = 1; i < s.length; i++) o[i] = s[i] - c * s[i - 1]; return o; }
function autoCorr(x, order) { const r = new Float64Array(order + 1); for (let i = 0; i <= order; i++) for (let j = 0; j < x.length - i; j++) r[i] += x[j] * x[j + i]; return r; }
function levinson(r, order) {
  const a = new Float64Array(order + 1), t = new Float64Array(order + 1); let e = r[0]; if (e === 0) return { c: a, e: 0 };
  for (let i = 1; i <= order; i++) { let l = 0; for (let j = 1; j < i; j++) l += a[j] * r[i - j]; l = (r[i] - l) / e; t.set(a); a[i] = l; for (let j = 1; j < i; j++) a[j] = t[j] - l * t[i - j]; e *= 1 - l * l; if (e <= 0) break; } return { c: a, e };
}
function findRoots(co, maxIt = 100) {
  const n = co.length - 1; if (n <= 0) return [];
  const roots = []; for (let i = 0; i < n; i++) { const ang = (2 * Math.PI * i) / n + 0.1, r = 0.9 + 0.1 * Math.random(); roots.push({ re: r * Math.cos(ang), im: r * Math.sin(ang) }); }
  for (let it = 0; it < maxIt; it++) { let mx = 0; for (let i = 0; i < n; i++) { let pr = co[0], pi = 0, zr = 1, zi = 0; for (let j = 1; j <= n; j++) { const nr = zr * roots[i].re - zi * roots[i].im, ni = zr * roots[i].im + zi * roots[i].re; zr = nr; zi = ni; pr += co[j] * zr; pi += co[j] * zi; } let dr = 1, di = 0; for (let j = 0; j < n; j++) { if (j === i) continue; const a = roots[i].re - roots[j].re, b = roots[i].im - roots[j].im; const nr = dr * a - di * b, ni = dr * b + di * a; dr = nr; di = ni; } const dm = dr * dr + di * di; if (dm < 1e-30) continue; const qr = (pr * dr + pi * di) / dm, qi = (pi * dr - pr * di) / dm; roots[i].re -= qr; roots[i].im -= qi; mx = Math.max(mx, Math.sqrt(qr * qr + qi * qi)); } if (mx < 1e-10) break; } return roots;
}
function extractFormants(signal, sr) {
  const pe = preEmphasis(signal), win = hammingWindow(signal.length);
  const w = new Float64Array(signal.length); for (let i = 0; i < signal.length; i++) w[i] = pe[i] * win[i];
  const order = Math.min(Math.max(Math.floor(sr / 1000) + 6, 12), 20);
  const r = autoCorr(w, order); if (r[0] === 0) return [];
  const { c } = levinson(r, order);
  const poly = new Float64Array(order + 1); poly[0] = 1; for (let i = 1; i <= order; i++) poly[i] = -c[i];
  const roots = findRoots(Array.from(poly)); const fmt = [];
  for (const rt of roots) { if (rt.im < 0) continue; const mag = Math.sqrt(rt.re * rt.re + rt.im * rt.im); if (mag < 0.55 || mag > 1.0) continue; const freq = (Math.atan2(rt.im, rt.re) * sr) / (2 * Math.PI); const bw = (-sr / (2 * Math.PI)) * Math.log(mag); if (freq > 90 && freq < 5500 && bw < 700) fmt.push({ freq, bw }); }
  fmt.sort((a, b) => a.freq - b.freq); return fmt;
}
function computeZCR(signal) { let zc = 0; for (let i = 1; i < signal.length; i++) { if ((signal[i] >= 0) !== (signal[i - 1] >= 0)) zc++; } return zc / signal.length; }

function predictVowel(f1, f2, f3, bw1, bw2, vowels) {
  let min = Infinity, best = null;
  const n1 = f1 / 800, n2 = f2 / 2500, n3 = (f3 || 2500) / 3500;
  const bwQuality = Math.max(0, 1 - ((bw1 || 200) + (bw2 || 200)) / 800);
  for (const v of vowels) {
    const d = Math.sqrt(((v.f1 / 800 - n1) * 1.3) ** 2 + ((v.f2 / 2500 - n2) * 1.0) ** 2 + (((v.f3 || 2500) / 3500 - n3) * 0.5) ** 2);
    if (d < min) { min = d; best = v; }
  }
  const rawConf = Math.max(0, 1 - min * 2.5);
  return { vowel: best, distance: min, confidence: rawConf * (0.5 + 0.5 * bwQuality) };
}

// ─── Convex hull (Graham scan) ───
function convexHull(points) {
  if (points.length < 3) return points;
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = []; for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper = []; for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  lower.pop(); upper.pop(); return lower.concat(upper);
}

// ─── Chart ───
const CH = { pL: 70, pR: 40, pT: 50, pB: 50, f2a: 600, f2b: 2600, f1a: 200, f1b: 900 };
function f2Xd(f2, w, b) { return b.pL + (w - b.pL - b.pR) * (1 - (f2 - b.f2a) / (b.f2b - b.f2a)); }
function f1Yd(f1, h, b) { return b.pT + (h - b.pT - b.pB) * ((f1 - b.f1a) / (b.f1b - b.f1a)); }
function getChartBounds(preset) {
  if (preset === "grave") return { ...CH, f2b: 2300, f1b: 800 };
  if (preset === "aigu") return { ...CH, f2b: 3000, f1b: 1050 };
  return CH;
}

// ─── Lobanov ───
function computeCalibration(samples) {
  if (samples.length < 3) return null;
  const f1s = samples.map(s => s.f1), f2s = samples.map(s => s.f2);
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const std = (a, m) => Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
  const f1m = mean(f1s), f2m = mean(f2s), f1d = std(f1s, f1m), f2d = std(f2s, f2m);
  if (f1d < 1 || f2d < 1) return null;
  return { f1m, f1d, f2m, f2d, cf1m: 480, cf1d: 170, cf2m: 1450, cf2d: 520 };
}
function applyCal(f1, f2, cal) { if (!cal) return { f1, f2 }; return { f1: cal.cf1m + ((f1 - cal.f1m) / cal.f1d) * cal.cf1d, f2: cal.cf2m + ((f2 - cal.f2m) / cal.f2d) * cal.cf2d }; }
const CALIB_STEPS = [
  { ipa: "i", prompt: "Dites « si » ou « see »", desc: "/i/ — fermée antérieure" },
  { ipa: "a", prompt: "Dites « sa » ou « spa »", desc: "/a/ — ouverte" },
  { ipa: "u", prompt: "Dites « sou » ou « sue »", desc: "/u/ — fermée postérieure" },
];

// ─── Pill style helper ───
const pill = (active, color = "rgba(100,100,120,0.3)") => ({
  padding: "5px 14px", borderRadius: "8px", cursor: "pointer", fontFamily: "'DM Sans'", fontSize: "12px", fontWeight: 600,
  border: `1px solid ${active ? color : "rgba(0,0,0,0.08)"}`, transition: "all 0.15s ease",
  background: active ? color.replace(/[\d.]+\)$/, "0.12)") : "transparent",
  color: active ? "#1a1a2e" : "rgba(60,60,80,0.55)",
});

// ═══════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════
export default function VowelTracker() {
  const [isRunning, setIsRunning] = useState(false);
  const [currentF1, setCurrentF1] = useState(null);
  const [currentF2, setCurrentF2] = useState(null);
  const [rawF1, setRawF1] = useState(null);
  const [rawF2, setRawF2] = useState(null);
  const [rawF3, setRawF3] = useState(null);
  const [rawBw1, setRawBw1] = useState(null);
  const [rawBw2, setRawBw2] = useState(null);
  const [predicted, setPredicted] = useState(null);
  const [conf, setConf] = useState(0);
  const [error, setError] = useState(null);
  const [trail, setTrail] = useState([]);
  const [rms, setRms] = useState(0);
  const [langFilter, setLangFilter] = useState("both");
  const [hullShow, setHullShow] = useState("both");
  const [normMode, setNormMode] = useState("none");
  const [voicePreset, setVoicePreset] = useState("none");
  const [cal, setCal] = useState(null);
  const [calibrating, setCalibrating] = useState(false);
  const [cStep, setCStep] = useState(0);
  const [cSamples, setCSamples] = useState([]);
  const [cCollecting, setCCollecting] = useState(false);
  const cBuf = useRef({ collecting: false, samples: [] });
  const cStepRef = useRef(0); // ← FIX: ref to avoid stale closure in calibration

  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const latestBuf = useRef(null);
  const processorRef = useRef(null);
  const sF1 = useRef(0), sF2 = useRef(0), sF3 = useRef(0);
  const stabilityCount = useRef(0);
  const lastPredIpa = useRef("");
  const silenceFrames = useRef(0); // ← FIX: track silence to reset prediction

  const [audioDebug, setAudioDebug] = useState("");

  const W = 720, H = 540;
  const langVowels = VOWEL_REFS.filter(v => langFilter === "both" || v.lang === langFilter);
  const activeV = normMode === "preset" ? getScaledVowels(langVowels, voicePreset) : langVowels;
  const bounds = normMode === "preset" ? getChartBounds(voicePreset) : CH;

  // Keep cStepRef in sync
  useEffect(() => { cStepRef.current = cStep; }, [cStep]);

  // ─── Drawing (LIGHT THEME) ───
  const draw = useCallback((f1, f2, pred, co, tr, rm, vows, cl, bd, hull) => {
    const cv = canvasRef.current; if (!cv) return;
    const c = cv.getContext("2d"), dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Light background
    c.fillStyle = "#f8f9fc"; c.fillRect(0, 0, W, H);

    const xOf = (f2v) => f2Xd(f2v, W, bd);
    const yOf = (f1v) => f1Yd(f1v, H, bd);

    // Grid
    c.strokeStyle = "rgba(0,0,50,0.06)"; c.lineWidth = 1;
    for (let v = Math.ceil(bd.f2a / 200) * 200; v <= bd.f2b; v += 200) { const x = xOf(v); c.beginPath(); c.moveTo(x, bd.pT); c.lineTo(x, H - bd.pB); c.stroke(); }
    for (let v = Math.ceil(bd.f1a / 100) * 100; v <= bd.f1b; v += 100) { const y = yOf(v); c.beginPath(); c.moveTo(bd.pL, y); c.lineTo(W - bd.pR, y); c.stroke(); }

    // Axes
    c.strokeStyle = "rgba(0,0,50,0.2)"; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(bd.pL, bd.pT); c.lineTo(bd.pL, H - bd.pB); c.lineTo(W - bd.pR, H - bd.pB); c.stroke();

    c.fillStyle = "rgba(40,40,80,0.55)"; c.font = "600 11px 'DM Sans', sans-serif"; c.textAlign = "center";
    c.fillText("← F2 (Hz)  ANTÉRIEUR / FRONT                                      POSTÉRIEUR / BACK →", W / 2, H - 10);
    c.save(); c.translate(16, H / 2); c.rotate(-Math.PI / 2);
    c.fillText("← CLOSE / FERMÉ           F1 (Hz)           OPEN / OUVERT →", 0, 0); c.restore();

    c.font = "10px 'DM Mono', monospace"; c.fillStyle = "rgba(40,40,80,0.35)"; c.textAlign = "center";
    for (let v = Math.ceil(bd.f2a / 400) * 400; v <= bd.f2b; v += 400) c.fillText(v, xOf(v), H - bd.pB + 16);
    c.textAlign = "right";
    for (let v = Math.ceil(bd.f1a / 100) * 100; v <= bd.f1b; v += 100) c.fillText(v, bd.pL - 8, yOf(v) + 4);

    // Convex hulls
    const drawLangHull = (lang, stroke, fill) => {
      const pts = vows.filter(v => v.lang === lang).map(v => ({ x: xOf(v.f2), y: yOf(v.f1) }));
      const hp = convexHull(pts); if (hp.length < 3) return;
      c.beginPath(); c.strokeStyle = stroke; c.fillStyle = fill; c.lineWidth = 1.5;
      hp.forEach((p, i) => { i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y); });
      c.closePath(); c.fill(); c.stroke();
    };
    if (hull === "fr" || hull === "both") drawLangHull("fr", "rgba(30,100,220,0.3)", "rgba(30,100,220,0.06)");
    if (hull === "en" || hull === "both") drawLangHull("en", "rgba(130,60,200,0.3)", "rgba(130,60,200,0.06)");

    // Reference vowels
    vows.forEach(v => {
      const showLang = hull === "both" || hull === v.lang;
      if (!showLang) return;
      const x = xOf(v.f2), y = yOf(v.f1);
      const hit = pred && v.ipa === pred.ipa && v.lang === pred.lang;
      if (!hit) { c.font = "8px 'DM Mono', monospace"; c.fillStyle = v.lang === "fr" ? "rgba(30,100,220,0.25)" : "rgba(130,60,200,0.25)"; c.textAlign = "center"; c.fillText(v.lang.toUpperCase(), x, y + 16); }
      c.fillStyle = hit ? (v.lang === "fr" ? "rgba(20,80,200,0.95)" : "rgba(120,40,200,0.95)") : (v.lang === "fr" ? "rgba(30,100,220,0.55)" : "rgba(130,60,200,0.55)");
      c.font = hit ? "bold 22px 'Noto Sans', sans-serif" : "16px 'Noto Sans', sans-serif";
      c.textAlign = "center"; c.fillText(v.ipa, x, y + 5);
    });

    // Trail
    if (tr.length > 1) {
      c.beginPath(); c.strokeStyle = "rgba(220,60,40,0.2)"; c.lineWidth = 1.5;
      tr.forEach((p, i) => { i === 0 ? c.moveTo(xOf(p.f2), yOf(p.f1)) : c.lineTo(xOf(p.f2), yOf(p.f1)); }); c.stroke();
      tr.forEach((p, i) => { c.beginPath(); c.arc(xOf(p.f2), yOf(p.f1), 2, 0, Math.PI * 2); c.fillStyle = `rgba(220,60,40,${0.1 + 0.6 * i / tr.length})`; c.fill(); });
    }

    // Live point
    if (f1 !== null && f2 !== null && rm > 0.005) {
      const x = xOf(f2), y = yOf(f1);
      const g = c.createRadialGradient(x, y, 0, x, y, 28);
      g.addColorStop(0, "rgba(220,50,30,0.35)"); g.addColorStop(1, "rgba(220,50,30,0)");
      c.fillStyle = g; c.fillRect(x - 28, y - 28, 56, 56);
      c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fillStyle = "#d03020"; c.fill();
      c.strokeStyle = "#fff"; c.lineWidth = 2; c.stroke();
    }

    // Level meter
    const mx = W - 18, mh = H - bd.pT - bd.pB, my = bd.pT;
    c.fillStyle = "rgba(0,0,0,0.03)"; c.fillRect(mx, my, 8, mh);
    const lv = Math.min(1, rm * 8);
    const lg = c.createLinearGradient(0, my + mh, 0, my);
    lg.addColorStop(0, "#b0c4e0"); lg.addColorStop(0.6, "#3070cc"); lg.addColorStop(1, "#d03020");
    c.fillStyle = lg; c.fillRect(mx, my + mh * (1 - lv), 8, mh * lv);

    // Cal badge
    if (cl) {
      c.fillStyle = "rgba(20,160,80,0.08)"; c.strokeStyle = "rgba(20,160,80,0.35)"; c.lineWidth = 1;
      c.beginPath(); c.roundRect(bd.pL + 6, bd.pT + 6, 100, 20, 4); c.fill(); c.stroke();
      c.fillStyle = "rgba(20,140,70,0.8)"; c.font = "600 9px 'DM Sans', sans-serif"; c.textAlign = "left";
      c.fillText("✓ LOBANOV", bd.pL + 12, bd.pT + 20);
    }
  }, [W, H]);

  // ─── Audio ───
  const startAudio = useCallback(async () => {
    try {
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
      catch { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      streamRef.current = stream;
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      await ac.resume();
      audioCtxRef.current = ac;
      const src = ac.createMediaStreamSource(stream);
      const bufSize = ac.sampleRate > 20000 ? 4096 : 2048;
      const processor = ac.createScriptProcessor(bufSize, 1, 1);
      processorRef.current = processor;
      src.connect(processor); processor.connect(ac.destination);

      const targetSR = 16000;
      const downsample = (input, srcRate) => {
        if (srcRate <= targetSR * 1.1) return { signal: input, rate: srcRate };
        const ratio = Math.floor(srcRate / targetSR); const outLen = Math.floor(input.length / ratio);
        const out = new Float32Array(outLen); for (let i = 0; i < outLen; i++) out[i] = input[i * ratio];
        return { signal: out, rate: srcRate / ratio };
      };

      let frameCount = 0;
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length); copy.set(input);
        latestBuf.current = copy;
        let rv = 0; for (let i = 0; i < copy.length; i++) rv += copy[i] * copy[i];
        rv = Math.sqrt(rv / copy.length); setRms(rv);

        frameCount++;
        if (frameCount % 12 === 0) {
          setAudioDebug(`SR: ${ac.sampleRate} | RMS: ${rv.toFixed(4)}`);
        }

        if (rv > 0.005) {
          silenceFrames.current = 0;
          const { signal, rate } = downsample(copy, ac.sampleRate);
          const zcr = computeZCR(signal);
          if (zcr > 0.15) return;
          const fmt = extractFormants(signal, rate);
          if (fmt.length >= 2) {
            const f1r = fmt[0].freq, f2r = fmt[1].freq;
            const f3r = fmt.length >= 3 ? fmt[2].freq : null;
            const bw1 = fmt[0].bw, bw2 = fmt[1].bw;
            if (f1r > 150 && f1r < 1000 && f2r > 500 && f2r < 3000 && f2r > f1r && bw1 < 500) {
              const a = 0.35;
              sF1.current = sF1.current === 0 ? f1r : sF1.current * (1 - a) + f1r * a;
              sF2.current = sF2.current === 0 ? f2r : sF2.current * (1 - a) + f2r * a;
              if (f3r && f3r > f2r && f3r < 5000) sF3.current = sF3.current === 0 ? f3r : sF3.current * (1 - a) + f3r * a;
              setRawF1(Math.round(sF1.current)); setRawF2(Math.round(sF2.current));
              setRawF3(sF3.current > 0 ? Math.round(sF3.current) : null);
              setRawBw1(Math.round(bw1)); setRawBw2(Math.round(bw2));
              if (cBuf.current.collecting) cBuf.current.samples.push({ f1: sF1.current, f2: sF2.current });
            }
          }
        } else {
          // FIX: Reset prediction after ~0.3s of silence
          silenceFrames.current++;
          if (silenceFrames.current > 4) {
            sF1.current = 0; sF2.current = 0; sF3.current = 0;
            stabilityCount.current = 0; lastPredIpa.current = "";
          }
        }
      };
      setAudioDebug(`SR: ${ac.sampleRate} Hz | Buf: ${bufSize} | Démarrage…`);
      setIsRunning(true); setError(null);
    } catch (e) { setError("Erreur micro : " + e.message); }
  }, []);

  const stopAudio = useCallback(() => {
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioCtxRef.current) audioCtxRef.current.close();
    setIsRunning(false); sF1.current = 0; sF2.current = 0; sF3.current = 0;
    stabilityCount.current = 0; lastPredIpa.current = ""; silenceFrames.current = 0;
    setAudioDebug(""); latestBuf.current = null;
  }, []);

  // ─── Process formants ───
  useEffect(() => {
    if (rawF1 === null || rawF2 === null) return;
    const { f1, f2 } = normMode === "lobanov" ? applyCal(rawF1, rawF2, cal) : { f1: rawF1, f2: rawF2 };
    const rf1 = Math.round(f1), rf2 = Math.round(f2);
    setCurrentF1(rf1); setCurrentF2(rf2);
    const p = predictVowel(f1, f2, rawF3, rawBw1, rawBw2, activeV);
    if (p.vowel) {
      const newIpa = p.vowel.ipa + p.vowel.lang;
      if (newIpa === lastPredIpa.current) { stabilityCount.current++; }
      else { stabilityCount.current = 1; lastPredIpa.current = newIpa; }
      if (stabilityCount.current >= 2) { setPredicted(p.vowel); setConf(p.confidence); }
    }
    if (rms > 0.005) setTrail(prev => [...prev, { f1: rf1, f2: rf2, t: Date.now() }].slice(-60));
  }, [rawF1, rawF2, rawF3, rawBw1, rawBw2, cal, normMode, rms, activeV]);

  // Redraw
  useEffect(() => { draw(currentF1, currentF2, predicted, conf, trail, rms, activeV, normMode === "lobanov" && cal, bounds, hullShow); }, [currentF1, currentF2, predicted, conf, trail, rms, draw, activeV, cal, normMode, bounds, hullShow]);
  useEffect(() => { draw(null, null, null, 0, [], 0, activeV, normMode === "lobanov" && cal, bounds, hullShow); return () => { if (animRef.current) cancelAnimationFrame(animRef.current); }; }, [draw, activeV, cal, normMode, bounds, hullShow]);

  // ─── Calibration ───
  const startCalib = () => {
    if (!isRunning) return;
    setNormMode("lobanov"); setVoicePreset("none");
    setCalibrating(true); setCStep(0); cStepRef.current = 0; setCSamples([]); setCCollecting(false); setCal(null);
  };
  const collectSample = () => {
    cBuf.current = { collecting: true, samples: [] }; setCCollecting(true);
    setTimeout(() => {
      cBuf.current.collecting = false; const b = cBuf.current.samples; setCCollecting(false);
      if (b.length >= 5) {
        const s1 = b.map(s => s.f1).sort((a, b) => a - b), s2 = b.map(s => s.f2).sort((a, b) => a - b);
        const m = Math.floor(b.length / 2), sample = { f1: s1[m], f2: s2[m] };
        const currentStep = cStepRef.current; // ← FIX: use ref, not stale state
        setCSamples(prev => {
          const next = [...prev, sample];
          if (currentStep < CALIB_STEPS.length - 1) {
            const newStep = currentStep + 1;
            setCStep(newStep);
            cStepRef.current = newStep;
          } else {
            setCal(computeCalibration(next)); setCalibrating(false);
          }
          return next;
        });
      }
    }, 2000);
  };
  const setPresetMode = (p) => { setVoicePreset(p); setNormMode(p === "none" ? "none" : "preset"); setCal(null); setCalibrating(false); setTrail([]); };

  const langLbl = { fr: "Français", en: "English", both: "FR + EN" };

  // ═══════════════════════════════════════
  // RENDER (LIGHT THEME)
  // ═══════════════════════════════════════
  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#f0f2f7", color: "#1a1a2e", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.5px", color: "#1a1a2e", margin: "0 0 4px 0" }}>Espace vocalique F1–F2</h1>
      <p style={{ fontSize: "13px", color: "rgba(40,40,80,0.5)", margin: "0 0 18px 0", fontWeight: 500 }}>Analyse formantique en temps réel · Real-time formant tracking</p>

      {/* Settings */}
      <div style={{ display: "flex", gap: "28px", marginBottom: "16px", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start" }}>
        {/* Language */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", fontWeight: 600, color: "rgba(40,40,80,0.4)", textTransform: "uppercase", letterSpacing: "1.5px" }}>Langue</span>
          <div style={{ display: "flex", gap: "4px" }}>
            {["fr", "en", "both"].map(l => (<button key={l} onClick={() => { setLangFilter(l); setTrail([]); }} style={pill(langFilter === l, l === "fr" ? "rgba(30,100,220,0.5)" : l === "en" ? "rgba(130,60,200,0.5)" : "rgba(100,100,120,0.3)")}>{langLbl[l]}</button>))}
          </div>
        </div>
        {/* Hull */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", fontWeight: 600, color: "rgba(40,40,80,0.4)", textTransform: "uppercase", letterSpacing: "1.5px" }}>Trapèze</span>
          <div style={{ display: "flex", gap: "4px" }}>
            {[{ k: "none", lbl: "Aucun", col: "rgba(100,100,120,0.3)" }, { k: "fr", lbl: "FR", col: "rgba(30,100,220,0.5)" }, { k: "en", lbl: "EN", col: "rgba(130,60,200,0.5)" }, { k: "both", lbl: "FR + EN", col: "rgba(100,100,120,0.3)" }].map(h => (
              <button key={h.k} onClick={() => setHullShow(h.k)} style={pill(hullShow === h.k, h.col)}>{h.lbl}</button>
            ))}
          </div>
        </div>
        {/* Tessiture */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", fontWeight: 600, color: "rgba(40,40,80,0.4)", textTransform: "uppercase", letterSpacing: "1.5px" }}>Tessiture</span>
          <div style={{ display: "flex", gap: "4px" }}>
            {["none", "grave", "aigu"].map(p => (<button key={p} onClick={() => setPresetMode(p)} style={pill(normMode === "preset" ? voicePreset === p : p === "none" && normMode !== "lobanov", p === "grave" ? "rgba(20,140,80,0.5)" : p === "aigu" ? "rgba(200,130,20,0.5)" : "rgba(100,100,120,0.3)")}>{VOICE_PRESETS[p].icon} {VOICE_PRESETS[p].label}</button>))}
          </div>
        </div>
        {/* Lobanov */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", fontWeight: 600, color: "rgba(40,40,80,0.4)", textTransform: "uppercase", letterSpacing: "1.5px" }}>Calibration</span>
          <div style={{ display: "flex", gap: "4px" }}>
            {isRunning && !calibrating ? (
              <button onClick={startCalib} style={pill(normMode === "lobanov" && !!cal, "rgba(20,160,80,0.5)")}>{cal && normMode === "lobanov" ? "✓ Lobanov" : "⚙ Calibrer"}</button>
            ) : !isRunning ? (<span style={{ fontSize: "11px", color: "rgba(40,40,80,0.3)", padding: "5px 10px" }}>Démarrez le micro</span>) : null}
            {cal && normMode === "lobanov" && !calibrating && (
              <button onClick={() => { setCal(null); setNormMode("none"); setVoicePreset("none"); }} style={{ ...pill(false), fontSize: "11px", padding: "4px 10px" }}>✕</button>
            )}
          </div>
        </div>
      </div>

      {/* Calibration panel */}
      {calibrating && (
        <div style={{ marginBottom: "12px", padding: "14px 20px", borderRadius: "12px", background: "rgba(20,160,80,0.06)", border: "1px solid rgba(20,160,80,0.2)", maxWidth: "420px", textAlign: "center" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "rgba(20,140,70,0.9)", marginBottom: "6px" }}>Calibration Lobanov — Étape {cStep + 1}/{CALIB_STEPS.length}</div>
          <div style={{ fontSize: "15px", color: "#1a1a2e", marginBottom: "4px" }}>{CALIB_STEPS[cStep].prompt}</div>
          <div style={{ fontSize: "11px", color: "rgba(40,40,80,0.5)", marginBottom: "10px" }}>{CALIB_STEPS[cStep].desc}</div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
            <button onClick={collectSample} disabled={cCollecting} style={{ padding: "8px 18px", borderRadius: "8px", border: "none", cursor: cCollecting ? "wait" : "pointer", background: cCollecting ? "rgba(20,160,80,0.12)" : "rgba(20,160,80,0.2)", color: "#1a1a2e", fontFamily: "'DM Sans'", fontSize: "13px", fontWeight: 600 }}>{cCollecting ? "⏳ Enregistrement (2s)…" : "🎙 Enregistrer"}</button>
            <button onClick={() => { cBuf.current = { collecting: false, samples: [] }; setCalibrating(false); setCCollecting(false); setNormMode("none"); }} style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.1)", background: "transparent", color: "rgba(60,60,80,0.5)", cursor: "pointer", fontFamily: "'DM Sans'", fontSize: "12px" }}>Annuler</button>
          </div>
          <div style={{ display: "flex", gap: "6px", justifyContent: "center", marginTop: "10px" }}>
            {CALIB_STEPS.map((_, i) => (<div key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: i < cSamples.length ? "rgba(20,160,80,0.7)" : i === cStep ? "rgba(20,160,80,0.3)" : "rgba(0,0,0,0.06)", transition: "all 0.2s" }} />))}
          </div>
        </div>
      )}

      {/* Predicted vowel */}
      <div style={{ display: "flex", alignItems: "center", gap: "24px", marginBottom: "14px", minHeight: "72px" }}>
        <div style={{
          width: "72px", height: "72px", borderRadius: "16px",
          background: predicted && rms > 0.005 ? (predicted.lang === "fr" ? "rgba(30,100,220,0.08)" : "rgba(130,60,200,0.08)") : "rgba(0,0,0,0.02)",
          border: predicted && rms > 0.005 ? (predicted.lang === "fr" ? "2px solid rgba(30,100,220,0.3)" : "2px solid rgba(130,60,200,0.3)") : "2px solid rgba(0,0,0,0.06)",
          display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s ease",
        }}>
          <span style={{ fontSize: "36px", fontFamily: "'Noto Sans', serif", color: rms > 0.005 ? "#1a1a2e" : "rgba(0,0,0,0.12)", fontWeight: 600 }}>
            {predicted && rms > 0.005 ? predicted.ipa : "?"}
          </span>
        </div>
        <div style={{ minWidth: "160px" }}>
          <div style={{ fontSize: "12px", color: "rgba(40,40,80,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "4px" }}>
            {rms > 0.005 ? "Voyelle détectée" : "En attente…"}
          </div>
          {predicted && rms > 0.005 && (<>
            <div style={{ fontSize: "13px", color: "rgba(40,40,80,0.7)", marginBottom: "2px" }}>
              {predicted.desc}
              <span style={{ marginLeft: "8px", fontSize: "10px", padding: "1px 5px", borderRadius: "3px", background: predicted.lang === "fr" ? "rgba(30,100,220,0.1)" : "rgba(130,60,200,0.1)", color: predicted.lang === "fr" ? "rgba(30,100,220,0.8)" : "rgba(130,60,200,0.8)" }}>{predicted.lang.toUpperCase()}</span>
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px", color: "rgba(40,40,80,0.45)" }}>
              F1 {currentF1} Hz · F2 {currentF2} Hz
              {normMode === "lobanov" && cal && <span style={{ color: "rgba(20,140,70,0.6)", marginLeft: "6px" }}>(Lobanov)</span>}
              {normMode === "preset" && voicePreset !== "none" && <span style={{ color: "rgba(180,120,20,0.7)", marginLeft: "6px" }}>({VOICE_PRESETS[voicePreset].label})</span>}
            </div>
            <div style={{ marginTop: "4px", height: "3px", borderRadius: "2px", background: "rgba(0,0,0,0.06)", width: "100px" }}>
              <div style={{ height: "100%", borderRadius: "2px", width: `${Math.round(conf * 100)}%`, background: conf > 0.6 ? "linear-gradient(90deg, #2060cc, #40a0ee)" : "linear-gradient(90deg, #e08030, #f0a050)", transition: "width 0.15s ease" }} />
            </div>
          </>)}
        </div>
      </div>

      <canvas ref={canvasRef} style={{ width: W, height: H, borderRadius: "12px", border: "1px solid rgba(0,0,50,0.1)", background: "#f8f9fc" }} />

      {/* Controls */}
      <div style={{ display: "flex", gap: "10px", marginTop: "16px", flexWrap: "wrap", justifyContent: "center" }}>
        <button onClick={isRunning ? stopAudio : startAudio} style={{
          padding: "10px 28px", borderRadius: "10px", border: "none", cursor: "pointer",
          fontFamily: "'DM Sans'", fontSize: "14px", fontWeight: 600,
          background: isRunning ? "linear-gradient(135deg, #cc3020, #aa2010)" : "linear-gradient(135deg, #2060cc, #1848aa)",
          color: "#fff", boxShadow: isRunning ? "0 4px 16px rgba(200,40,20,0.25)" : "0 4px 16px rgba(30,80,200,0.25)",
        }}>{isRunning ? "⏹ Arrêter" : "🎙 Démarrer"}</button>
        {trail.length > 0 && (<button onClick={() => setTrail([])} style={{ padding: "10px 20px", borderRadius: "10px", border: "1px solid rgba(0,0,0,0.1)", cursor: "pointer", fontFamily: "'DM Sans'", fontSize: "13px", fontWeight: 500, background: "rgba(255,255,255,0.8)", color: "rgba(40,40,80,0.6)" }}>Effacer la trace</button>)}
      </div>

      {error && <div style={{ marginTop: "14px", padding: "10px 18px", borderRadius: "8px", background: "rgba(220,40,30,0.06)", border: "1px solid rgba(220,40,30,0.2)", color: "#b02020", fontSize: "13px" }}>{error}</div>}
      {isRunning && audioDebug && <div style={{ marginTop: "8px", fontFamily: "'DM Mono', monospace", fontSize: "10px", color: "rgba(40,40,80,0.25)", textAlign: "center" }}>{audioDebug}</div>}

      <div style={{ marginTop: "20px", display: "flex", gap: "20px", fontSize: "11px", color: "rgba(40,40,80,0.4)", justifyContent: "center" }}>
        <span><span style={{ color: "rgba(30,100,220,0.6)" }}>■</span> Français</span>
        <span><span style={{ color: "rgba(130,60,200,0.6)" }}>■</span> English</span>
        <span><span style={{ color: "#d03020" }}>●</span> Votre voix</span>
      </div>

      <div style={{ marginTop: "14px", fontSize: "11px", color: "rgba(40,40,80,0.35)", textAlign: "center", maxWidth: "560px", lineHeight: "1.7" }}>
        <strong style={{ color: "rgba(40,40,80,0.5)" }}>Tessiture</strong> — Sélectionnez « Voix grave » ou « Voix aiguë » pour décaler les cibles de référence vers votre registre.
        <br />
        <strong style={{ color: "rgba(40,40,80,0.5)" }}>Calibration Lobanov</strong> — Lisez 3 voyelles cardinales (/i/, /a/, /u/) pour une normalisation précise.
      </div>
    </div>
  );
}
