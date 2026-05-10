/*
  # Drop Old get_hourly_chat_distribution Function

  ## Problem
  There are two overloaded versions of `get_hourly_chat_distribution`:
  
  1. Old version: `(days_back integer)` - no brand support, returns integer counts
  2. New version: `(p_days_back integer, p_brand_id uuid)` - has brand support, returns bigint counts

  The frontend sends `{ days_back, p_brand_id }` which matches NEITHER function exactly,
  causing PostgREST to fail resolving the call. This results in hourly chat density data
  silently failing to load on the dashboard for all brands.

  ## Fix
  Drop the old function. Only the new brand-aware version should remain.
  The frontend will also be updated to send `p_days_back` instead of `days_back`.
*/

DROP FUNCTION IF EXISTS public.get_hourly_chat_distribution(days_back integer);
