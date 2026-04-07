import { useState, useRef, useEffect, useCallback, useReducer, useMemo } from "react";

/* ═══════════════════════════════════════════
   AUDIO ENGINE — Web Audio for scratch feel
   No external files needed — pure synthesis
═══════════════════════════════════════════ */
class ScratchAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { this.enabled = false; }
  }
  play(type, opts = {}) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.connect(this.ctx.destination);
    g.gain.setValueAtTime(opts.vol || 0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (opts.dur || 0.1));
    if (type === "scratch") {
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.06, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const s = this.ctx.createBufferSource();
      s.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = opts.freq || 3000;
      f.Q.value = 0.5;
      s.connect(f); f.connect(g); s.start(now);
    } else if (type === "reveal") {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(opts.freq || 600, now);
      o.frequency.exponentialRampToValueAtTime((opts.freq || 600) * 1.5, now + 0.08);
      o.connect(g);
      g.gain.setValueAtTime(opts.vol || 0.06, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      o.start(now); o.stop(now + 0.15);
    } else if (type === "rare") {
      [0, 0.06, 0.12, 0.18].forEach((t, i) => {
        const o = this.ctx.createOscillator();
        const gn = this.ctx.createGain();
        o.type = "sine";
        o.frequency.value = 500 + i * 200;
        gn.gain.setValueAtTime(0.05, now + t);
        gn.gain.exponentialRampToValueAtTime(0.001, now + t + 0.12);
        o.connect(gn); gn.connect(this.ctx.destination);
        o.start(now + t); o.stop(now + t + 0.12);
      });
    } else if (type === "purchase") {
      const o = this.ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(300, now);
      o.frequency.exponentialRampToValueAtTime(800, now + 0.1);
      o.connect(g);
      g.gain.setValueAtTime(0.07, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      o.start(now); o.stop(now + 0.15);
    } else if (type === "combo") {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = 400 + (opts.combo || 1) * 80;
      o.connect(g);
      g.gain.setValueAtTime(0.04, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      o.start(now); o.stop(now + 0.08);
    }
  }
}

const audio = new ScratchAudio();

/* ═══════════════════════════════════════════
   GEOLOGY DATA
═══════════════════════════════════════════ */
const CLAIM_TYPES = {
  shallow_soil: {
    name: "Shallow soil",
    catalog: "surface", stratum: 1,
    grid: { cols: 5, rows: 4 },
    geology: {
      rock:    { chance: 0.30, valueMult: 0, color: "#8B7355", label: "Rock", glow: false },
      quartz:  { chance: 0.30, valueMult: 2, color: "#E8DFD0", label: "Quartz", glow: false },
      copper:  { chance: 0.22, valueMult: 5, color: "#CD8C52", label: "Copper", glow: false },
      garnet:  { chance: 0.12, valueMult: 15, color: "#C23060", label: "Garnet", glow: true },
      emerald: { chance: 0.06, valueMult: 50, color: "#2ECC71", label: "Emerald", glow: true },
    },
    hardness: 3,
    theme: { bg: "#5C4A36", surface: "#8B7355", accent: "#A08060", scratchFreq: 2800, particle: "#A08060" },
    hazard: null,
    claimCost: 0,
  },
  deep_stone: {
    name: "Deep stone",
    catalog: "underground", stratum: 2,
    grid: { cols: 6, rows: 4 },
    geology: {
      slate:    { chance: 0.28, valueMult: 0, color: "#6B7B8D", label: "Slate", glow: false },
      iron:     { chance: 0.25, valueMult: 3, color: "#A0522D", label: "Iron", glow: false },
      silver:   { chance: 0.22, valueMult: 10, color: "#C8C8D0", label: "Silver", glow: false },
      sapphire: { chance: 0.14, valueMult: 30, color: "#3868C8", label: "Sapphire", glow: true },
      amethyst: { chance: 0.08, valueMult: 70, color: "#9B59B6", label: "Amethyst", glow: true },
      diamond:  { chance: 0.03, valueMult: 250, color: "#A8E8F8", label: "Diamond", glow: true },
    },
    hardness: 8,
    theme: { bg: "#3A4556", surface: "#5A6A7D", accent: "#7A8A9D", scratchFreq: 4200, particle: "#8898A8" },
    hazard: { type: "gas_pocket", chance: 0.06 },
    claimCost: 0,
  },
  volcanic_core: {
    name: "Volcanic core",
    catalog: "deep_earth", stratum: 3,
    grid: { cols: 6, rows: 5 },
    geology: {
      basalt:    { chance: 0.35, valueMult: 0, color: "#2D2D2D", label: "Basalt", glow: false },
      obsidian:  { chance: 0.24, valueMult: 10, color: "#1A1A3E", label: "Obsidian", glow: false },
      ruby:      { chance: 0.20, valueMult: 40, color: "#E03030", label: "Ruby", glow: true },
      fire_opal: { chance: 0.12, valueMult: 100, color: "#F07020", label: "Fire opal", glow: true },
      diamond:   { chance: 0.06, valueMult: 300, color: "#B0E8F8", label: "Diamond", glow: true },
      void_gem:  { chance: 0.03, valueMult: 1000, color: "#8040E0", label: "Void gem", glow: true },
    },
    hardness: 14,
    theme: { bg: "#3D1F0A", surface: "#6B2A0A", accent: "#C04020", scratchFreq: 1800, particle: "#F06030" },
    hazard: { type: "lava_timer", seconds: 18 },
    claimCost: 0,
  },
};

/* ═══════════════════════════════════════════
   UPGRADES
═══════════════════════════════════════════ */
const UPGRADES = {
  power:  { name: "Pick power", icon: "⛏", desc: "Damage per stroke", baseCost: 8, costScale: 1.65, maxLevel: 25, effect: l => 1 + l * 0.6, label: l => `${(1+l*0.6).toFixed(1)}×` },
  radius: { name: "Brush width", icon: "◎", desc: "Adjacent tile hits", baseCost: 20, costScale: 2.0, maxLevel: 12, effect: l => l, label: l => `${l} adj` },
  luck:   { name: "Keen eye", icon: "✦", desc: "Rare chance boost", baseCost: 35, costScale: 2.2, maxLevel: 18, effect: l => 1 + l * 0.15, label: l => `+${(l*15).toFixed(0)}%` },
  speed:  { name: "Quick hands", icon: "⚡", desc: "Auto-scratch speed", baseCost: 100, costScale: 2.5, maxLevel: 10, effect: l => l > 0 ? 400 - l * 30 : 0, label: l => l === 0 ? "Locked" : `${(1000/(400-l*30)).toFixed(1)}/s` },
};

const upgCost = (key, lvl) => Math.floor(UPGRADES[key].baseCost * Math.pow(UPGRADES[key].costScale, lvl));

/* ═══════════════════════════════════════════
   CLAIM ENGINE
═══════════════════════════════════════════ */
function generateClaim(typeKey, luckMult = 1) {
  const type = CLAIM_TYPES[typeKey];
  const { cols, rows } = type.grid;
  const entries = Object.entries(type.geology);
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let roll = Math.random();
      let mineral = entries[0];
      let cum = 0;
      for (const entry of entries) {
        let ch = entry[1].chance;
        if (entry[1].valueMult > 10) ch = Math.min(ch * luckMult, ch * 3);
        cum += ch;
        if (roll <= cum) { mineral = entry; break; }
      }
      const isHazard = type.hazard?.type === "gas_pocket" && Math.random() < (type.hazard.chance || 0) && mineral[1].valueMult === 0;
      tiles.push({
        id: `${r}-${c}`, row: r, col: c,
        mineralKey: mineral[0], mineral: mineral[1],
        damage: 0, revealed: false, isHazard,
        justRevealed: false, revealTime: 0,
      });
    }
  }
  return { typeKey, type, tiles, cols, rows, completed: false, startTime: Date.now() };
}

