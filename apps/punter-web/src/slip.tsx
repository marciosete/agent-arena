import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/** What a price button hands the slip: enough to render and to submit. */
export interface SlipSelection {
  marketId: string;
  marketName: string;
  selectionId: string;
  selectionName: string;
  price: number;
}

interface SlipValue {
  selection: SlipSelection | null;
  isOpen: boolean;
  /** Load a selection and slide the drawer in (from any page). */
  openSlip: (selection: SlipSelection) => void;
  /** Header toggle: open (possibly empty) or close. */
  toggleSlip: () => void;
  closeSlip: () => void;
  /** Drop the loaded selection and close — after a placed bet or a declined price move. */
  clearSlip: () => void;
}

const SlipContext = createContext<SlipValue | null>(null);

export function SlipProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [selection, setSelection] = useState<SlipSelection | null>(null);
  const [isOpen, setOpen] = useState(false);

  const openSlip = useCallback((next: SlipSelection) => {
    setSelection(next);
    setOpen(true);
  }, []);
  const toggleSlip = useCallback(() => setOpen((open) => !open), []);
  const closeSlip = useCallback(() => setOpen(false), []);
  const clearSlip = useCallback(() => {
    setSelection(null);
    setOpen(false);
  }, []);

  const value = useMemo(
    () => ({ selection, isOpen, openSlip, toggleSlip, closeSlip, clearSlip }),
    [selection, isOpen, openSlip, toggleSlip, closeSlip, clearSlip]
  );
  return <SlipContext.Provider value={value}>{children}</SlipContext.Provider>;
}

export function useSlip(): SlipValue {
  const ctx = useContext(SlipContext);
  if (!ctx) {
    throw new Error('useSlip() must be used within a <SlipProvider>.');
  }
  return ctx;
}
