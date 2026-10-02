import { getErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase-client';

export async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(getErrorMessage(error));
  return data as T;
}
