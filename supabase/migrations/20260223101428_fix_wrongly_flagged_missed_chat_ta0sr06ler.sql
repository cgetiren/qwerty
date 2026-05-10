/*
  # Fix wrongly flagged missed chat TA0SR06LER

  ## Problem
  Chat thread TA1WUOK6TY (parent chat TA0SR06LER, agent Ela, customer Erdem Tuncel)
  was incorrectly flagged as is_missed = true.

  The sync function was using rawChatData.is_missed (an internal SLA metric) and
  status="missed" as signals, both of which cause false positives when an agent
  IS assigned and DID reply. The correct signal is routing.unreplied only.

  ## Fix
  1. Reset is_missed to false for this specific chat
  2. Remove any missed_chat alert tied to it
  3. Also re-run the broad fix: reset is_missed for all chats where routing.unreplied != true
*/

-- Fix the specific chat
UPDATE chats
SET is_missed = false
WHERE id = 'TA1WUOK6TY' OR chat_id = 'TA0SR06LER';

-- Remove wrong missed_chat alerts for this chat
DELETE FROM alerts
WHERE alert_type = 'missed_chat'
  AND chat_id IN (
    SELECT id FROM chats WHERE id = 'TA1WUOK6TY' OR chat_id = 'TA0SR06LER'
  );

-- Broad cleanup: reset is_missed for all chats where routing.unreplied is not explicitly true
UPDATE chats
SET is_missed = false
WHERE is_missed = true
  AND (
    chat_data->'properties'->'full_chat_data'->'last_thread_summary'->'properties'->'routing'->>'unreplied'
  )::boolean IS DISTINCT FROM true;

-- Remove all missed_chat alerts for chats that are no longer flagged as missed
DELETE FROM alerts
WHERE alert_type = 'missed_chat'
  AND chat_id IN (
    SELECT id FROM chats WHERE is_missed = false
  );
