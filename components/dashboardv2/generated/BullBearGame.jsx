import React, { useCallback, useEffect, useRef } from "react";

/*
Manual QA checklist
- Game starts correctly.
- Bull controls feel responsive.
- Flyers first appear at score 10.
- Flyers move faster than the background.
- Correct bear icon is shown.
- No invisible collisions.
- Ceiling spikes kill correctly.
- Best score persists after refresh.
- Canvas scales correctly on desktop and mobile.
- No console errors during play.
*/

// =============================================================
// Bull & Bear - Pixel Dino-style (16:9) - React + Canvas (JSX)
// Production-focused pass: stable loop, fair flyer hitbox, safe storage,
// no gameplay RNG in render, scoped pointer input.
// =============================================================

// ------------------ Pixel Grid ------------------
const PIX = 6;
const snap = (n) => Math.round(n / PIX) * PIX;

// ------------------ World & Physics ------------------
const WORLD_W = 1920;
const WORLD_H = 1080;
const GRAVITY = 2400;
const FLAP_IMPULSE = -1012.5;
const START_SCROLL = 300;
const MAX_SCROLL = 6000;
const RAMP_EVERY = 2;
const RAMP_DELTA = 26;
const AVATAR_X = WORLD_W * 0.28;
const HITBOX_RADIUS = 38;
const FLOOR_MARGIN = 40;
const CEILING_H = 24;
const CEILING_SPIKE_W = snap(48);
const MIN_TOP_GAP = 180;
const MAX_DT = 0.033;

// ------------------ Palette ------------------
const FG = "#111111";
const BG = "#f7f7f7";
const HUD = "#111111";

// ------------------ Obstacles (Candles) ------------------
const CANDLE_SPACING_X = 420;
const CANDLE_W = snap(96);
const WICK_W = snap(6);
const BODY_MIN = snap(160);
const BODY_MAX = snap(585);
const DOJI_BODY_MIN = snap(30);
const DOJI_BODY_MAX = snap(48);

// ------------------ Flyers (Bears) ------------------
const FLYER_IMG_URL = "data:image/png;base64,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";
const FLYER_W = snap(108);
const FLYER_H = snap(108);
const FLYER_HITBOX_W = snap(78);
const FLYER_HITBOX_H = snap(78);
const FLYER_MIN_CY = CEILING_H + FLYER_H / 2 + PIX * 2;
const FLYER_MAX_CY = WORLD_H - FLOOR_MARGIN - FLYER_H / 2 - PIX * 2;
const FLYER_BASE_INTERVAL = 2.2;
const FLYER_MIN_INTERVAL = 0.8;
const FLYER_START_SCORE = 10;
const FLYER_MIN_SPEED = 240;
const FLYER_SPEED_MULT = 0.35;
const FLYER_SPEED_ADD = 180;
const FLYER_SPEED_PER_SCORE = 0.6;
const FLYER_SPEED_CAP = 1400;

const BEST_KEY = "bb_best";

// ------------------ Helpers ------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function circleRectCollision(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

function makeRNG(seed = Math.floor(Date.now() / 60000)) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function readBestScore() {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    if (!raw) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
  } catch {
    return 0;
  }
}

function writeBestScore(score) {
  if (typeof window === "undefined") return;
  try {
    const normalized = Math.max(0, Math.floor(score));
    window.localStorage.setItem(BEST_KEY, String(normalized));
  } catch {
    // no-op: private mode / blocked storage
  }
}

function assertInvariant(condition, message) {
  if (!condition && typeof console !== "undefined") {
    console.error(`[BullBear] Invariant failed: ${message}`);
  }
}

