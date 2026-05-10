/*
  # Set all callback categories minimum urgency to low

  All callback detections should send a Telegram notification.
  The urgency level is already shown in the bot message, so
  filtering by urgency threshold adds no value and causes missed alerts.

  Change: min_urgency_for_alert = 'low' for all categories
          send_telegram = true for all categories
*/

UPDATE callback_settings
SET min_urgency_for_alert = 'low',
    send_telegram = true;
