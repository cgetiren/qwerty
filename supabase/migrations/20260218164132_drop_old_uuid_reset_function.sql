/*
  # Drop old UUID-typed reset_single_chat_analysis function

  Removes the old version that expected a uuid parameter, now replaced with text parameter version.
*/

DROP FUNCTION IF EXISTS reset_single_chat_analysis(uuid);
