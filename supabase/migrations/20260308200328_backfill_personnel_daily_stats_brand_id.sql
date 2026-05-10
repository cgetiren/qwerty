/*
  # Backfill brand_id in personnel_daily_stats

  ## Problem
  All records in personnel_daily_stats have brand_id = NULL because the table
  was populated before multi-brand support was added. The frontend filters by
  brand_id, so queries always return 0 results, making the date range tabs
  appear non-functional.

  ## Changes
  - Backfill brand_id in personnel_daily_stats by matching personnel_name
    to the personnel table's brand_id
  - For any personnel_daily_stats rows where the personnel_name exists in
    multiple brands, assign the correct brand_id per brand's personnel record
*/

UPDATE personnel_daily_stats pds
SET brand_id = p.brand_id
FROM personnel p
WHERE pds.personnel_name = p.name
  AND pds.brand_id IS NULL;
