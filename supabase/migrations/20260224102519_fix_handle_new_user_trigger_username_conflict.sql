/*
  # Fix handle_new_user trigger — prevent username unique constraint conflict

  ## Problem
  The existing trigger uses `split_part(NEW.email, '@', 1)` as a fallback username.
  If that email prefix is already taken by another user's username, the INSERT fails
  with a unique constraint violation, which rolls back the entire `auth.admin.createUser()` call.
  The user creation silently fails even though all form fields are filled correctly.

  ## Fix
  - Use `raw_user_meta_data->>'username'` if provided (edge function now passes it)
  - Fall back to NULL instead of the email prefix — username is nullable, so this is safe
  - The edge function's upsert will set the final username value after auth user creation

  ## Changes
  - `handle_new_user` function: fallback username is now NULL instead of email prefix
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, username, is_active, avatar_color, is_founder)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1)),
    NULLIF(NEW.raw_user_meta_data->>'username', ''),
    true,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'avatar_color', ''), '#6b7280'),
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