/* ═══════════════════════════════════════════
   GAME STATE
═══════════════════════════════════════════ */
const BASE_GOLD = 5;

const init = {
  gold: 0, displayGold: 0, totalGold: 0,
  upgrades: { power: 0, radius: 0, luck: 0, speed: 0 },
  claim: null, claimTypeKey: "shallow_soil",
  journal: {}, recentFinds: [], claimsCompleted: 0,
  combo: 0, comboTimer: 0, maxCombo: 0,
  prestigeCount: 0, prestigePicks: 0, permanentMult: 1,
  unlockedClaims: ["shallow_soil"],
  particles: [], sparkles: [],
  notification: null, shake: 0,
  totalScratches: 0, sessionBest: 0,
};

function reducer(state, action) {
  switch (action.type) {
    case "NEW_CLAIM": {
      const lm = UPGRADES.luck.effect(state.upgrades.luck);
      return { ...state, claim: generateClaim(action.claimType || state.claimTypeKey, lm), claimTypeKey: action.claimType || state.claimTypeKey, combo: 0 };
    }
    case "SCRATCH": {
      if (!state.claim || state.claim.completed) return state;
      const { tileId, power, sx, sy } = action;
      let gold = state.gold, totalGold = state.totalGold, journal = { ...state.journal };
      let recentFinds = [...state.recentFinds], particles = [...state.particles];
      let sparkles = [...state.sparkles];
      let notification = state.notification, shake = 0;
      let combo = state.combo, maxCombo = state.maxCombo;
      let sessionBest = state.sessionBest;

      const tiles = state.claim.tiles.map(t => {
        if (t.id !== tileId || t.revealed) return t;
        const nd = t.damage + power;
        if (nd >= state.claim.type.hardness) return { ...t, damage: state.claim.type.hardness, revealed: true, justRevealed: true, revealTime: Date.now() };
        return { ...t, damage: nd };
      });

      const justR = tiles.find(t => t.id === tileId && t.justRevealed && !state.claim.tiles.find(o => o.id === tileId)?.revealed);

      if (justR) {
        let val = Math.floor(justR.mineral.valueMult * BASE_GOLD * state.permanentMult);
        if (justR.isHazard) val = Math.floor(val * 0.5);

        if (val > 0) {
          combo++;
          const comboMult = 1 + Math.min(combo, 20) * 0.05;
          val = Math.floor(val * comboMult);
          if (combo > maxCombo) maxCombo = combo;

          gold += val;
          totalGold += val;
          if (val > sessionBest) sessionBest = val;
          journal[justR.mineral.label] = (journal[justR.mineral.label] || 0) + 1;

          particles.push({ id: Date.now() + Math.random(), x: sx, y: sy, text: `+${val}`, color: justR.mineral.color, big: val > 100, combo: combo > 3 ? combo : 0 });

          if (justR.mineral.glow) {
            for (let i = 0; i < (justR.mineral.valueMult >= 50 ? 8 : 4); i++) {
              sparkles.push({
                id: Date.now() + Math.random() + i,
                x: sx + (Math.random() - 0.5) * 80,
                y: sy + (Math.random() - 0.5) * 80,
                color: justR.mineral.color,
                size: 2 + Math.random() * 4,
              });
            }
          }

          if (justR.mineral.valueMult >= 15) {
            recentFinds = [{ label: justR.mineral.label, color: justR.mineral.color, value: val, time: Date.now() }, ...recentFinds].slice(0, 6);
          }
          if (justR.mineral.valueMult >= 50) {
            notification = { text: `${justR.mineral.label}!`, sub: `+${val}g${combo > 3 ? ` · ${combo}× combo` : ""}`, color: justR.mineral.color, id: Date.now() };
            shake = justR.mineral.valueMult >= 200 ? 3 : 2;
          }
          if (justR.mineral.valueMult >= 200) {
            for (let i = 0; i < 16; i++) {
              sparkles.push({ id: Date.now() + Math.random() + i + 100, x: sx + (Math.random() - 0.5) * 160, y: sy + (Math.random() - 0.5) * 160, color: justR.mineral.color, size: 3 + Math.random() * 5 });
            }
          }
        } else {
          combo = 0;
        }

        if (justR.isHazard) {
          notification = { text: "Gas pocket!", sub: "Values halved", color: "#6B7B8D", id: Date.now() };
          shake = 1;
        }
      }

      const completed = tiles.every(t => t.revealed);
      let claimsCompleted = state.claimsCompleted;
      if (completed && !state.claim.completed) {
        claimsCompleted++;
        const bonus = Math.floor(tiles.reduce((s, t) => s + t.mineral.valueMult, 0) * BASE_GOLD * state.permanentMult * 0.2);
        gold += bonus;
        totalGold += bonus;
        particles.push({ id: Date.now() + 999, x: sx, y: sy - 30, text: `+${bonus} bonus`, color: "#D4A843", big: true, combo: 0 });
      }

      return {
        ...state, gold, totalGold, journal, recentFinds, particles, sparkles, notification, shake,
        combo, maxCombo, claimsCompleted, sessionBest,
        totalScratches: state.totalScratches + 1,
        claim: { ...state.claim, tiles, completed },
      };
    }
    case "BUY_UPGRADE": {
      const lvl = state.upgrades[action.key];
      const cost = upgCost(action.key, lvl);
      if (state.gold < cost || lvl >= UPGRADES[action.key].maxLevel) return state;
      return { ...state, gold: state.gold - cost, upgrades: { ...state.upgrades, [action.key]: lvl + 1 } };
    }
    case "PRESTIGE": {
      if (state.totalGold < 500) return state;
      const picks = Math.floor(Math.sqrt(state.totalGold / 50));
      const ul = [...state.unlockedClaims];
      if (!ul.includes("deep_stone")) ul.push("deep_stone");
      if (state.prestigeCount >= 1 && !ul.includes("volcanic_core")) ul.push("volcanic_core");
      return {
        ...init, journal: state.journal, recentFinds: [],
        prestigeCount: state.prestigeCount + 1,
        prestigePicks: state.prestigePicks + picks,
        permanentMult: state.permanentMult + picks * 0.1,
        unlockedClaims: ul, maxCombo: state.maxCombo,
        claimsCompleted: state.claimsCompleted,
      };
    }
    case "TICK_GOLD":
      return { ...state, displayGold: state.displayGold + Math.ceil((state.gold - state.displayGold) * 0.2) };
    case "CLEAR_P": return { ...state, particles: state.particles.filter(p => p.id !== action.id) };
    case "CLEAR_S": return { ...state, sparkles: state.sparkles.filter(s => s.id !== action.id) };
    case "CLEAR_N": return { ...state, notification: null };
    case "SELECT_CLAIM": return { ...state, claimTypeKey: action.key };
    case "DECAY_COMBO": return { ...state, combo: Math.max(0, state.combo - 1) };
    default: return state;
  }
}

