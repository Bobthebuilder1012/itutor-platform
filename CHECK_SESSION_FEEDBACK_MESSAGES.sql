-- =====================================================
-- CHECK IF SESSION FEEDBACK MESSAGES WERE INSERTED
-- =====================================================
-- Run this in Supabase SQL Editor to verify messages

-- 1. Check if tutor feedback was saved
SELECT 
    'Tutor Feedback Table' as check_name,
    tf.id,
    tf.session_id,
    tf.tutor_id,
    tf.student_id,
    LEFT(tf.feedback_text, 50) as feedback_preview,
    tf.created_at
FROM tutor_feedback tf
ORDER BY tf.created_at DESC
LIMIT 10;

-- 2. Check if conversations exist for this tutor and student
SELECT 
    'Conversations' as check_name,
    c.id as conversation_id,
    c.participant_1_id,
    c.participant_2_id,
    c.last_message_at,
    c.last_message_preview,
    c.created_at
FROM conversations c
ORDER BY c.created_at DESC
LIMIT 10;

-- 3. Check if messages were created from feedback
SELECT 
    'Recent Messages' as check_name,
    m.id,
    m.conversation_id,
    m.sender_id,
    LEFT(m.content, 60) as message_preview,
    m.created_at,
    m.is_read
FROM messages m
ORDER BY m.created_at DESC
LIMIT 20;

-- 4. Join tutor_feedback with messages to see if they match
SELECT 
    'Feedback → Messages Mapping' as check_name,
    tf.id as feedback_id,
    tf.feedback_text,
    tf.created_at as feedback_created_at,
    m.id as message_id,
    m.content as message_content,
    m.created_at as message_created_at,
    CASE 
        WHEN m.id IS NOT NULL THEN '✅ Message Created'
        ELSE '❌ Message Missing'
    END as status
FROM tutor_feedback tf
LEFT JOIN messages m ON (
    m.content = tf.feedback_text
    AND m.sender_id = tf.tutor_id
    AND m.created_at >= tf.created_at - INTERVAL '5 seconds'
    AND m.created_at <= tf.created_at + INTERVAL '5 seconds'
)
ORDER BY tf.created_at DESC
LIMIT 10;

-- 5. Check specific tutor-student conversation and messages
-- Replace with your tutor and student IDs
SELECT 
    'Specific Conversation Messages' as check_name,
    c.id as conversation_id,
    m.id as message_id,
    m.sender_id,
    p.full_name as sender_name,
    m.content,
    m.created_at
FROM conversations c
LEFT JOIN messages m ON m.conversation_id = c.id
LEFT JOIN profiles p ON p.id = m.sender_id
WHERE (c.participant_1_id = 'TUTOR_ID' AND c.participant_2_id = 'STUDENT_ID')
   OR (c.participant_1_id = 'STUDENT_ID' AND c.participant_2_id = 'TUTOR_ID')
ORDER BY m.created_at DESC;

-- 6. Check if feedback submission was successful (last run)
SELECT 
    'Most Recent Feedback Submission' as check_name,
    tf.id,
    s.id as session_id,
    tutor.full_name as tutor_name,
    student.full_name as student_name,
    tf.feedback_text,
    tf.created_at,
    c.id as conversation_id,
    c.last_message_preview,
    c.last_message_at,
    CASE 
        WHEN c.last_message_at >= tf.created_at THEN '✅ Conversation Updated'
        ELSE '⚠️ Conversation Not Updated'
    END as conversation_status
FROM tutor_feedback tf
JOIN sessions s ON s.id = tf.session_id
JOIN profiles tutor ON tutor.id = tf.tutor_id
JOIN profiles student ON student.id = tf.student_id
LEFT JOIN conversations c ON (
    (c.participant_1_id = tf.tutor_id AND c.participant_2_id = tf.student_id)
    OR (c.participant_1_id = tf.student_id AND c.participant_2_id = tf.tutor_id)
)
ORDER BY tf.created_at DESC
LIMIT 1;
