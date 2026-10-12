import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

const LIFE_MS = 900;

export default function CursorTrail() {
  const canvasRef = useRef(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");

    const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    const MAX_POINTS = isTouch ? 36 : 90;
    const MIN_DIST = isTouch ? 4 : 1;
    const DPR_CAP = isTouch ? 1.5 : 2;

    let points = [];
    let mouse = null;
    let lastScrollY = window.scrollY;
    let raf = null;
    let size = { w: 0, h: 0 };

    // Mobile par scroll se URL bar hide/show hota hai aur "resize" fire hota hai.
    // Sirf width badle ya height BADHE tab hi canvas dobara banao.
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w === size.w && h <= size.h) return;
      size = { w, h: w === size.w ? Math.max(h, size.h) : h };
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      canvas.width = size.w * dpr;
      canvas.height = size.h * dpr;
      canvas.style.width = `${size.w}px`;
      canvas.style.height = `${size.h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now) => {
      ctx.clearRect(0, 0, size.w, size.h);
      points = points.filter((p) => now - p.t < LIFE_MS);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        if (b.brk) continue;
        const life = 1 - (now - b.t) / LIFE_MS;
        const hue = 172 + 71 * (i / points.length);
        const width = (isTouch ? 2 : 1) + life * 3.5;

        if (isTouch) {
          // shadowBlur ki jagah halka chauda stroke (glow jaisa) — bahut sasta
          ctx.strokeStyle = `hsla(${hue}, 80%, 55%, ${life * 0.22})`;
          ctx.lineWidth = width * 2.4;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        } else {
          ctx.shadowColor = `hsla(${hue}, 80%, 55%, ${life * 0.6})`;
          ctx.shadowBlur = 10;
        }

        ctx.strokeStyle = `hsla(${hue}, 75%, 50%, ${life * 0.85})`;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      if (points.length > 1) {
        raf = requestAnimationFrame(draw);
      } else {
        raf = null;
        ctx.clearRect(0, 0, size.w, size.h);
      }
    };

    const start = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };

    const push = (x, y, brk = false) => {
      const last = points[points.length - 1];
      if (!brk && last && Math.hypot(x - last.x, y - last.y) < MIN_DIST) return;
      points.push({ x, y, t: performance.now(), brk });
      if (points.length > MAX_POINTS) points.shift();
      start();
    };

    const onPointerMove = (e) => {
      if (e.pointerType === "touch") return;
      mouse = { x: e.clientX, y: e.clientY };
      push(e.clientX, e.clientY);
    };

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

    const onScroll = () => {
      const dy = window.scrollY - lastScrollY;
      lastScrollY = window.scrollY;
      if (!mouse || !dy) return;
      points.forEach((p) => {
        p.y -= dy;
      });
      push(mouse.x, mouse.y);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    // capture:true => kisi element ke stopPropagation se bhi events miss nahi honge
    document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true, capture: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("touchstart", onTouchStart, { capture: true });
      document.removeEventListener("touchmove", onTouchMove, { capture: true });
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