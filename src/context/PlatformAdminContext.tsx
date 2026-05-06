import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabaseClient";
import { checkIsPlatformAdmin } from "../services/platformAdmin";

interface PlatformAdminContextValue {
  isPlatformAdmin: boolean;
  loading: boolean;
}

const PlatformAdminContext = createContext<PlatformAdminContextValue>({
  isPlatformAdmin: false,
  loading: true,
});

export const PlatformAdminProvider = ({ children }: { children: ReactNode }) => {
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id ?? null;
      const result = await checkIsPlatformAdmin(userId);
      if (cancelled) return;
      setIsPlatformAdmin(result);
      setLoading(false);
    };
    void refresh();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <PlatformAdminContext.Provider value={{ isPlatformAdmin, loading }}>
      {children}
    </PlatformAdminContext.Provider>
  );
};

export const usePlatformAdmin = () => useContext(PlatformAdminContext);
