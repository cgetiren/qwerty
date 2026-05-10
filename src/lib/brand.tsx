import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

export interface Brand {
  brand_id: string;
  brand_name: string;
  brand_slug: string;
  brand_color: string;
  brand_logo_url: string;
  is_active: boolean;
}

interface BrandContextType {
  brands: Brand[];
  activeBrand: Brand | null;
  loading: boolean;
  setActiveBrand: (brand: Brand) => void;
  reloadBrands: () => Promise<void>;
  isFounder: boolean;
}

const BrandContext = createContext<BrandContextType>({
  brands: [],
  activeBrand: null,
  loading: true,
  setActiveBrand: () => {},
  reloadBrands: async () => {},
  isFounder: false,
});

const ACTIVE_BRAND_KEY = 'livechat_qa_active_brand';

export function BrandProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [activeBrand, setActiveBrandState] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);

  const isFounder = profile?.is_founder ?? false;

  const loadBrands = useCallback(async () => {
    if (!session?.user?.id) {
      setBrands([]);
      setActiveBrandState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_user_brands');
      if (error) throw error;
      const list: Brand[] = data ?? [];
      setBrands(list);

      const savedId = localStorage.getItem(ACTIVE_BRAND_KEY);
      const saved = list.find(b => b.brand_id === savedId);
      if (saved) {
        setActiveBrandState(saved);
      } else if (list.length > 0) {
        setActiveBrandState(list[0]);
        localStorage.setItem(ACTIVE_BRAND_KEY, list[0].brand_id);
      } else {
        setActiveBrandState(null);
      }
    } catch {
      setBrands([]);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (session?.user?.id && profile !== undefined) {
      loadBrands();
    } else if (!session) {
      setBrands([]);
      setActiveBrandState(null);
      setLoading(false);
    }
  }, [session?.user?.id, profile, loadBrands]);

  const setActiveBrand = useCallback((brand: Brand) => {
    setActiveBrandState(brand);
    localStorage.setItem(ACTIVE_BRAND_KEY, brand.brand_id);
  }, []);

  return (
    <BrandContext.Provider value={{
      brands,
      activeBrand,
      loading,
      setActiveBrand,
      reloadBrands: loadBrands,
      isFounder,
    }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  return useContext(BrandContext);
}
