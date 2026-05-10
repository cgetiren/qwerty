/*
  # Fix Istanbul Timezone Functions (v3)

  ## Problem
  Previous timezone functions had invalid timestamp format errors.
  Return types need to be changed, requiring function drops first.

  ## Changes
  - Drop all timezone functions and views
  - Recreate with correct single AT TIME ZONE conversion
  - Return types properly set as timestamp (without tz) for Istanbul times
*/

-- Drop functions first (return type change requires drop)
DROP FUNCTION IF EXISTS get_today_chats_istanbul();
DROP FUNCTION IF EXISTS get_date_range_chats_istanbul(date, date);
DROP FUNCTION IF EXISTS get_istanbul_now();
DROP FUNCTION IF EXISTS convert_to_istanbul(timestamptz);
DROP FUNCTION IF EXISTS get_istanbul_date_start(date);
DROP FUNCTION IF EXISTS get_istanbul_date_end(date);

-- Drop views
DROP VIEW IF EXISTS chats_istanbul;
DROP VIEW IF EXISTS chat_messages_istanbul;

-- Recreate helper functions
CREATE FUNCTION get_istanbul_now()
RETURNS timestamp
LANGUAGE sql
STABLE
AS $$
  SELECT (NOW() AT TIME ZONE 'Europe/Istanbul')::timestamp;
$$;

CREATE FUNCTION convert_to_istanbul(utc_time timestamptz)
RETURNS timestamp
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (utc_time AT TIME ZONE 'Europe/Istanbul')::timestamp;
$$;

CREATE FUNCTION get_istanbul_date_start(target_date date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT target_date AT TIME ZONE 'Europe/Istanbul';
$$;

CREATE FUNCTION get_istanbul_date_end(target_date date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (target_date + interval '1 day') AT TIME ZONE 'Europe/Istanbul' - interval '1 microsecond';
$$;

-- Recreate today's chats function
CREATE FUNCTION get_today_chats_istanbul()
RETURNS TABLE (
  id text,
  agent_name text,
  customer_name text,
  status text,
  created_at timestamptz,
  ended_at timestamptz,
  analyzed boolean,
  chat_data jsonb,
  created_at_istanbul timestamp
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT 
    c.id,
    c.agent_name,
    c.customer_name,
    c.status,
    c.created_at,
    c.ended_at,
    c.analyzed,
    c.chat_data,
    (c.created_at AT TIME ZONE 'Europe/Istanbul')::timestamp as created_at_istanbul
  FROM chats c
  WHERE c.created_at >= (CURRENT_DATE AT TIME ZONE 'Europe/Istanbul')
    AND c.created_at < ((CURRENT_DATE + interval '1 day') AT TIME ZONE 'Europe/Istanbul')
  ORDER BY c.created_at DESC;
$$;

-- Recreate date range function
CREATE FUNCTION get_date_range_chats_istanbul(
  date_from date,
  date_to date
)
RETURNS TABLE (
  id text,
  agent_name text,
  customer_name text,
  status text,
  created_at timestamptz,
  ended_at timestamptz,
  analyzed boolean,
  chat_data jsonb,
  created_at_istanbul timestamp
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT 
    c.id,
    c.agent_name,
    c.customer_name,
    c.status,
    c.created_at,
    c.ended_at,
    c.analyzed,
    c.chat_data,
    (c.created_at AT TIME ZONE 'Europe/Istanbul')::timestamp as created_at_istanbul
  FROM chats c
  WHERE c.created_at >= (date_from AT TIME ZONE 'Europe/Istanbul')
    AND c.created_at < ((date_to + interval '1 day') AT TIME ZONE 'Europe/Istanbul')
  ORDER BY c.created_at DESC;
$$;

-- Recreate views
CREATE VIEW chats_istanbul AS
SELECT 
  id,
  agent_name,
  customer_name,
  status,
  created_at,
  ended_at,
  analyzed,
  chat_data,
  (created_at AT TIME ZONE 'Europe/Istanbul')::timestamp as created_at_istanbul,
  (ended_at AT TIME ZONE 'Europe/Istanbul')::timestamp as ended_at_istanbul,
  DATE(created_at AT TIME ZONE 'Europe/Istanbul') as date_istanbul
FROM chats;

CREATE VIEW chat_messages_istanbul AS
SELECT 
  id,
  chat_id,
  author_type,
  text,
  is_system,
  created_at,
  (created_at AT TIME ZONE 'Europe/Istanbul')::timestamp as created_at_istanbul
FROM chat_messages;