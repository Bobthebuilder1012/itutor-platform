-- =====================================================
-- EXTEND MESSAGES SYSTEM FOR COMMUNITIES
-- =====================================================
-- Unifies messaging by extending existing conversations and messages tables
-- to support community Q&A alongside DMs and booking threads

-- 1. CREATE ENUMS
DO $$ BEGIN
  CREATE TYPE message_type AS ENUM ('dm', 'question', 'answer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE conversation_type AS ENUM ('dm', 'booking', 'group');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE question_status AS ENUM ('open', 'answered', 'locked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. EXTEND CONVERSATIONS TABLE
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS conversation_type conversation_type DEFAULT 'dm',
ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES communities(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS participant_ids uuid[] DEFAULT '{}';

-- Backfill existing conversations as 'dm' or 'booking'
UPDATE conversations
SET conversation_type = 'dm'
WHERE conversation_type IS NULL;

-- Index for group chat participants
CREATE INDEX IF NOT EXISTS idx_conversations_participants ON conversations USING GIN(participant_ids);
CREATE INDEX IF NOT EXISTS idx_conversations_community ON conversations(community_id);
CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(conversation_type);

-- 3. EXTEND MESSAGES TABLE FOR QUESTIONS AND ANSWERS
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS message_type message_type DEFAULT 'dm',
ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES communities(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS question_id uuid REFERENCES messages(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS topic_tag text,
ADD COLUMN IF NOT EXISTS status question_status DEFAULT 'open',
ADD COLUMN IF NOT EXISTS best_answer_id uuid REFERENCES messages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS answer_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS views_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS helpful_count integer DEFAULT 0;

-- Backfill existing messages as 'dm'
UPDATE messages
SET message_type = 'dm'
WHERE message_type IS NULL;

-- 4. CREATE INDEXES FOR COMMUNITY Q&A
-- Questions in a community, sorted by creation
CREATE INDEX IF NOT EXISTS idx_messages_community_questions ON messages(community_id, message_type, created_at DESC)
WHERE message_type = 'question';

-- Questions by status
CREATE INDEX IF NOT EXISTS idx_messages_community_status ON messages(community_id, status, created_at DESC)
WHERE message_type = 'question';

-- Pinned questions
CREATE INDEX IF NOT EXISTS idx_messages_community_pinned ON messages(community_id, is_pinned, created_at DESC)
WHERE message_type = 'question' AND is_pinned = true;

-- Answers for a question
CREATE INDEX IF NOT EXISTS idx_messages_question_answers ON messages(question_id, created_at)
WHERE message_type = 'answer';

-- Questions by author
CREATE INDEX IF NOT EXISTS idx_messages_author_questions ON messages(sender_id, message_type, created_at DESC)
WHERE message_type = 'question';

-- Best answers
CREATE INDEX IF NOT EXISTS idx_messages_best_answers ON messages(best_answer_id)
WHERE best_answer_id IS NOT NULL;

-- Topic tags for filtering
CREATE INDEX IF NOT EXISTS idx_messages_topic_tag ON messages(topic_tag)
WHERE topic_tag IS NOT NULL;

-- 5. CREATE FUNCTION TO INCREMENT ANSWER COUNT
CREATE OR REPLACE FUNCTION increment_answer_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.message_type = 'answer' AND NEW.question_id IS NOT NULL THEN
    UPDATE messages
    SET answer_count = answer_count + 1
    WHERE id = NEW.question_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER answer_count_increment
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION increment_answer_count();

-- 6. CREATE FUNCTION TO DECREMENT ANSWER COUNT
CREATE OR REPLACE FUNCTION decrement_answer_count()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.message_type = 'answer' AND OLD.question_id IS NOT NULL THEN
    UPDATE messages
    SET answer_count = GREATEST(0, answer_count - 1)
    WHERE id = OLD.question_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER answer_count_decrement
  AFTER DELETE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION decrement_answer_count();

-- 7. CREATE FUNCTION TO AUTO-UPDATE QUESTION STATUS
CREATE OR REPLACE FUNCTION update_question_status()
RETURNS TRIGGER AS $$
BEGIN
  -- When answer count goes from 0 to 1+, mark as 'answered'
  IF NEW.answer_count > 0 AND OLD.answer_count = 0 AND NEW.status = 'open' THEN
    NEW.status = 'answered';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER question_status_update
  BEFORE UPDATE ON messages
  FOR EACH ROW
  WHEN (OLD.answer_count IS DISTINCT FROM NEW.answer_count)
  EXECUTE FUNCTION update_question_status();

-- 8. COMMENTS
COMMENT ON COLUMN messages.message_type IS 'Type: dm (direct message), question (community Q&A), answer (to a question)';
COMMENT ON COLUMN messages.community_id IS 'Reference to community for questions and answers';
COMMENT ON COLUMN messages.question_id IS 'For answers, reference to the parent question';
COMMENT ON COLUMN messages.title IS 'For questions, the question title';
COMMENT ON COLUMN messages.topic_tag IS 'Optional topic/category tag for questions';
COMMENT ON COLUMN messages.status IS 'Question status: open, answered, locked';
COMMENT ON COLUMN messages.best_answer_id IS 'ID of the marked best answer for this question';
COMMENT ON COLUMN messages.answer_count IS 'Number of answers to this question (auto-incremented)';
COMMENT ON COLUMN messages.views_count IS 'Number of times this question has been viewed';
COMMENT ON COLUMN messages.is_pinned IS 'Whether this question is pinned by moderators';
COMMENT ON COLUMN messages.helpful_count IS 'Number of helpful reactions to an answer';

COMMENT ON COLUMN conversations.conversation_type IS 'Type: dm (1-on-1), booking (tutoring thread), group (group chat)';
COMMENT ON COLUMN conversations.participant_ids IS 'Array of all participant IDs for group chats';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Messages system extended for communities';
  RAISE NOTICE '   - messages table supports questions and answers';
  RAISE NOTICE '   - conversations table supports group chats';
  RAISE NOTICE '   - Auto-increment/decrement answer_count triggers';
  RAISE NOTICE '   - Auto-update question status trigger';
  RAISE NOTICE '   - Comprehensive indexes for Q&A performance';
END $$;





