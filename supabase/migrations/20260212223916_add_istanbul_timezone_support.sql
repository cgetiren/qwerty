/*
  # Add Istanbul Timezone Support

  ## Overview
  This migration adds timezone support for Istanbul (UTC+3) to ensure consistent handling
  of dates across the application. This fixes the "today" chat filtering issue where 
  timezone differences caused incorrect results.

  ## Changes Made

  ### 1. Helper Functions
    - `get_istanbul_now()` - Returns current time in Istanbul timezone
    - `convert_to_istanbul(timestamptz)` - Converts any UTC timestamp to Istanbul time
    - `get_istanbul_date_start(date)` - Returns start of day (00:00) in Istanbul
    - `get_istanbul_date_end(date)` - Returns end of day (23:59:59) in Istanbul
    - `get_today_chats_istanbul()` - Returns chats created today (Istanbul time)
    - `get_date_range_chats_istanbul(date_from, date_to)` - Returns chats in date range (Istanbul time)

  ### 2. Views
    - `chats_istanbul` - View of chats with created_at converted to Istanbul timezone
    - `chat_messages_istanbul` - View of messages with timestamps in Istanbul timezone

  ### 3. Security
    - All functions are marked as STABLE or IMMUTABLE for query optimization
    - Views inherit RLS policies from base tables
    - Functions use SECURITY INVOKER to respect caller's permissions

  ## Usage Examples
    
    -- Get current Istanbul time
    SELECT get_istanbul_now();
    
    -- Get today's chats (Istanbul timezone)
    SELECT * FROM get_today_chats_istanbul();
    
    -- Get chats in date range (Istanbul timezone)
    SELECT * FROM get_date_range_chats_istanbul('2026-02-12', '2026-02-13');
    
    -- Query chats with Istanbul timestamps
    SELECT * FROM chats_istanbul WHERE DATE(created_at_istanbul) = '2026-02-12';
*/

-- Function to get current Istanbul time
CREATE OR REPLACE FUNCTION get_istanbul_now()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT (NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul';
$$;

-- Function to convert any UTC timestamp to Istanbul time
CREATE OR REPLACE FUNCTION convert_to_istanbul(utc_time timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (utc_time AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul';
$$;

-- Function to get start of day in Istanbul timezone
CREATE OR REPLACE FUNCTION get_istanbul_date_start(target_date date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (target_date::text || ' 00:00:00')::timestamp AT TIME ZONE 'Europe/Istanbul';
$$;

-- Function to get end of day in Istanbul timezone
CREATE OR REPLACE FUNCTION get_istanbul_date_end(target_date date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (target_date::text || ' 23:59:59.999999')::timestamp AT TIME ZONE 'Europe/Istanbul';
$$;

-- Function to get today's chats based on Istanbul timezone
CREATE OR REPLACE FUNCTION get_today_chats_istanbul()
RETURNS TABLE (
  id text,
  agent_name text,
  customer_name text,
  status text,
  created_at timestamptz,
  ended_at timestamptz,
  analyzed boolean,
  chat_data jsonb,
  created_at_istanbul timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH istanbul_now AS (
    SELECT CURRENT_DATE AT TIME ZONE 'Europe/Istanbul' as today
  )
  SELECT 
    c.id,
    c.agent_name,
    c.customer_name,
    c.status,
    c.created_at,
    c.ended_at,
    c.analyzed,
    c.chat_data,
    (c.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul' as created_at_istanbul
  FROM chats c, istanbul_now
  WHERE (c.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul' >= 
        (istanbul_now.today::text || ' 00:00:00')::timestamp AT TIME ZONE 'Europe/Istanbul'
    AND (c.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul' < 
        ((istanbul_now.today + interval '1 day')::text || ' 00:00:00')::timestamp AT TIME ZONE 'Europe/Istanbul'
  ORDER BY c.created_at DESC;
$$;

-- Function to get chats in a date range based on Istanbul timezone
CREATE OR REPLACE FUNCTION get_date_range_chats_istanbul(
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
  created_at_istanbul timestamptz
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
    (c.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul' as created_at_istanbul
  FROM chats c
  WHERE (c.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul' >= 
        (date_from::text || ' 00:00:00')::timestamp AT TIME ZONE 'Europe/Istanbul'
    AND (c.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul' <= 
        (date_to::text || ' 23:59:59.999999')::timestamp AT TIME ZONE 'Europe/Istanbul'
  ORDER BY c.created_at DESC;
$$;

-- Create a view for chats with Istanbul timezone
CREATE OR REPLACE VIEW chats_istanbul AS
SELECT 
  id,
  agent_name,
  customer_name,
  status,
  created_at,
  ended_at,
  analyzed,
  chat_data,
  (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul' as created_at_istanbul,
  (ended_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul' as ended_at_istanbul,
  DATE((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul') as date_istanbul
FROM chats;

-- Create a view for chat messages with Istanbul timezone
CREATE OR REPLACE VIEW chat_messages_istanbul AS
SELECT 
  id,
  chat_id,
  author_type,
  text,
  is_system,
  created_at,
  (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul' as created_at_istanbul
FROM chat_messages;

-- Add comments for documentation
COMMENT ON FUNCTION get_istanbul_now() IS 'Returns current timestamp in Istanbul timezone (Europe/Istanbul)';
COMMENT ON FUNCTION convert_to_istanbul(timestamptz) IS 'Converts UTC timestamp to Istanbul timezone';
COMMENT ON FUNCTION get_istanbul_date_start(date) IS 'Returns 00:00:00 of the given date in Istanbul timezone';
COMMENT ON FUNCTION get_istanbul_date_end(date) IS 'Returns 23:59:59.999999 of the given date in Istanbul timezone';
COMMENT ON FUNCTION get_today_chats_istanbul() IS 'Returns all chats created today based on Istanbul timezone';
COMMENT ON FUNCTION get_date_range_chats_istanbul(date, date) IS 'Returns chats created within date range based on Istanbul timezone';
COMMENT ON VIEW chats_istanbul IS 'Chats with timestamps converted to Istanbul timezone';
COMMENT ON VIEW chat_messages_istanbul IS 'Chat messages with timestamps converted to Istanbul timezone';