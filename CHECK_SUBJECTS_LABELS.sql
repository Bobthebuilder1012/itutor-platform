-- Check if subjects have labels populated
SELECT 
  id,
  name,
  curriculum,
  level,
  label,
  CASE 
    WHEN label IS NULL THEN '❌ No label'
    WHEN label = '' THEN '❌ Empty label'
    ELSE '✅ Has label'
  END as label_status
FROM subjects
ORDER BY curriculum, name
LIMIT 20;

-- Count subjects by label status
SELECT 
  COUNT(*) as total_subjects,
  COUNT(label) as subjects_with_labels,
  COUNT(*) - COUNT(label) as subjects_without_labels
FROM subjects;

-- Show some example labels
SELECT DISTINCT label
FROM subjects
WHERE label IS NOT NULL
ORDER BY label
LIMIT 10;

