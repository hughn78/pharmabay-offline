import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useLocalAutosave<T>(
  draftId: string | null,
  tableName: 'ebay_drafts' | 'shopify_drafts',
  currentData: T,
  intervalMs = 30000
) {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const dataRef = useRef(currentData);

  useEffect(() => {
    dataRef.current = currentData;
  }, [currentData]);

  useEffect(() => {
    if (!draftId) return;

    const saveTimer = setInterval(async () => {
      try {
        const { error } = await supabase
          .from(tableName)
          .update(dataRef.current)
          .eq('id', draftId);
          
        if (!error) {
          setLastSaved(new Date());
        }
      } catch (err: any) {
        console.error('Autosave failed:', err);
      }
    }, intervalMs);

    return () => clearInterval(saveTimer);
  }, [draftId, tableName, intervalMs]);

  const forceSave = async () => {
    if (!draftId) return;
    try {
      const { error } = await supabase
        .from(tableName)
        .update(dataRef.current)
        .eq('id', draftId);
      if (!error) {
        setLastSaved(new Date());
        toast.success('Draft saved');
      } else {
         toast.error('Draft save failed');
      }
    } catch (err) {
      toast.error('Draft save failed');
    }
  };

  return { lastSaved, forceSave };
}