/* ═══════════════════════════════════════════
   PARTICLE COMPONENTS
═══════════════════════════════════════════ */
function GoldPop({ p, onDone }) {
  useEffect(() => { const t = setTimeout(() => onDone(p.id), 1000); return () => clearTimeout(t); }, [p.id]);
  const dx = (Math.random() - 0.5) * 30;
  return (
    <div style={{
      position: "absolute", left: p.x - 20, top: p.y - 10, pointerEvents: "none", zIndex: 100,
      color: p.color || "#D4A843",
      fontSize: p.big ? 20 : 14, fontWeight: 800, fontFamily: "'Anybody', sans-serif",
      textShadow: `0 0 8px ${p.color}80, 0 2px 4px rgba(0,0,0,0.6)`,
      animation: "goldPop 1s ease-out forwards",
      "--dx": `${dx}px`,
    }}>
      {p.text}{p.combo > 0 && <span style={{ fontSize: 10, opacity: 0.7 }}> ×{p.combo}</span>}
    </div>
  );
}

function Sparkle({ s, onDone }) {
  useEffect(() => { const t = setTimeout(() => onDone(s.id), 800); return () => clearTimeout(t); }, [s.id]);
  return (
    <div style={{
      position: "absolute", left: s.x, top: s.y, width: s.size, height: s.size, pointerEvents: "none", zIndex: 90,
      background: s.color, borderRadius: "50%",
      boxShadow: `0 0 ${s.size * 3}px ${s.color}`,
      animation: "sparkleFade 0.8s ease-out forwards",
      "--sx": `${(Math.random() - 0.5) * 60}px`,
      "--sy": `${-20 - Math.random() * 40}px`,
    }} />
  );
}

