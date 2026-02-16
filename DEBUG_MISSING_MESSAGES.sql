-- =====================================================
-- DEBUG: Why messages don't appear in conversation view
-- =====================================================

-- 1. Find the conversation with "good work" preview
SELECT 
    'Conversation with good work preview' as debug_step,
    c.id as conversation_id,
    c.participant_1_id,
    c.participant_2_id,
    c.last_message_preview,
    c.last_message_at,
    p1.full_name as participant_1_name,
    p2.full_name as participant_2_name
FROM conversations c
LEFT JOIN profiles p1 ON p1.id = c.participant_1_id
LEFT JOIN profiles p2 ON p2.id = c.participant_2_id
WHERE c.last_message_preview LIKE '%good work%'
   OR c.last_message_preview LIKE '%good%';

-- 2. Check all messages in that conversation
SELECT 
    'All messages in conversation' as debug_step,
    m.id,
    m.conversation_id,
    m.sender_id,
    m.content,
    m.created_at,
    m.is_read,
    p.full_name as sender_name,
    p.role as sender_role
FROM messages m
LEFT JOIN profiles p ON p.id = m.sender_id
WHERE m.conversation_id IN (
    SELECT c.id 
    FROM conversations c 
    WHERE c.last_message_preview LIKE '%good work%'
       OR c.last_message_preview LIKE '%good%'
)
ORDER BY m.created_at DESC;

-- 3. Check tutor feedback entries
SELECT 
    'Tutor Feedback' as debug_step,
    tf.id,
    tf.session_id,
    tf.feedback_text,
    tf.created_at,
    tutor.full_name as tutor_name,
    student.full_name as student_name,
    tutor.id as tutor_id,
    student.id as student_id
FROM tutor_feedback tf
JOIN profiles tutor ON tutor.id = tf.tutor_id
JOIN profiles student ON student.id = tf.student_id
ORDER BY tf.created_at DESC
LIMIT 5;

-- 4. Find conversation between tutor and student from feedback
WITH recent_feedback AS (
    SELECT * FROM tutor_feedback ORDER BY created_at DESC LIMIT 1
)
SELECT 
    'Conversation between tutor and student' as debug_step,
    c.id as conversation_id,
    c.participant_1_id,
    c.participant_2_id,
    c.last_message_preview,
    c.last_message_at,
    rf.tutor_id,
    rf.student_id,
    CASE 
        WHEN c.participant_1_id = rf.tutor_id AND c.participant_2_id = rf.student_id THEN '✅ Match'
        WHEN c.participant_1_id = rf.student_id AND c.participant_2_id = rf.tutor_id THEN '✅ Match (reversed)'
        ELSE '❌ No Match'
    END as participant_match
FROM conversations c
CROSS JOIN recent_feedback rf
WHERE (c.participant_1_id = rf.tutor_id AND c.participant_2_id = rf.student_id)
   OR (c.participant_1_id = rf.student_id AND c.participant_2_id = rf.tutor_id);

-- 5. Count messages for each conversation involving the student
WITH recent_feedback AS (
    SELECT * FROM tutor_feedback ORDER BY created_at DESC LIMIT 1
)
SELECT 
    'Message counts per conversation' as debug_step,
    c.id as conversation_id,
    c.last_message_preview,
    COUNT(m.id) as message_count,
    MAX(m.created_at) as latest_message_at
FROM conversations c
CROSS JOIN recent_feedback rf
LEFT JOIN messages m ON m.conversation_id = c.id
WHERE (c.participant_1_id = rf.student_id OR c.participant_2_id = rf.student_id)
GROUP BY c.id, c.last_message_preview
ORDER BY latest_message_at DESC NULLS LAST;

-- 6. Check RLS - Can student see the conversation?
-- Replace STUDENT_UUID with actual student ID
WITH student_conversations AS (
    SELECT c.* 
    FROM conversations c
    WHERE c.participant_1_id = 'STUDENT_UUID'
       OR c.participant_2_id = 'STUDENT_UUID'
)
SELECT 
    'Student can see these conversations' as debug_step,
    sc.id,
    sc.last_message_preview,
    COUNT(m.id) as visible_messages
FROM student_conversations sc
LEFT JOIN messages m ON m.conversation_id = sc.id
GROUP BY sc.id, sc.last_message_preview;

-- 7. Direct message content search
SELECT 
    'Messages containing good work' as debug_step,
    m.id,
    m.conversation_id,
    m.sender_id,
    m.content,
    m.created_at,
    c.participant_1_id,
    c.participant_2_id
FROM messages m
JOIN conversations c ON c.id = m.conversation_id
WHERE m.content LIKE '%good work%'
   OR m.content LIKE '%good%'
ORDER BY m.created_at DESC
LIMIT 10;
