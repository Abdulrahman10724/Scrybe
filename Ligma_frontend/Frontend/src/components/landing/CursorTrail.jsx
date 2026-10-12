import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

const LIFE_MS = 1100;
const MAX_POINTS = 90;

export default function CursorTrail() {
  const canvasRef = useRef(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return undefined;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const isTouchDevice = window.matchMedia("(hover: none)").matches;
    let points = [];
    let mouse = null;
    let lastScrollY = window.scrollY;
    let raf = null;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now) => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      points = points.filter((p) => now - p.t < LIFE_MS);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        if (b.brk) continue; // naya stroke: purani line se na jode
        const life = 1 - (now - b.t) / LIFE_MS;
        const hue = 172 + 71 * (i / points.length);
        ctx.strokeStyle = `hsla(${hue}, 75%, 50%, ${life * 0.85})`;
        ctx.lineWidth = (isTouchDevice ? 2 : 1) + life * 3.5;
        ctx.shadowColor = `hsla(${hue}, 80%, 55%, ${life * 0.6})`;
        ctx.shadowBlur = isTouchDevice ? 6 : 10;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      if (points.length > 1) {
        raf = requestAnimationFrame(draw);
      } else {
        raf = null;
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    };

    const start = () => { if (!raf) raf = requestAnimationFrame(draw); };

    const push = (x, y, brk = false) => {
      points.push({ x, y, t: performance.now(), brk });
      if (points.length > MAX_POINTS) points.shift();
      start();
    };

    // Mouse / pen (touch ko ignore, uska alag handler hai)
    const onPointerMove = (e) => {
      if (e.pointerType === "touch") return;
      mouse = { x: e.clientX, y: e.clientY };
      push(e.clientX, e.clientY);
    };

    // Touch: jahan ungli, wahin trail
    const onTouchStart = (e) => {
      const t = e.touches[0];
      if (!t) return;
      mouse = null;
      push(t.clientX, t.clientY, true);
    };
    const onTouchMove = (e) => {
      const t = e.touches[0];
      if (!t) return;
      push(t.clientX, t.clientY);
    };

    // Scroll compensation sirf mouse ke liye
    const onScroll = () => {
      const dy = window.scrollY - lastScrollY;
      lastScrollY = window.scrollY;
      if (!mouse) return;
      points.forEach((p) => { p.y -= dy; });
      push(mouse.x, mouse.y);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduce]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: "fixed", top: 0, left: 0, pointerEvents: "none", zIndex: 45 }}
    />
  );
}