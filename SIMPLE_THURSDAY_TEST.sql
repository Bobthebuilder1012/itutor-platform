-- =====================================================
-- SIMPLE TEST: Check Thursday availability
-- =====================================================

-- What day of week is Thursday Feb 12?
SELECT 
    '2026-02-12'::date as the_date,
    EXTRACT(DOW FROM '2026-02-12'::date) as postgres_day_number,
    TO_CHAR('2026-02-12'::date, 'Day') as day_name,
    'In PostgreSQL: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday' as note;

-- What day_of_week is set in the Thursday rule?
SELECT 
    day_of_week as configured_day_number,
    CASE day_of_week
        WHEN 0 THEN 'Sunday'
        WHEN 1 THEN 'Monday'
        WHEN 2 THEN 'Tuesday'
        WHEN 3 THEN 'Wednesday'
        WHEN 4 THEN 'Thursday'
        WHEN 5 THEN 'Friday'
        WHEN 6 THEN 'Saturday'
    END as configured_day_name,
    start_time,
    end_time,
    is_active
FROM tutor_availability_rules
WHERE tutor_id = (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com')
ORDER BY day_of_week;

-- Does the day_of_week match?
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM tutor_availability_rules
            WHERE tutor_id = (SELECT id FROM profiles WHERE email = 'jovangoodluck@myitutor.com')
            AND day_of_week = EXTRACT(DOW FROM '2026-02-12'::date)
            AND is_active = true
        )
        THEN '✅ Thursday rule matches Feb 12, 2026'
        ELSE '❌ NO MATCH - Thursday rule day_of_week does not match Feb 12, 2026'
    END as match_result;
