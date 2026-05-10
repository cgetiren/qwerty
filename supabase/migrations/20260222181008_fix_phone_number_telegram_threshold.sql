/*
  # Fix phone_number category Telegram alert threshold

  ## Problem
  When a customer shares only a phone number (no other categories matched),
  computeUrgency() returns "medium". However, the phone_number category had
  min_urgency_for_alert = "high", so the Telegram check always failed for
  phone-only detections.

  ## Fix
  Lower min_urgency_for_alert for phone_number from "high" to "medium"
  so that phone number detections actually trigger Telegram notifications.
*/

UPDATE callback_settings
SET min_urgency_for_alert = 'medium'
WHERE category = 'phone_number'
  AND min_urgency_for_alert = 'high';
