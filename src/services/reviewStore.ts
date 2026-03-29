import { supabase } from './supabase.js';

export async function insertPerformanceReview(input: {
  summary: Record<string, unknown>;
  advisory: string | null;
}) {
  const { error } = await supabase.from('bot_reviews').insert({
    summary: input.summary,
    advisory: input.advisory
  });

  if (error) throw error;
}
