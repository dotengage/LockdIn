import { useStore } from '@/store/useStore';
import { useDerived } from '@/store/useDerived';
import { formatINRShort } from '@/lib/finance/format';
import { InfoTip } from '@/components/ui/infotip';

/** One quiet line when goals together need more than you can save each month. */
export function CapacityWarning() {
  const profile = useStore((s) => s.profile);
  const d = useDerived();
  const cap = profile?.monthlySavingCapacity ?? 0;
  const needed = d.totalRequired;
  if (!d.activeGoals.length || needed <= cap + 1) return null;
  return (
    <p className="mb-5 flex items-center gap-1.5 text-sm text-muted">
      Together your goals need {formatINRShort(needed)} a month. You can save {formatINRShort(cap)}.
      <InfoTip>High-priority goals come first. Open a goal to see simple ways to catch up, like a later date or a smaller target.</InfoTip>
    </p>
  );
}
