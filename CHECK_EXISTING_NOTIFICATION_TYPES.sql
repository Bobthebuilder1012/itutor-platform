-- =====================================================
-- CHECK: What notification types exist in the database?
-- =====================================================

SELECT 
    type,
    COUNT(*) as count,
    MIN(created_at) as first_created,
    MAX(created_at) as last_created
FROM notifications
GROUP BY type
ORDER BY count DESC;
