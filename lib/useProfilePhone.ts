import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';

// Contact-linking (see lib/phone.ts) depends entirely on profiles.phone
// being set, but it was previously only collected via an optional Settings
// field — most people never got there, so invites silently never reached
// them. This gates app entry until it's set.
export function useProfilePhone(userId?: string | null) {
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase.from('profiles').select('phone').eq('id', userId).maybeSingle();
    if (error) console.error('Error fetching profile phone:', error);
    setPhone(data?.phone || null);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  return { hasPhone: !!phone, loading, refresh };
}
