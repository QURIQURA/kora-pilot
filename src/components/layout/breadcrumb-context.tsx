import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface CrumbSegment {
  label: string;
  path?: string;
}

interface BreadcrumbContextValue {
  segments: CrumbSegment[] | null;
  setSegments: (segments: CrumbSegment[] | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  segments: null,
  setSegments: () => {},
});

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [segments, setSegments] = useState<CrumbSegment[] | null>(null);
  const value = useMemo(() => ({ segments, setSegments }), [segments]);
  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbSegments() {
  return useContext(BreadcrumbContext).segments;
}

/** 상세 화면에서 breadcrumb 경로를 직접 지정한다. 언마운트 시 자동 해제. */
export function useSetBreadcrumb(segments: CrumbSegment[] | null) {
  const { setSegments } = useContext(BreadcrumbContext);
  const key = JSON.stringify(segments);
  useEffect(() => {
    setSegments(segments ? (JSON.parse(key) as CrumbSegment[]) : null);
    return () => setSegments(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setSegments]);
}
