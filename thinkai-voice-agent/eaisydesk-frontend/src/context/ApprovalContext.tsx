import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

export interface ApprovalData {
  interactionId?: number | null;
  sessionId?: string | null;
  clientName?: string;
  channel?: string;
  date?: string;
  topic?: string;
  summary?: string;
  aiDraftResponse?: string;
  approvalStatus?: string;
}

interface ApprovalContextValue {
  /** Currently open approval data, null when modal is closed */
  pendingApproval: ApprovalData | null;
  /** Open the approval modal with the given data */
  openApproval: (data: ApprovalData) => void;
  /** Close the approval modal */
  closeApproval: () => void;
  /** Register a callback to be called after a successful approval */
  registerOnApproved: (cb: () => void) => void;
  /** Trigger all registered onApproved callbacks */
  notifyApproved: () => void;
}

const ApprovalContext = createContext<ApprovalContextValue>({
  pendingApproval: null,
  openApproval: () => {},
  closeApproval: () => {},
  registerOnApproved: () => {},
  notifyApproved: () => {},
});

export function ApprovalProvider({ children }: { children: ReactNode }) {
  const [pendingApproval, setPendingApproval] = useState<ApprovalData | null>(null);
  const onApprovedCallbacks = useRef<Set<() => void>>(new Set());

  const openApproval = useCallback((data: ApprovalData) => {
    setPendingApproval(data);
  }, []);

  const closeApproval = useCallback(() => {
    setPendingApproval(null);
  }, []);

  const registerOnApproved = useCallback((cb: () => void) => {
    onApprovedCallbacks.current.add(cb);
  }, []);

  const notifyApproved = useCallback(() => {
    onApprovedCallbacks.current.forEach((cb) => cb());
  }, []);

  return (
    <ApprovalContext.Provider value={{ pendingApproval, openApproval, closeApproval, registerOnApproved, notifyApproved }}>
      {children}
    </ApprovalContext.Provider>
  );
}

export function useApproval() {
  return useContext(ApprovalContext);
}
