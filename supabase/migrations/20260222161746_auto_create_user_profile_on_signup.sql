/*
  # Auto-create user_profile on new auth user

  ## Summary
  When a new user is created in auth.users (via create-user edge function or Supabase dashboard),
  automatically insert a matching row into user_profiles so they appear in User Management.

  ## Changes
  - New function: `handle_new_user` — inserts a user_profiles row if it doesn't already exist
  - New trigger: `on_auth_user_created` — fires AFTER INSERT on auth.users
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
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    true,
    '#6b7280',
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
