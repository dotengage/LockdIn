import { useEffect, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { GOAL_COLORS } from '@/lib/finance/constants';

/** A small, short confetti burst for reached goals. */
export function Confetti({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const pieces = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
    id: i, x: (Math.random() - 0.5) * 900, y: Math.random() * -500 - 150, r: Math.random() * 720 - 360,
    color: GOAL_COLORS[i % GOAL_COLORS.length], delay: Math.random() * 0.15, size: 6 + Math.random() * 6,
  })), []);
  useEffect(() => {
    const t = setTimeout(onDone, reduce ? 10 : 2200);
    return () => clearTimeout(t);
  }, [onDone, reduce]);
  if (reduce) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute left-1/2 top-1/2 rounded-sm"
          style={{ width: p.size, height: p.size * 0.5, backgroundColor: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 900], opacity: [1, 1, 0], rotate: p.r }}
          transition={{ duration: 2, delay: p.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}
