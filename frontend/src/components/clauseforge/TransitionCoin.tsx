import { useEffect } from "react";
import {
  motion,
  useAnimationControls,
  useReducedMotion,
} from "framer-motion";
import coinUrl from "@/assets/clauseforge/coin.png";

export type CoinOrigin = {
  x: number;
  y: number;
};

export function TransitionCoin({
  origin,
  onCovered,
  onComplete,
}: {
  origin: CoinOrigin;
  onCovered: () => void;
  onComplete: () => void;
}) {
  const coinControls = useAnimationControls();
  const wipeControls = useAnimationControls();
  const flashControls = useAnimationControls();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function launch() {
      const startX = origin.x - 16;
      const startY = origin.y - 16;
      const targetX = 44;
      const targetY = 20;

      // Use one continuous tween for the flight. Multiple position keyframes
      // introduced visible micro-pauses when the coin changed direction.
      // A single eased trajectory keeps the movement fluid from the button
      // all the way to the top-left impact point.
      const travelDuration = reducedMotion ? 0 : 0.68;
      const impactDuration = reducedMotion ? 0 : 0.2;

      await coinControls.start({
        x: targetX,
        y: targetY,
        rotate: reducedMotion ? 0 : 540,
        scale: reducedMotion ? 1 : 1.02,
        transition: reducedMotion
          ? { duration: 0 }
          : {
              duration: travelDuration,
              ease: [0.22, 1, 0.36, 1],
            },
      });

      if (cancelled) return;

      onCovered();

      await Promise.all([
        wipeControls.start({
          scale: 150,
          opacity: [0.96, 1, 1],
          transition: reducedMotion
            ? { duration: 0 }
            : {
                duration: impactDuration,
                ease: [0.16, 1, 0.3, 1],
              },
        }),
        flashControls.start({
          scale: [0, 3.5, 7],
          opacity: [0.75, 0.35, 0],
          transition: reducedMotion
            ? { duration: 0 }
            : {
                duration: impactDuration,
                ease: "easeOut",
              },
        }),
        coinControls.start({
          scale: reducedMotion ? 0 : [1.02, 1.12, 0],
          opacity: [1, 1, 0],
          transition: reducedMotion
            ? { duration: 0 }
            : {
                duration: impactDuration,
                ease: [0.22, 1, 0.36, 1],
              },
        }),
      ]);

      if (cancelled) return;

      timer = setTimeout(
        onComplete,
        reducedMotion ? 0 : 75,
      );
    }

    void launch();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      coinControls.stop();
      wipeControls.stop();
      flashControls.stop();
    };
  }, [
    coinControls,
    wipeControls,
    flashControls,
    origin,
    reducedMotion,
    onCovered,
    onComplete,
  ]);

  return (
    <>
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-40 h-6 w-6 rounded-full bg-transition-white"
        initial={{
          x: 44,
          y: 20,
          scale: 0,
          opacity: 0,
        }}
        animate={wipeControls}
      />

      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[45] h-12 w-12 rounded-full border border-white/60"
        initial={{
          x: 32,
          y: 8,
          scale: 0,
          opacity: 0,
        }}
        animate={flashControls}
      />

      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-50 h-8 w-8"
        initial={{
          x: origin.x - 16,
          y: origin.y - 16,
          scale: 1,
          opacity: 1,
        }}
        animate={coinControls}
      >
        <div className="absolute inset-0 rounded-full bg-white/10 blur-[3px]" />

        <div className="absolute inset-0 rounded-full p-[1px] shadow-[0_0_20px_rgba(255,255,255,0.38),0_6px_18px_rgba(0,0,0,0.35)]">
          <div className="h-full w-full rounded-full bg-black/15 p-[1px]">
            <img
              src={coinUrl}
              alt=""
              className="h-full w-full rounded-full object-cover"
            />
          </div>
        </div>

        <div className="pointer-events-none absolute left-[18%] top-[14%] h-[20%] w-[36%] rotate-[18deg] rounded-full bg-white/45 blur-[1px]" />
      </motion.div>
    </>
  );
}
