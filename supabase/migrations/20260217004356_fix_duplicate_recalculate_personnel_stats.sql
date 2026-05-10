/*
  # Fix Duplicate recalculate_personnel_stats Function
  
  1. Problem
    - Two versions of recalculate_personnel_stats exist:
      - recalculate_personnel_stats() without parameters
      - recalculate_personnel_stats(p_date date) with optional date parameter
    - PostgreSQL cannot determine which function to call when no parameters are provided
    - This causes "function is not unique" error
    
  2. Solution
    - DROP the parameterless version
    - Keep only the version with optional date parameter
    - This allows both recalculate_personnel_stats() and recalculate_personnel_stats(date) calls
    
  3. Security
    - Both functions were SECURITY DEFINER, so dropping the old one maintains security
*/

-- Drop the old parameterless version
DROP FUNCTION IF EXISTS recalculate_personnel_stats();

-- Verify only the parametered version remains
-- The recalculate_personnel_stats(p_date date DEFAULT NULL) function is already defined
-- from the previous migration, so no need to recreate it