function validateConfig() {
  assertInvariant(WORLD_W / WORLD_H === 16 / 9, "world must stay 16:9");
  assertInvariant(
    FLYER_IMG_URL.startsWith("data:image/png;base64,"),
    "flyer asset must be embedded PNG data URI"
  );
  assertInvariant(WORLD_W > 0 && WORLD_H > 0, "world dimensions must be positive");
  assertInvariant(START_SCROLL > 0 && MAX_SCROLL > START_SCROLL, "scroll bounds must be sane");
  assertInvariant(CANDLE_SPACING_X > 0 && CANDLE_W > 0, "candle dimensions must be positive");
  assertInvariant(FLYER_W > 0 && FLYER_H > 0, "flyer dimensions must be positive");
  assertInvariant(
    FLYER_MIN_CY > CEILING_H && FLYER_MAX_CY < WORLD_H - FLOOR_MARGIN,
    "flyer spawn band must stay in bounds"
  );
  assertInvariant(FLYER_START_SCORE === 10, "flyers must start at score 10");

  const hitboxArea = FLYER_HITBOX_W * FLYER_HITBOX_H;
  const spriteArea = FLYER_W * FLYER_H;
  assertInvariant(
    FLYER_HITBOX_W <= FLYER_W && FLYER_HITBOX_H <= FLYER_H,
    "flyer hitbox must fit inside flyer sprite"
  );
  assertInvariant(
    hitboxArea >= spriteArea * 0.45 && hitboxArea <= spriteArea * 0.9,
    "flyer hitbox area should be fair"
  );

  const minFlyerVelocity = Math.max(START_SCROLL, FLYER_MIN_SPEED) * (1 + FLYER_SPEED_MULT) +
    FLYER_SPEED_ADD;
  assertInvariant(minFlyerVelocity > START_SCROLL, "flyers must move faster than the background");
}

function generatePebbles(seed) {
  const rng = makeRNG(seed);
  const pebbles = [];
  for (let i = 0; i < 18; i++) {
    if (rng() < 0.6) continue;
    const x = snap(60 + rng() * (WORLD_W - 120));
    const y = snap(WORLD_H - FLOOR_MARGIN + PIX * (rng() < 0.6 ? 2 : 1));
    pebbles.push({ x, y, w: snap(PIX), h: snap(PIX) });
  }
  return pebbles;
}

function useDPR(canvasRef) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onResize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const cssW = parent.clientWidth;
      const cssH = Math.floor((cssW * WORLD_H) / WORLD_W);
      const dpr = window.devicePixelRatio || 1;

      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
    };

    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [canvasRef]);
}

