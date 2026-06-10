import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

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
}

const ApprovalContext = createContext<ApprovalContextValue>({
  pendingApproval: null,
  openApproval: () => {},
  closeApproval: () => {},
});

export function ApprovalProvider({ children }: { children: ReactNode }) {
  const [pendingApproval, setPendingApproval] = useState<ApprovalData | null>(null);

  const openApproval = useCallback((data: ApprovalData) => {
    setPendingApproval(data);
  }, []);

  const closeApproval = useCallback(() => {
    setPendingApproval(null);
  }, []);

  return (
    <ApprovalContext.Provider value={{ pendingApproval, openApproval, closeApproval }}>
      {children}
    </ApprovalContext.Provider>
  );
}

export function useApproval() {
  return useContext(ApprovalContext);
}