/* ═══════════════════════════════════════════
   TILE COMPONENT
═══════════════════════════════════════════ */
function Tile({ tile, theme, hardness, onScratch }) {
  const pct = Math.min(tile.damage / hardness, 1);
  const isGlow = tile.revealed && tile.mineral.glow;
  const worth = tile.mineral.valueMult;

  return (
    <div
      onMouseDown={e => { e.preventDefault(); onScratch(tile.id, e); }}
      onMouseEnter={e => { if (e.buttons === 1) onScratch(tile.id, e); }}
      onTouchStart={e => { e.preventDefault(); const t = e.touches[0]; onScratch(tile.id, t); }}
      onTouchMove={e => { const t = e.touches[0]; const el = document.elementFromPoint(t.clientX, t.clientY); if (el) { const tid = el.getAttribute("data-tid"); if (tid) onScratch(tid, t); }}}
      data-tid={tile.id}
      style={{
        width: "100%", aspectRatio: "1", borderRadius: 5, position: "relative", overflow: "hidden",
        cursor: tile.revealed ? "default" : "crosshair",
        transform: tile.revealed ? "scale(0.94)" : pct > 0 ? `scale(${1 - pct * 0.02})` : "scale(1)",
        transition: tile.revealed ? "transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)" : "transform 0.05s",
        userSelect: "none", WebkitUserSelect: "none",
      }}
    >
      {/* Mineral layer */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: 5,
        background: tile.mineral.color,
        opacity: tile.revealed ? 1 : Math.pow(pct, 0.6) * 0.9,
        transition: tile.revealed ? "opacity 0.3s, box-shadow 0.5s" : "opacity 0.05s",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: isGlow ? `inset 0 0 12px ${tile.mineral.color}80, 0 0 16px ${tile.mineral.color}60` : "none",
      }}>
        {tile.revealed && worth > 0 && (
          <span style={{
            fontSize: worth >= 50 ? 11 : 9, fontWeight: 700, color: "#fff",
            textShadow: "0 1px 3px rgba(0,0,0,0.7)",
            animation: tile.justRevealed ? "revealPop 0.3s ease-out" : "none",
            letterSpacing: 0.3,
          }}>{tile.mineral.label}</span>
        )}
        {tile.revealed && worth === 0 && !tile.isHazard && (
          <span style={{ fontSize: 8, color: "rgba(255,255,255,0.3)" }}>{tile.mineral.label}</span>
        )}
        {tile.isHazard && tile.revealed && (
          <span style={{ fontSize: 14, filter: "drop-shadow(0 0 4px rgba(107,123,141,0.6))" }}>💨</span>
        )}
      </div>
      {/* Rock surface */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: 5, pointerEvents: "none",
        background: `linear-gradient(145deg, ${theme.surface}F0 0%, ${theme.bg}E8 60%, ${theme.surface}D0 100%)`,
        opacity: 1 - pct,
        transition: tile.revealed ? "opacity 0.25s ease-in" : "opacity 0.03s",
      }} />
      {/* Scratch groove */}
      {pct > 0 && !tile.revealed && (
        <div style={{
          position: "absolute", inset: "15%", borderRadius: 3, pointerEvents: "none",
          background: "rgba(0,0,0,0.25)",
          opacity: pct * 0.7,
          filter: `blur(${2 - pct}px)`,
        }} />
      )}
      {/* Crack network */}
      {pct > 0.2 && !tile.revealed && (
        <svg style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: Math.min(pct * 1.2, 0.8) }} viewBox="0 0 40 40">
          <path d={`M${8+Math.random()*4} ${4+Math.random()*3}L${18+Math.random()*4} ${18+Math.random()*4}L${10+Math.random()*4} ${34+Math.random()*3}`} stroke="rgba(0,0,0,0.35)" strokeWidth="0.7" fill="none" strokeLinecap="round"/>
          <path d={`M${28+Math.random()*4} ${6+Math.random()*3}L${20+Math.random()*4} ${20+Math.random()*4}L${30+Math.random()*4} ${32+Math.random()*3}`} stroke="rgba(0,0,0,0.25)" strokeWidth="0.5" fill="none" strokeLinecap="round"/>
          {pct > 0.5 && <path d={`M${4+Math.random()*4} ${20+Math.random()*4}L${36+Math.random()*4} ${18+Math.random()*4}`} stroke="rgba(0,0,0,0.2)" strokeWidth="0.4" fill="none"/>}
        </svg>
      )}
      {/* Shimmer edge when nearly broken */}
      {pct > 0.7 && !tile.revealed && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 5, pointerEvents: "none",
          border: `1px solid ${tile.mineral.color}40`,
          animation: "shimmer 1.5s ease-in-out infinite",
        }} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════ */
