import { useEffect } from "react";
import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import coinUrl from "@/assets/bidbot/coin.png";

export type CoinOrigin = { x: number; y: number };

export function TransitionCoin({ origin, onCovered, onComplete }: {
  origin: CoinOrigin;
  onCovered: () => void;
  onComplete: () => void;
}) {
  const coinControls = useAnimationControls();
  const wipeControls = useAnimationControls();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function launch() {
      await coinControls.start({
        x: 44,
        y: 20,
        rotate: 360,
        transition: reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 600, damping: 38 },
      });
      if (cancelled) return;
      await Promise.all([
        wipeControls.start({
          scale: 150,
          transition: { duration: reducedMotion ? 0 : 0.12, ease: "easeIn" },
        }),
        coinControls.start({
          scale: 0,
          opacity: 0,
          transition: { duration: reducedMotion ? 0 : 0.12 },
        }),
      ]);
      if (cancelled) return;
      onCovered();
      timer = setTimeout(onComplete, 60);
    }
    void launch();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      coinControls.stop();
      wipeControls.stop();
    };
  }, [coinControls, wipeControls, origin, reducedMotion, onCovered, onComplete]);

  return (
    <>
      <motion.div
        aria-hidden="true"
        data-testid="transition-wipe"
        className="pointer-events-none fixed left-0 top-0 z-40 h-6 w-6 rounded-full bg-transition-white"
        initial={{ x: 44, y: 20, scale: 0 }}
        animate={wipeControls}
      />
      <motion.div
        aria-hidden="true"
        data-testid="transition-coin"
        className="pointer-events-none fixed left-0 top-0 z-50 h-7 w-7 shadow-coin"
        initial={{ x: origin.x - 14, y: origin.y - 14, scale: 1 }}
        animate={coinControls}
      >
        <img src={coinUrl} alt="" className="h-full w-full rounded-full object-cover" />
      </motion.div>
    </>
  );
}
