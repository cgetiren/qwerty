/*
  # Fix is_missed column using routing.unreplied API flag

  ## Problem
  The is_missed column was incorrectly set from the LiveChat API's raw_chat_data.is_missed field,
  which is an internal SLA metric and does NOT mean the agent failed to reply.
  This caused 1180 normal chats to be falsely flagged as missed.

  ## Fix
  - For chats WITH full_chat_data stored: use last_thread_summary.properties.routing.unreplied (the true signal)
  - For chats WITHOUT full_chat_data: reset to false (cannot determine accurately, safer to not flag)
  - Remove incorrect missed_chat alerts for chats that are NOT truly missed
*/

-- Step 1: Reset all is_missed to false
UPDATE chats SET is_missed = false;

-- Step 2: Set is_missed = true only for chats where routing.unreplied = true
UPDATE chats
SET is_missed = true
WHERE (
  chat_data->'properties'->'full_chat_data'->'last_thread_summary'->'properties'->'routing'->>'unreplied'
)::boolean = true;

-- Step 3: Remove incorrect missed_chat alerts for chats no longer considered missed
DELETE FROM alerts
WHERE alert_type = 'missed_chat'
  AND chat_id IN (
    SELECT id FROM chats WHERE is_missed = false
  );
