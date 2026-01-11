-- =====================================================
-- ADD COLOR CODING FOR CHILDREN (FIXED)
-- =====================================================
-- Allow parents to assign colors to each child for organization

-- Add color column to parent_child_links
ALTER TABLE parent_child_links
ADD COLUMN IF NOT EXISTS child_color VARCHAR(7) DEFAULT '#9333EA';

-- Assign default colors to existing children using CTE
WITH numbered_children AS (
    SELECT 
        id,
        parent_id,
        child_id,
        ROW_NUMBER() OVER (PARTITION BY parent_id ORDER BY created_at) AS row_num
    FROM parent_child_links
    WHERE child_color IS NULL OR child_color = '#9333EA'
)
UPDATE parent_child_links pcl
SET child_color = (
    CASE (nc.row_num - 1) % 8
        WHEN 0 THEN '#9333EA'  -- Purple
        WHEN 1 THEN '#3B82F6'  -- Blue
        WHEN 2 THEN '#10B981'  -- Green
        WHEN 3 THEN '#F59E0B'  -- Amber
        WHEN 4 THEN '#EF4444'  -- Red
        WHEN 5 THEN '#EC4899'  -- Pink
        WHEN 6 THEN '#8B5CF6'  -- Violet
        ELSE '#06B6D4'         -- Cyan
    END
)
FROM numbered_children nc
WHERE pcl.id = nc.id;

-- Add function to update child color
CREATE OR REPLACE FUNCTION update_child_color(
    p_parent_id UUID,
    p_child_id UUID,
    p_color VARCHAR(7)
) RETURNS JSONB AS $$
DECLARE
    v_link_exists BOOLEAN;
BEGIN
    -- Verify parent-child relationship
    SELECT EXISTS(
        SELECT 1 FROM parent_child_links
        WHERE parent_id = p_parent_id
        AND child_id = p_child_id
    ) INTO v_link_exists;

    IF NOT v_link_exists THEN
        RAISE EXCEPTION 'Parent-child relationship not found';
    END IF;

    -- Verify parent is the authenticated user
    IF auth.uid() != p_parent_id THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Update color
    UPDATE parent_child_links
    SET child_color = p_color
    WHERE parent_id = p_parent_id
    AND child_id = p_child_id;

    RETURN jsonb_build_object('success', true, 'color', p_color);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_child_color TO authenticated;

-- Verification
SELECT 
    'Child color coding added!' AS status,
    COUNT(*) AS children_with_colors
FROM parent_child_links 
WHERE child_color IS NOT NULL;