export default function PocketProspector() {
  const [state, dispatch] = useReducer(reducer, init);
  const benchRef = useRef(null);
  const [showJournal, setShowJournal] = useState(false);
  const [showPrestige, setShowPrestige] = useState(false);
  const [muted, setMuted] = useState(false);
  const autoRef = useRef(null);

  useEffect(() => { dispatch({ type: "NEW_CLAIM", claimType: "shallow_soil" }); }, []);

  // Animated gold counter
  useEffect(() => {
    if (state.displayGold !== state.gold) {
      const t = requestAnimationFrame(() => dispatch({ type: "TICK_GOLD" }));
      return () => cancelAnimationFrame(t);
    }
  }, [state.displayGold, state.gold]);

  // Combo decay
  useEffect(() => {
    if (state.combo > 0) {
      const t = setTimeout(() => dispatch({ type: "DECAY_COMBO" }), 2200);
      return () => clearTimeout(t);
    }
  }, [state.combo]);

  // Auto notification clear
  useEffect(() => {
    if (state.notification) {
      const t = setTimeout(() => dispatch({ type: "CLEAR_N" }), 2800);
      return () => clearTimeout(t);
    }
  }, [state.notification?.id]);

  // Auto-scratch
  useEffect(() => {
    const spd = UPGRADES.speed.effect(state.upgrades.speed);
    if (spd <= 0 || !state.claim || state.claim.completed) { clearInterval(autoRef.current); return; }
    autoRef.current = setInterval(() => {
      const unr = state.claim?.tiles.filter(t => !t.revealed);
      if (unr && unr.length > 0) {
        const t = unr[Math.floor(Math.random() * unr.length)];
        dispatch({ type: "SCRATCH", tileId: t.id, power: UPGRADES.power.effect(state.upgrades.power) * 0.4, sx: 300, sy: 300 });
      }
    }, spd);
    return () => clearInterval(autoRef.current);
  }, [state.upgrades.speed, state.upgrades.power, state.claim?.completed, state.claim?.typeKey]);

  const handleScratch = useCallback((tileId, e) => {
    audio.init();
    if (state.claim?.completed) return;
    const rect = benchRef.current?.getBoundingClientRect();
    const cx = e.clientX ?? e.pageX;
    const cy = e.clientY ?? e.pageY;
    const sx = rect ? cx - rect.left : 300;
    const sy = rect ? cy - rect.top : 200;
    const pw = UPGRADES.power.effect(state.upgrades.power);
    const ct = CLAIM_TYPES[state.claimTypeKey];

    dispatch({ type: "SCRATCH", tileId, power: pw, sx, sy });
    if (!muted) audio.play("scratch", { freq: ct.theme.scratchFreq + (Math.random() - 0.5) * 400, vol: 0.04 + Math.random() * 0.03 });

    const tile = state.claim?.tiles.find(t => t.id === tileId);
    if (tile && !tile.revealed && tile.damage + pw >= ct.hardness) {
      if (!muted) {
        if (tile.mineral.valueMult >= 50) audio.play("rare");
        else if (tile.mineral.valueMult > 0) audio.play("reveal", { freq: 400 + tile.mineral.valueMult * 3 });
      }
    }

    // Radius splash
    if (state.claim && state.upgrades.radius > 0) {
      const src = state.claim.tiles.find(t => t.id === tileId);
      if (src) {
        state.claim.tiles
          .filter(t => !t.revealed && t.id !== tileId && Math.abs(t.row - src.row) <= 1 && Math.abs(t.col - src.col) <= 1)
          .slice(0, state.upgrades.radius)
          .forEach(t => dispatch({ type: "SCRATCH", tileId: t.id, power: pw * 0.35, sx: sx + (Math.random() - 0.5) * 50, sy: sy + (Math.random() - 0.5) * 50 }));
      }
    }
  }, [state.upgrades.power, state.upgrades.radius, state.claim, state.claimTypeKey, muted]);

  const ct = state.claim ? CLAIM_TYPES[state.claimTypeKey] : null;
  const pct = state.claim ? Math.floor(state.claim.tiles.filter(t => t.revealed).length / state.claim.tiles.length * 100) : 0;
  const canPrestige = state.totalGold >= 500;

  const fmt = g => { if (g >= 1e6) return `${(g/1e6).toFixed(1)}M`; if (g >= 1e3) return `${(g/1e3).toFixed(1)}K`; return `${g}`; };

  const comboColor = state.combo > 10 ? "#F0C040" : state.combo > 5 ? "#E08830" : state.combo > 2 ? "#C07030" : "rgba(245,240,232,0.3)";

  return (
    <div style={{
      width: "100%", height: "100vh", background: "#131010", fontFamily: "'Anybody', sans-serif",
      display: "flex", position: "relative", overflow: "hidden", color: "#F5F0E8",
      animation: state.shake > 0 ? `shake${state.shake} 0.3s ease-out` : "none",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anybody:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap');
        @keyframes goldPop { 0%{opacity:1;transform:translateY(0) translateX(0) scale(1)} 100%{opacity:0;transform:translateY(-55px) translateX(var(--dx,0)) scale(1.2)} }
        @keyframes sparkleFade { 0%{opacity:1;transform:translate(0,0) scale(1)} 100%{opacity:0;transform:translate(var(--sx),var(--sy)) scale(0)} }
        @keyframes revealPop { 0%{transform:scale(0.3);opacity:0} 50%{transform:scale(1.2)} 100%{transform:scale(1);opacity:1} }
        @keyframes shimmer { 0%,100%{opacity:0.3} 50%{opacity:0.7} }
        @keyframes slideUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes notifIn { 0%{opacity:0;transform:translate(-50%,-16px) scale(0.9)} 8%{opacity:1;transform:translate(-50%,0) scale(1)} 80%{opacity:1;transform:translate(-50%,0) scale(1)} 100%{opacity:0;transform:translate(-50%,-8px) scale(0.95)} }
        @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.9} }
        @keyframes comboGlow { 0%,100%{text-shadow:0 0 4px currentColor} 50%{text-shadow:0 0 12px currentColor} }
        @keyframes shake1 { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-2px)} 75%{transform:translateX(2px)} }
        @keyframes shake2 { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-3px) rotate(-0.5deg)} 40%{transform:translateX(3px) rotate(0.5deg)} 60%{transform:translateX(-2px)} 80%{transform:translateX(2px)} }
        @keyframes shake3 { 0%,100%{transform:translateX(0)} 10%{transform:translate(-4px,-2px) rotate(-1deg)} 30%{transform:translate(4px,1px) rotate(1deg)} 50%{transform:translate(-3px,-1px)} 70%{transform:translate(3px,1px)} 90%{transform:translate(-1px,0)} }
        @keyframes breathe { 0%,100%{box-shadow:0 0 20px rgba(212,168,67,0.15)} 50%{box-shadow:0 0 40px rgba(212,168,67,0.3)} }
        .upg-btn { transition: all 0.12s; border: 1px solid rgba(184,115,51,0.2); }
        .upg-btn:hover:not(:disabled) { border-color: rgba(184,115,51,0.6); background: rgba(184,115,51,0.12) !important; transform: translateY(-1px); }
        .upg-btn:active:not(:disabled) { transform: translateY(0) scale(0.98); }
        .upg-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .cs-btn { transition: all 0.15s; }
        .cs-btn:hover { transform: translateY(-2px); }
        .find-row { animation: slideUp 0.3s ease-out; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(184,115,51,0.2); border-radius: 2px; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      {/* ═══ LEFT SIDEBAR ═══ */}
      <div style={{
        width: 210, flexShrink: 0,
        background: "linear-gradient(180deg, #1E1A14 0%, #16130E 100%)",
        borderRight: "1px solid rgba(184,115,51,0.1)",
        display: "flex", flexDirection: "column",
      }}>
        {/* Gold */}
        <div style={{ padding: "18px 14px 14px", borderBottom: "1px solid rgba(184,115,51,0.1)" }}>
          <div style={{ fontSize: 9, letterSpacing: 2.5, textTransform: "uppercase", color: "rgba(245,240,232,0.3)", fontFamily: "'JetBrains Mono', monospace" }}>Gold</div>
          <div style={{
            fontSize: 34, fontWeight: 900, color: "#D4A843", lineHeight: 1, marginTop: 2,
            textShadow: state.gold > state.displayGold ? "0 0 12px rgba(212,168,67,0.4)" : "none",
            transition: "text-shadow 0.3s",
          }}>{fmt(state.displayGold)}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: "rgba(245,240,232,0.2)" }}>
            <span>Total: {fmt(state.totalGold)}</span>
            <span>Claims: {state.claimsCompleted}</span>
          </div>
        </div>

        {/* Combo */}
        {state.combo > 0 && (
          <div style={{
            padding: "6px 14px", borderBottom: "1px solid rgba(184,115,51,0.1)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <div style={{
              fontSize: 20, fontWeight: 900, color: comboColor,
              animation: state.combo > 5 ? "comboGlow 0.8s ease-in-out infinite" : "none",
              fontFamily: "'Anybody', sans-serif",
            }}>{state.combo}×</div>
            <div>
              <div style={{ fontSize: 9, color: "rgba(245,240,232,0.3)", fontFamily: "'JetBrains Mono', monospace" }}>Combo</div>
              <div style={{ height: 3, width: 80, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 2, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(state.combo / 20 * 100, 100)}%`, height: "100%", background: comboColor, borderRadius: 2, transition: "width 0.2s, background 0.3s" }} />
              </div>
            </div>
          </div>
        )}

        {/* Upgrades */}
        <div style={{ padding: "10px 10px 6px", flex: 1, overflow: "auto" }}>
          <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "rgba(245,240,232,0.25)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8, paddingLeft: 2 }}>Upgrades</div>
          {Object.entries(UPGRADES).map(([key, upg]) => {
            const lvl = state.upgrades[key];
            const cost = upgCost(key, lvl);
            const ok = state.gold >= cost && lvl < upg.maxLevel;
            return (
              <button key={key} className="upg-btn" disabled={!ok}
                onClick={() => { dispatch({ type: "BUY_UPGRADE", key }); if (!muted) audio.play("purchase"); }}
                style={{
                  display: "block", width: "100%", background: "rgba(40,32,22,0.6)", borderRadius: 7,
                  padding: "9px 10px", marginBottom: 6, cursor: ok ? "pointer" : "not-allowed",
                  textAlign: "left", color: "#F5F0E8",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{upg.icon} {upg.name}</span>
                  <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: ok ? "#D4A843" : "rgba(245,240,232,0.2)" }}>
                    {lvl >= upg.maxLevel ? "MAX" : `${fmt(cost)}g`}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                  <span style={{ fontSize: 9, color: "rgba(245,240,232,0.3)" }}>{upg.desc}</span>
                  <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: "#B87333" }}>Lv{lvl} {upg.label(lvl)}</span>
                </div>
                <div style={{ marginTop: 5, height: 2, background: "rgba(184,115,51,0.1)", borderRadius: 1, overflow: "hidden" }}>
                  <div style={{ width: `${(lvl/upg.maxLevel)*100}%`, height: "100%", background: `linear-gradient(90deg, #B87333, #D4A843)`, borderRadius: 1, transition: "width 0.3s" }}/>
                </div>
              </button>
            );
          })}
        </div>

        {/* Prestige */}
        <div style={{ padding: "8px 10px 14px", borderTop: "1px solid rgba(184,115,51,0.1)" }}>
          <button onClick={() => setShowPrestige(true)} disabled={!canPrestige}
            style={{
              width: "100%", padding: "9px", borderRadius: 7, fontSize: 10, fontWeight: 700,
              letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace",
              cursor: canPrestige ? "pointer" : "not-allowed",
              background: canPrestige ? "linear-gradient(135deg, #5A1A08, #3D1F0A)" : "rgba(40,32,22,0.3)",
              border: canPrestige ? "1px solid #C04020" : "1px solid rgba(184,115,51,0.1)",
              color: canPrestige ? "#F5F0E8" : "rgba(245,240,232,0.2)",
              animation: canPrestige ? "breathe 3s ease-in-out infinite" : "none",
            }}
          >⛰ Descend deeper</button>
          {state.prestigeCount > 0 && (
            <div style={{ textAlign: "center", marginTop: 5, fontSize: 8, color: "rgba(245,240,232,0.2)", fontFamily: "'JetBrains Mono', monospace" }}>
              Stratum {state.prestigeCount+1} · {state.permanentMult.toFixed(1)}× mult
            </div>
          )}
        </div>
      </div>

      {/* ═══ CENTER — WORKBENCH ═══ */}
      <div ref={benchRef} style={{
        flex: 1, position: "relative",
        background: ct ? `radial-gradient(ellipse at 50% 40%, ${ct.theme.accent}08 0%, transparent 60%), linear-gradient(180deg, #1E1A14 0%, #151008 100%)` : "#151008",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "16px 24px", overflow: "hidden",
      }}>
        {/* Ambient lantern */}
        <div style={{
          position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
          width: 300 + state.upgrades.luck * 20, height: 200 + state.upgrades.luck * 10,
          background: `radial-gradient(ellipse, rgba(212,168,67,${0.03+state.upgrades.luck*0.006}) 0%, transparent 70%)`,
          pointerEvents: "none", transition: "all 1s",
        }}/>

        {/* Notification */}
        {state.notification && (
          <div key={state.notification.id} style={{
            position: "absolute", top: 20, left: "50%",
            background: "rgba(20,16,12,0.92)", backdropFilter: "blur(12px)",
            border: `1.5px solid ${state.notification.color}`,
            borderRadius: 10, padding: "10px 24px", zIndex: 50,
            animation: "notifIn 2.8s ease forwards", textAlign: "center",
            boxShadow: `0 0 30px ${state.notification.color}30`,
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: state.notification.color }}>{state.notification.text}</div>
            {state.notification.sub && <div style={{ fontSize: 11, color: "rgba(245,240,232,0.5)", marginTop: 2 }}>{state.notification.sub}</div>}
          </div>
        )}

        {/* Claim type tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {state.unlockedClaims.map(key => {
            const c = CLAIM_TYPES[key];
            const active = state.claimTypeKey === key;
            return (
              <button key={key} className="cs-btn"
                onClick={() => { dispatch({ type: "SELECT_CLAIM", key }); dispatch({ type: "NEW_CLAIM", claimType: key }); }}
                style={{
                  padding: "5px 14px", borderRadius: 16, fontSize: 11, fontWeight: 600,
                  border: active ? `1.5px solid ${c.theme.accent}` : "1px solid rgba(184,115,51,0.15)",
                  background: active ? `${c.theme.accent}20` : "rgba(40,32,22,0.5)",
                  color: active ? "#F5F0E8" : "rgba(245,240,232,0.4)",
                  cursor: "pointer", fontFamily: "'Anybody', sans-serif",
                  boxShadow: active ? `0 0 16px ${c.theme.accent}20` : "none",
                }}
              >{c.name}</button>
            );
          })}
          <button onClick={() => { setMuted(!muted); audio.init(); }} style={{
            padding: "5px 10px", borderRadius: 16, fontSize: 11, border: "1px solid rgba(245,240,232,0.08)",
            background: "rgba(40,32,22,0.3)", color: "rgba(245,240,232,0.25)", cursor: "pointer",
          }}>{muted ? "🔇" : "🔊"}</button>
        </div>

        {/* THE CLAIM */}
        {state.claim && (
          <div style={{
            background: `linear-gradient(150deg, ${ct.theme.bg}F8 0%, ${ct.theme.surface}E0 40%, ${ct.theme.bg}F0 100%)`,
            borderRadius: 10, padding: 10,
            boxShadow: `0 12px 48px rgba(0,0,0,0.55), 0 0 1px rgba(255,255,255,0.05) inset, 0 0 40px ${ct.theme.accent}10`,
            position: "relative", maxWidth: ct.grid.cols <= 5 ? 360 : 430, width: "100%",
          }}>
            {/* Hardness badge */}
            <div style={{
              position: "absolute", top: -7, right: 10,
              background: "#16130E", border: `1px solid ${ct.theme.accent}40`, borderRadius: 4,
              padding: "1px 7px", fontSize: 8, fontFamily: "'JetBrains Mono', monospace",
              color: ct.theme.accent, letterSpacing: 0.5,
            }}>H:{ct.hardness}</div>

            {/* Grid */}
            <div style={{
              display: "grid", gridTemplateColumns: `repeat(${state.claim.cols}, 1fr)`,
              gap: 3,
            }}>
              {state.claim.tiles.map(tile => (
                <Tile key={tile.id} tile={tile} theme={ct.theme} hardness={ct.hardness} onScratch={handleScratch} />
              ))}
            </div>

            {/* Progress bar */}
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ flex: 1, height: 3, background: "rgba(0,0,0,0.3)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  width: `${pct}%`, height: "100%", borderRadius: 2, transition: "width 0.15s",
                  background: pct === 100 ? "#D4A843" : `linear-gradient(90deg, ${ct.theme.accent}, ${ct.theme.accent}CC)`,
                }}/>
              </div>
              <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: "rgba(245,240,232,0.3)", minWidth: 28, textAlign: "right" }}>{pct}%</span>
            </div>

            {/* Complete overlay */}
            {state.claim.completed && (
              <div style={{
                position: "absolute", inset: 0, borderRadius: 10,
                background: "rgba(18,14,10,0.88)", backdropFilter: "blur(6px)",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                animation: "slideUp 0.25s ease-out",
              }}>
                <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: ct.theme.accent, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>Complete</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#D4A843", marginBottom: 4 }}>Claim cleared</div>
                {state.maxCombo > 2 && <div style={{ fontSize: 11, color: comboColor, marginBottom: 10 }}>Best combo: {state.maxCombo}×</div>}
                <button onClick={() => dispatch({ type: "NEW_CLAIM" })}
                  style={{
                    padding: "10px 32px", borderRadius: 8, border: "none", cursor: "pointer",
                    background: `linear-gradient(135deg, ${ct.theme.accent}, ${ct.theme.surface})`,
                    color: "#F5F0E8", fontSize: 13, fontWeight: 700, fontFamily: "'Anybody', sans-serif",
                    boxShadow: `0 0 20px ${ct.theme.accent}40`,
                  }}
                >Next claim →</button>
              </div>
            )}
          </div>
        )}

        {/* Bench label */}
        <div style={{
          marginTop: 16, fontSize: 9, letterSpacing: 3.5, textTransform: "uppercase",
          color: "rgba(245,240,232,0.1)", fontFamily: "'JetBrains Mono', monospace",
        }}>Miner's workbench</div>

        {/* Particles */}
        {state.particles.map(p => <GoldPop key={p.id} p={p} onDone={id => dispatch({ type: "CLEAR_P", id })} />)}
        {state.sparkles.map(s => <Sparkle key={s.id} s={s} onDone={id => dispatch({ type: "CLEAR_S", id })} />)}
      </div>

      {/* ═══ RIGHT SIDEBAR ═══ */}
      <div style={{
        width: 190, flexShrink: 0,
        background: "linear-gradient(180deg, #1E1A14 0%, #16130E 100%)",
        borderLeft: "1px solid rgba(184,115,51,0.1)",
        display: "flex", flexDirection: "column",
      }}>
        {/* Specimen jars */}
        <div style={{ padding: "18px 12px 10px", borderBottom: "1px solid rgba(184,115,51,0.1)" }}>
          <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "rgba(245,240,232,0.25)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>Specimen jars</div>
          {state.recentFinds.length === 0 ? (
            <div style={{ fontSize: 10, color: "rgba(245,240,232,0.15)", fontStyle: "italic" }}>Find rare minerals...</div>
          ) : state.recentFinds.map((f, i) => (
            <div key={f.time + i} className="find-row" style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "5px 6px", background: "rgba(40,32,22,0.4)", borderRadius: 5, marginBottom: 4,
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 3, background: f.color, flexShrink: 0,
                boxShadow: `0 0 8px ${f.color}50`,
              }}/>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#F5F0E8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.label}</div>
                <div style={{ fontSize: 8, fontFamily: "'JetBrains Mono', monospace", color: "#D4A843" }}>+{f.value}g</div>
              </div>
            </div>
          ))}
        </div>

        {/* Journal toggle */}
        <div style={{ padding: "8px 12px" }}>
          <button onClick={() => setShowJournal(!showJournal)} style={{
            width: "100%", padding: "7px", background: showJournal ? "rgba(184,115,51,0.1)" : "rgba(40,32,22,0.4)",
            border: "1px solid rgba(184,115,51,0.15)", borderRadius: 6, color: "#F5F0E8",
            fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "'Anybody', sans-serif",
          }}>📓 Journal ({Object.keys(state.journal).length})</button>
        </div>

        {/* Journal / Geology */}
        <div style={{ flex: 1, overflow: "auto", padding: "4px 12px 12px" }}>
          {showJournal ? (
            Object.entries(state.journal).sort((a,b) => b[1]-a[1]).map(([m, c]) => (
              <div key={m} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 10, borderBottom: "1px solid rgba(184,115,51,0.05)" }}>
                <span style={{ color: "rgba(245,240,232,0.5)" }}>{m}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "rgba(245,240,232,0.2)" }}>×{c}</span>
              </div>
            ))
          ) : ct && (
            <>
              <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "rgba(245,240,232,0.2)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>Geology</div>
              {Object.entries(ct.geology).map(([k, m]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 0", borderBottom: "1px solid rgba(184,115,51,0.04)" }}>
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: m.color, flexShrink: 0, boxShadow: m.glow ? `0 0 4px ${m.color}60` : "none" }}/>
                  <span style={{ fontSize: 9, color: "rgba(245,240,232,0.4)", flex: 1 }}>{m.label}</span>
                  <span style={{ fontSize: 8, fontFamily: "'JetBrains Mono', monospace", color: "rgba(245,240,232,0.15)" }}>{(m.chance*100).toFixed(0)}%</span>
                  <span style={{ fontSize: 8, fontFamily: "'JetBrains Mono', monospace", color: m.valueMult > 0 ? "#D4A843" : "rgba(245,240,232,0.1)", minWidth: 22, textAlign: "right" }}>
                    {m.valueMult > 0 ? `${m.valueMult}×` : "—"}
                  </span>
                </div>
              ))}
              {ct.hazard && (
                <div style={{ marginTop: 6, fontSize: 9, color: "rgba(180,80,60,0.6)", fontStyle: "italic" }}>
                  ⚠ {ct.hazard.type === "gas_pocket" ? `Gas pockets ${(ct.hazard.chance*100).toFixed(0)}%` : `Lava timer ${ct.hazard.seconds}s`}
                </div>
              )}
            </>
          )}
        </div>

        {/* Stats */}
        <div style={{ padding: "8px 12px 14px", borderTop: "1px solid rgba(184,115,51,0.1)", fontSize: 8, fontFamily: "'JetBrains Mono', monospace", color: "rgba(245,240,232,0.15)" }}>
          <div>Scratches: {state.totalScratches}</div>
          <div>Best find: {state.sessionBest > 0 ? `${fmt(state.sessionBest)}g` : "—"}</div>
          <div>Max combo: {state.maxCombo > 0 ? `${state.maxCombo}×` : "—"}</div>
        </div>
      </div>

      {/* ═══ PRESTIGE MODAL ═══ */}
      {showPrestige && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(8,6,4,0.92)", backdropFilter: "blur(12px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
        }}>
          <div style={{
            background: "linear-gradient(150deg, #2A2015, #1A150D)", border: "1px solid rgba(196,101,42,0.35)",
            borderRadius: 14, padding: "28px 36px", maxWidth: 360, textAlign: "center",
            animation: "slideUp 0.3s ease-out", boxShadow: "0 0 60px rgba(192,64,32,0.15)",
          }}>
            <div style={{ fontSize: 9, letterSpacing: 3, textTransform: "uppercase", color: "#C04020", fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>Prestige</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#F5F0E8", marginBottom: 6 }}>Descend deeper</div>
            <p style={{ fontSize: 12, color: "rgba(245,240,232,0.4)", lineHeight: 1.5, marginBottom: 18 }}>
              Reset gold and upgrades. Your journal and prestige picks persist. New strata await below.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 18 }}>
              {[["Picks", Math.floor(Math.sqrt(state.totalGold/50)), "#D4A843"],
                ["New mult", `${(state.permanentMult + Math.floor(Math.sqrt(state.totalGold/50))*0.1).toFixed(1)}×`, "#B87333"]
              ].map(([l,v,c]) => (
                <div key={l} style={{ background: "rgba(40,32,22,0.6)", borderRadius: 7, padding: "7px 14px" }}>
                  <div style={{ fontSize: 8, color: "rgba(245,240,232,0.2)", fontFamily: "'JetBrains Mono', monospace" }}>{l}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button onClick={() => setShowPrestige(false)} style={{
                padding: "9px 22px", borderRadius: 7, background: "transparent",
                border: "1px solid rgba(245,240,232,0.15)", color: "rgba(245,240,232,0.4)",
                fontSize: 11, cursor: "pointer", fontFamily: "'Anybody', sans-serif",
              }}>Not yet</button>
              <button onClick={() => { dispatch({ type: "PRESTIGE" }); setShowPrestige(false); dispatch({ type: "NEW_CLAIM", claimType: "shallow_soil" }); }}
                style={{
                  padding: "9px 22px", borderRadius: 7, border: "none",
                  background: "linear-gradient(135deg, #C04020, #8B2500)", color: "#F5F0E8",
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Anybody', sans-serif",
                  boxShadow: "0 0 20px rgba(192,64,32,0.3)",
                }}
              >Descend ⛰</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
