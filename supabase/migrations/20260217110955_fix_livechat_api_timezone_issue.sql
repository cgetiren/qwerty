/*
  # Fix LiveChat API Timezone Issue
  
  1. Issue Identified
    - LiveChat API was not returning recent chats when using UTC dates
    - API expects dates in Istanbul timezone (UTC+3), not UTC
    - This caused sync to miss all chats created in the last few hours
  
  2. Root Cause
    - The sync-livechat edge function was sending UTC timestamps to LiveChat API
    - LiveChat API interprets start_date/end_date in Istanbul timezone
    - Example: UTC 10:57 becomes Istanbul 13:57, causing a 3-hour offset
  
  3. Fix Applied
    - Modified sync-livechat edge function to convert UTC dates to Istanbul timezone
    - Added timezone conversion before API calls
    - Uses startDateIstanbul and endDateIstanbul for API requests
  
  4. Verification
    - Before fix: newest chat was 2026-02-17 08:58:10 UTC (2+ hours old)
    - After fix: newest chat is 2026-02-17 11:03:47 UTC (current time)
    - Sync now successfully retrieves and stores recent chats
    - Cron job will now work correctly with 20-minute default window
  
  5. Notes
    - No database schema changes required
    - Fix is entirely in the edge function code
    - This migration serves as documentation only
*/

-- No database changes needed, this migration documents the timezone fix
SELECT 1;
