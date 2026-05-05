-- =====================================================
-- DATA MIGRATION: school_* -> communities_v2 / community_memberships_v2 / community_messages_v2
-- One-time; run after 078 + 079. Preserves existing school communities and data.
-- =====================================================

-- 1. Communities: copy each school_community to communities_v2 (type SCHOOL)
INSERT INTO public.communities_v2 (type, school_id, name, description, created_by)
SELECT 'SCHOOL'::v2_community_type, school_id, name, description, NULL
FROM public.school_communities sc
WHERE NOT EXISTS (SELECT 1 FROM public.communities_v2 c2 WHERE c2.school_id = sc.school_id AND c2.type = 'SCHOOL');

-- 2. Memberships: copy using school_id join (old community_id -> new community_id)
INSERT INTO public.community_memberships_v2 (community_id, user_id, role, status, muted, muted_until, joined_at, left_at)
SELECT c2.id, m.user_id,
  CASE m.role::text WHEN 'ADMIN' THEN 'ADMIN'::v2_community_member_role ELSE 'MEMBER'::v2_community_member_role END,
  CASE m.status::text WHEN 'LEFT' THEN 'LEFT'::v2_community_member_status ELSE 'ACTIVE'::v2_community_member_status END,
  m.muted, NULL, m.joined_at, m.left_at
FROM public.school_community_memberships m
JOIN public.school_communities sc ON sc.id = m.community_id
JOIN public.communities_v2 c2 ON c2.school_id = sc.school_id AND c2.type = 'SCHOOL'
ON CONFLICT (community_id, user_id) DO NOTHING;

-- 3. Messages: copy with parent_message_id mapping (insert in created_at order)
DO $$
DECLARE
  r RECORD;
  new_comm_id uuid;
  new_parent_id uuid;
  new_msg_id uuid;
BEGIN
  CREATE TEMP TABLE _comm_id_map (old_id uuid PRIMARY KEY, new_id uuid);
  INSERT INTO _comm_id_map (old_id, new_id)
  SELECT sc.id, c2.id FROM public.school_communities sc
  JOIN public.communities_v2 c2 ON c2.school_id = sc.school_id AND c2.type = 'SCHOOL';

  CREATE TEMP TABLE _msg_id_map (old_id uuid PRIMARY KEY, new_id uuid);

  FOR r IN
    SELECT sm.id, sm.community_id, sm.user_id, sm.parent_message_id, sm.content, sm.is_pinned, sm.created_at
    FROM public.school_community_messages sm
    ORDER BY sm.created_at ASC
  LOOP
    SELECT cm.new_id INTO new_comm_id FROM _comm_id_map cm WHERE cm.old_id = r.community_id;
    IF new_comm_id IS NULL THEN CONTINUE; END IF;

    new_parent_id := NULL;
    IF r.parent_message_id IS NOT NULL THEN
      SELECT m.new_id INTO new_parent_id FROM _msg_id_map m WHERE m.old_id = r.parent_message_id;
    END IF;

    INSERT INTO public.community_messages_v2 (community_id, user_id, parent_message_id, content, is_pinned, created_at)
    VALUES (new_comm_id, r.user_id, new_parent_id, r.content, r.is_pinned, r.created_at)
    RETURNING id INTO new_msg_id;

    INSERT INTO _msg_id_map (old_id, new_id) VALUES (r.id, new_msg_id) ON CONFLICT (old_id) DO UPDATE SET new_id = EXCLUDED.new_id;
  END LOOP;

  DROP TABLE _msg_id_map;
  DROP TABLE _comm_id_map;
END $$;