export default function BullBearGame() {
  const canvasRef = useRef(null);
  useDPR(canvasRef);

  const ctxRef = useRef(null);
  const lastRef = useRef(0);
  const rafRef = useRef(0);

  const stateRef = useRef("menu");
  const scoreRef = useRef(0);
  const bestRef = useRef(0);

  const rngRef = useRef(makeRNG());
  const pebblesRef = useRef([]);

  const avatarRef = useRef({ x: AVATAR_X, y: WORLD_H * 0.72, vy: 0 });
  const candlesRef = useRef([]);
  const flyersRef = useRef([]);
  const firstFlyerSpawnedRef = useRef(false);
  const flyerImgRef = useRef(null);
  const flyerImgReadyRef = useRef(false);

  const speedRef = useRef(START_SCROLL);
  const flapRef = useRef(0);
  const flyerTimerRef = useRef(0);

  const setGameState = useCallback((nextState) => {
    stateRef.current = nextState;

    if (nextState === "over") {
      const nextBest = Math.max(bestRef.current, scoreRef.current);
      if (nextBest !== bestRef.current) {
        bestRef.current = nextBest;
        writeBestScore(nextBest);
      }
    }
  }, []);

  const makeCandle = useCallback((x) => {
    const rng = rngRef.current;
    const r = rng();

    let type = "marubozu";
    let bodyH;
    let wickUp;

    if (r < 0.35) {
      type = "marubozu";
      bodyH = BODY_MIN + rng() * (BODY_MAX - BODY_MIN);
      wickUp = snap(36 + rng() * 84);
    } else if (r < 0.55) {
      type = "doji";
      bodyH = DOJI_BODY_MIN + rng() * (DOJI_BODY_MAX - DOJI_BODY_MIN);
      wickUp = snap(180 + rng() * 160);
    } else if (r < 0.775) {
      type = "hammer";
      bodyH = DOJI_BODY_MIN + rng() * (DOJI_BODY_MAX - DOJI_BODY_MIN);
      wickUp = snap(10 + rng() * 32);
    } else {
      type = "shooting";
      bodyH = DOJI_BODY_MIN + rng() * (DOJI_BODY_MAX - DOJI_BODY_MIN);
      wickUp = snap(180 + rng() * 160);
    }

    const maxTotal = WORLD_H - FLOOR_MARGIN - MIN_TOP_GAP;
    const total = bodyH + wickUp;
    if (total > maxTotal) wickUp = Math.max(0, snap(maxTotal - bodyH));

    return {
      x,
      bodyH: snap(bodyH),
      wickUp: snap(wickUp),
      type,
      scored: false,
    };
  }, []);

  const resetWorld = useCallback(() => {
    lastRef.current = 0;
    rngRef.current = makeRNG();

    const decorSeed = ((Date.now() & 0xffffffff) ^ 0x9e3779b9) >>> 0;
    pebblesRef.current = generatePebbles(decorSeed);

    avatarRef.current = { x: AVATAR_X, y: WORLD_H * 0.72, vy: 0 };
    candlesRef.current = [];
    flyersRef.current = [];
    firstFlyerSpawnedRef.current = false;
    flyerTimerRef.current = 0;
    speedRef.current = START_SCROLL;
    flapRef.current = 0;
    scoreRef.current = 0;

    let x = WORLD_W * 1.1;
    for (let i = 0; i < 6; i++) {
      candlesRef.current.push(makeCandle(x));
      x += CANDLE_SPACING_X;
    }
  }, [makeCandle]);

  const spawnFlyer = useCallback(() => {
    const rng = rngRef.current;
    const cy = snap(FLYER_MIN_CY + rng() * Math.max(PIX, FLYER_MAX_CY - FLYER_MIN_CY));
    const cx = WORLD_W + FLYER_W;
    flyersRef.current.push({ cx, cy });
  }, []);

  const start = useCallback(() => {
    resetWorld();
    setGameState("run");
    flapRef.current += 1;
  }, [resetWorld, setGameState]);

  const handleInput = useCallback(() => {
    const mode = stateRef.current;
    if (mode === "menu" || mode === "over") {
      start();
      return;
    }
    if (mode === "run") {
      flapRef.current += 1;
    }
  }, [start]);

  const onPointerDown = useCallback(
    (event) => {
      event.preventDefault();
      handleInput();
    },
    [handleInput]
  );

  const update = useCallback(
    (dt) => {
      const avatar = avatarRef.current;
      const candles = candlesRef.current;
      const flyers = flyersRef.current;

      if (flapRef.current > 0) {
        avatar.vy = FLAP_IMPULSE;
        flapRef.current = 0;
      }

      avatar.vy += GRAVITY * dt;
      avatar.y += avatar.vy * dt;

      if (avatar.y - HITBOX_RADIUS < CEILING_H) return false;
      const floorY = WORLD_H - FLOOR_MARGIN;
      if (avatar.y + HITBOX_RADIUS > floorY) return false;

      const scroll = speedRef.current;
      for (const candle of candles) candle.x -= scroll * dt;

      for (const flyer of flyers) {
        const extra = Math.min(
          FLYER_SPEED_CAP,
          FLYER_SPEED_ADD + FLYER_SPEED_PER_SCORE * scoreRef.current
        );
        const vx = Math.max(scroll, FLYER_MIN_SPEED) * (1 + FLYER_SPEED_MULT) + extra;
        flyer.cx -= vx * dt;
      }

      const lastCandle = candles[candles.length - 1];
      if (lastCandle && lastCandle.x < WORLD_W + CANDLE_SPACING_X * 0.5) {
        candles.push(makeCandle(lastCandle.x + CANDLE_SPACING_X));
      }
      while (candles.length && candles[0].x + CANDLE_W / 2 < -20) candles.shift();

      if (flyerImgReadyRef.current && scoreRef.current >= FLYER_START_SCORE) {
        if (!firstFlyerSpawnedRef.current) {
          spawnFlyer();
          firstFlyerSpawnedRef.current = true;
        }

        const targetInterval = Math.max(
          FLYER_MIN_INTERVAL,
          FLYER_BASE_INTERVAL - (scoreRef.current - FLYER_START_SCORE) * 0.008
        );
        flyerTimerRef.current += dt;

        while (flyerTimerRef.current >= targetInterval) {
          flyerTimerRef.current -= targetInterval;
          spawnFlyer();
        }
      }

      flyersRef.current = flyers.filter((flyer) => flyer.cx + FLYER_W / 2 > -20);

      const backX = avatar.x - HITBOX_RADIUS;
      let gained = 0;
      let alive = true;

      for (const candle of candles) {
        const bodyTop = snap(floorY - candle.bodyH);
        const bodyLeft = snap(candle.x - CANDLE_W / 2);
        const wickTop = snap(bodyTop - candle.wickUp);
        const wickLeft = snap(candle.x - WICK_W / 2);

        const hitBody = circleRectCollision(
          avatar.x,
          avatar.y,
          HITBOX_RADIUS,
          bodyLeft,
          bodyTop,
          CANDLE_W,
          candle.bodyH
        );
        const hitWick = circleRectCollision(
          avatar.x,
          avatar.y,
          HITBOX_RADIUS,
          wickLeft,
          wickTop,
          WICK_W,
          candle.wickUp
        );

        if (hitBody || hitWick) {
          alive = false;
          break;
        }

        const candleRight = candle.x + CANDLE_W / 2;
        if (!candle.scored && candleRight < backX) {
          candle.scored = true;
          gained += 1;
        }
      }

      if (alive) {
        for (const flyer of flyersRef.current) {
          const rx = flyer.cx - FLYER_HITBOX_W / 2;
          const ry = flyer.cy - FLYER_HITBOX_H / 2;
          if (
            circleRectCollision(
              avatar.x,
              avatar.y,
              HITBOX_RADIUS,
              rx,
              ry,
              FLYER_HITBOX_W,
              FLYER_HITBOX_H
            )
          ) {
            alive = false;
            break;
          }
        }
      }

      if (!alive) return false;

      if (gained > 0) {
        const prev = scoreRef.current;
        const next = prev + gained;
        scoreRef.current = next;

        const prevMilestone = Math.floor(prev / RAMP_EVERY);
        const nextMilestone = Math.floor(next / RAMP_EVERY);
        const milestoneDelta = nextMilestone - prevMilestone;

        if (milestoneDelta > 0) {
          let delta = RAMP_DELTA;
          if (next >= 200) delta += 10;
          if (next >= 400) delta += 8;
          speedRef.current = Math.min(MAX_SCROLL, speedRef.current + milestoneDelta * delta);
        }
      }

      return true;
    },
    [makeCandle, spawnFlyer]
  );

  const drawCeilingSpikes = useCallback((ctx) => {
    ctx.fillStyle = FG;
    for (let x0 = 0; x0 < WORLD_W; x0 += CEILING_SPIKE_W) {
      const mid = x0 + CEILING_SPIKE_W / 2;
      for (let y = 0; y < CEILING_H; y += PIX) {
        const frac = y / CEILING_H;
        const half = (CEILING_SPIKE_W / 2) * (1 - frac);
        const left = snap(mid - half);
        const width = snap(Math.max(PIX, half * 2));
        ctx.fillRect(left, snap(y), width, snap(PIX));
      }
    }
  }, []);

  const drawFlyer = useCallback((ctx, cx, cy) => {
    const img = flyerImgRef.current;
    if (!img || !flyerImgReadyRef.current) return;
    const x = snap(cx - FLYER_W / 2);
    const y = snap(cy - FLYER_H / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, x, y, FLYER_W, FLYER_H);
  }, []);

  const drawPixelBull = useCallback((ctx, cx, cy) => {
    const s = PIX;
    const width = 18;
    const height = 14;
    const ox = cx - Math.floor(width / 2) * s;
    const oy = cy - Math.floor(height / 2) * s;

    const block = (x, y, w = 1, h = 1) => ctx.fillRect(ox + x * s, oy + y * s, w * s, h * s);

    ctx.fillStyle = FG;

    block(2, 0, 2, 1);
    block(1, 1, 2, 1);
    block(0, 2, 2, 1);
    block(1, 3, 3, 1);
    block(14, 0, 2, 1);
    block(15, 1, 2, 1);
    block(16, 2, 2, 1);
    block(14, 3, 3, 1);

    block(5, 3, 8, 6);
    block(6, 2, 6, 1);
    block(6, 9, 6, 1);

    block(5, 5, 8, 1);

    block(4, 5, 1, 3);
    block(13, 5, 1, 3);

    block(7, 10, 4, 2);

    block(6, 6, 1, 1);
    block(11, 6, 1, 1);
  }, []);

  const drawWorld = useCallback(
    (ctx) => {
      const floorY = WORLD_H - FLOOR_MARGIN;

      ctx.fillStyle = FG;
      ctx.fillRect(snap(0), snap(floorY), snap(WORLD_W), snap(PIX));

      drawCeilingSpikes(ctx);

      ctx.fillStyle = FG;
      for (const pebble of pebblesRef.current) {
        ctx.fillRect(pebble.x, pebble.y, pebble.w, pebble.h);
      }

      for (const candle of candlesRef.current) {
        const bodyTop = snap(floorY - candle.bodyH);
        const bodyLeft = snap(candle.x - CANDLE_W / 2);
        const wickTop = snap(bodyTop - candle.wickUp);
        const wickLeft = snap(candle.x - WICK_W / 2);
        ctx.fillRect(wickLeft, wickTop, snap(WICK_W), snap(candle.wickUp));
        ctx.fillRect(bodyLeft, bodyTop, snap(CANDLE_W), snap(candle.bodyH));
      }

      for (const flyer of flyersRef.current) {
        drawFlyer(ctx, snap(flyer.cx), snap(flyer.cy));
      }

      const avatar = avatarRef.current;
      drawPixelBull(ctx, snap(avatar.x), snap(avatar.y));
    },
    [drawCeilingSpikes, drawFlyer, drawPixelBull]
  );

  const drawHUD = useCallback((ctx, mode) => {
    ctx.fillStyle = HUD;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (mode === "menu") {
      ctx.font = "bold 72px ui-sans-serif, system-ui, -apple-system, Segoe UI";
      ctx.fillText("Bull & Bear", WORLD_W / 2, WORLD_H * 0.35);
      ctx.font = "600 36px ui-sans-serif, system-ui, -apple-system, Segoe UI";
      ctx.fillText("Tap / Space / Up to start", WORLD_W / 2, WORLD_H * 0.45);
      return;
    }

    if (mode === "run") {
      ctx.font = "bold 72px ui-sans-serif, system-ui, -apple-system, Segoe UI";
      ctx.fillText(String(scoreRef.current), WORLD_W / 2, snap(180));
      return;
    }

    ctx.font = "bold 72px ui-sans-serif, system-ui, -apple-system, Segoe UI";
    ctx.fillText("Game Over", WORLD_W / 2, WORLD_H * 0.35);
    ctx.font = "600 36px ui-sans-serif, system-ui, -apple-system, Segoe UI";
    ctx.fillText(
      `Score: ${scoreRef.current} | Best: ${bestRef.current}`,
      WORLD_W / 2,
      WORLD_H * 0.45
    );
    ctx.fillText("Tap / Space / Up to retry", WORLD_W / 2, WORLD_H * 0.55);
  }, []);

  useEffect(() => {
    validateConfig();
    bestRef.current = readBestScore();
    resetWorld();
  }, [resetWorld]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat) return;
      if (event.code === "Space" || event.code === "ArrowUp") {
        event.preventDefault();
        handleInput();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleInput]);

  useEffect(() => {
    const img = new Image();
    let settled = false;

    const markReady = () => {
      if (settled) return;
      settled = true;
      flyerImgRef.current = img;
      flyerImgReadyRef.current = true;
    };

    const markError = () => {
      if (settled) return;
      settled = true;
      flyerImgRef.current = null;
      flyerImgReadyRef.current = false;
      assertInvariant(false, "flyer image failed to decode");
    };

    img.decoding = "sync";
    img.onload = markReady;
    img.onerror = markError;
    img.src = FLYER_IMG_URL;

    // Handle already-cached data URIs that may complete immediately.
    if (img.complete) {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) markReady();
      else markError();
    }

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctxRef.current = ctx;

    const loop = (ts) => {
      const gameCtx = ctxRef.current;
      if (!gameCtx) return;

      const dpr = window.devicePixelRatio || 1;

      const w = gameCtx.canvas.width / dpr;
      const h = gameCtx.canvas.height / dpr;

      if (!lastRef.current) lastRef.current = ts;
      let dt = (ts - lastRef.current) / 1000;
      lastRef.current = ts;
      dt = Math.min(dt, MAX_DT);

      gameCtx.save();
      gameCtx.scale(dpr, dpr);
      gameCtx.imageSmoothingEnabled = false;
      gameCtx.fillStyle = BG;
      gameCtx.fillRect(0, 0, w, h);

      const scale = Math.min(w / WORLD_W, h / WORLD_H);
      const ox = (w - WORLD_W * scale) / 2;
      const oy = (h - WORLD_H * scale) / 2;
      gameCtx.translate(ox, oy);
      gameCtx.scale(scale, scale);

      const mode = stateRef.current;
      if (mode === "run") {
        const alive = update(dt);
        drawWorld(gameCtx);
        if (!alive) setGameState("over");
        drawHUD(gameCtx, "run");
      } else if (mode === "menu") {
        drawWorld(gameCtx);
        drawHUD(gameCtx, "menu");
      } else {
        drawWorld(gameCtx);
        drawHUD(gameCtx, "over");
      }

      gameCtx.restore();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawHUD, drawWorld, setGameState, update]);

  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        width: "100%",
        maxWidth: 960,
        margin: "0 auto",
        padding: "12px 0",
        background: BG,
        userSelect: "none",
        touchAction: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          outline: "none",
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}





