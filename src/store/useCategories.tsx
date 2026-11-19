import { useStore } from './useStore';
import { DEFAULT_CATEGORIES, newCustomType, typeInfo, visibleTypes } from '@/lib/categories';
import type { Categories, Holding, HoldingType, HoldingTypeId, ValuationMethod } from '@/lib/types';
import type { PickerOption } from '@/components/ui/picker';
import { toast } from '@/components/ui/toast';

const uniq = (list: string[], v: string) => (list.some((x) => x.toLowerCase() === v.toLowerCase()) ? list : [...list, v]);

/** User-editable categories plus ready-made picker options. */
export function useCategories() {
  const cats: Categories = useStore((s) => s.profile?.categories) ?? DEFAULT_CATEGORIES;
  const holdings = useStore((s) => s.holdings);
  const defaults = useStore((s) => s.profile?.defaultReturns);
  const patchProfile = useStore((s) => s.patchProfile);
  const save = (c: Partial<Categories>) => patchProfile({ categories: { ...cats, ...c } });

  const api = {
    cats,
    info: (t: HoldingTypeId) => typeInfo(t, cats, defaults),
    visible: () => visibleTypes(cats, defaults),
    hidden: () => cats.hiddenHoldingTypes.map((t) => typeInfo(t, cats, defaults)),
    restoreType: (t: HoldingType) => void save({ hiddenHoldingTypes: cats.hiddenHoldingTypes.filter((x) => x !== t) }),
    /** growth % for a type: built-ins live in defaultReturns, custom types on the type itself */
    setTypeReturn: (id: HoldingTypeId, pct: number) => {
      if (id.startsWith('c_')) void save({ holdingTypes: cats.holdingTypes.map((t) => (t.id === id ? { ...t, expectedReturn: pct } : t)) });
      else if (defaults) void patchProfile({ defaultReturns: { ...defaults, [id]: pct } });
    },
    addIncomeSource: (label: string) => { void save({ incomeSources: uniq(cats.incomeSources, label) }); return label; },
    removeIncomeSource: (label: string) => void save({ incomeSources: cats.incomeSources.filter((x) => x !== label) }),
    addReason: (label: string) => { void save({ withdrawReasons: uniq(cats.withdrawReasons, label) }); return label; },
    removeReason: (label: string) => void save({ withdrawReasons: cats.withdrawReasons.filter((x) => x !== label) }),
    addType: (label: string, valuation: ValuationMethod = 'market', expectedReturn = 6): HoldingTypeId => {
      const t = newCustomType(label, cats.holdingTypes, valuation, expectedReturn);
      void save({ holdingTypes: [...cats.holdingTypes, t] });
      return t.id;
    },
    removeType: (id: HoldingTypeId) => {
      if (holdings.some((h) => h.type === id)) { toast('Some holdings still use this type. Change them first, then delete it.', { tone: 'error' }); return; }
      if (id.startsWith('c_')) void save({ holdingTypes: cats.holdingTypes.filter((x) => x.id !== id) });
      else void save({ hiddenHoldingTypes: [...cats.hiddenHoldingTypes, id as HoldingType] });
    },
    restoreTypes: () => void save({ hiddenHoldingTypes: [] }),

    incomeOptions: (current?: string): PickerOption[] => {
      const list = current && !cats.incomeSources.includes(current) ? [...cats.incomeSources, current] : cats.incomeSources;
      return list.map((s) => ({ value: s, label: s, removable: true }));
    },
    reasonOptions: (current?: string): PickerOption[] => {
      const list = current && !cats.withdrawReasons.includes(current) ? [...cats.withdrawReasons, current] : cats.withdrawReasons;
      return list.map((s) => ({ value: s, label: s, removable: true }));
    },
    typeOptions: (current?: HoldingTypeId): PickerOption[] => {
      const list = visibleTypes(cats);
      if (current && !list.some((t) => t.id === current)) list.push(typeInfo(current, cats));
      return list.map((t) => ({ value: t.id, label: t.label, icon: <Dot color={t.color} />, removable: true }));
    },
    holdingOptions: (list: Holding[], opts: { allowNew?: boolean } = {}): PickerOption[] => [
      ...list.map((h) => ({ value: h.id, label: h.name, hint: typeInfo(h.type, cats).label, icon: <Dot color={typeInfo(h.type, cats).color} />, group: opts.allowNew ? 'Your holdings' : undefined })),
      ...(opts.allowNew ? visibleTypes(cats).map((t) => ({ value: `new:${t.id}`, label: `New ${t.label}`, icon: <Dot color={t.color} hollow />, group: 'Create new' })) : []),
    ],
  };
  return api;
}

export function Dot({ color, hollow }: { color: string; hollow?: boolean }) {
  return <span className="block h-2.5 w-2.5 rounded-full" style={hollow ? { boxShadow: `inset 0 0 0 2px ${color}` } : { backgroundColor: color }} />;
}
