# Group Streams (Google Classroom-style)

Discussion streams inside each group. Tutors post announcements, learning content, and discussions; students view and reply with threaded discussions.

## Folder structure

```
src/supabase/migrations/
  092_group_stream.sql              # stream_posts, stream_replies, stream_attachments + RLS

lib/types/
  groupStream.ts                    # StreamPost, StreamReply, StreamAttachment, CreateStreamPostInput

app/api/
  groups/[groupId]/stream/
    route.ts                        # GET stream (paginated posts + replies)
    post/route.ts                   # POST create post
  stream/
    post/[postId]/
      route.ts                      # DELETE post
      reply/route.ts               # POST reply to post
    reply/[replyId]/reply/
      route.ts                     # POST reply to reply (nested)

components/groups/stream/
  GroupStreamPage.tsx               # Main stream tab: composer + post list + pagination
  PostComposer.tsx                  # Post type selector, message input, submit
  StreamPostCard.tsx                # Author, timestamp, content, attachments, delete, reply section
  ReplyThread.tsx                   # Nested replies, reply input, collapse/expand
  StreamAttachmentList.tsx          # Attachment links for a post
  timeAgo.ts                        # timeAgo(), getInitials()
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/groups/{groupId}/stream?page=1&limit=20` | List stream posts (newest first) with replies and attachments |
| POST | `/api/groups/{groupId}/stream/post` | Create post (tutor: announcement/content/discussion; student: discussion only) |
| DELETE | `/api/stream/post/{postId}` | Delete post (author or group tutor) |
| POST | `/api/stream/post/{postId}/reply` | Reply to a post |
| POST | `/api/stream/reply/{replyId}/reply` | Reply to a reply (nested) |

## Example API responses

### GET /api/groups/{groupId}/stream

```json
{
  "posts": [
    {
      "id": "uuid",
      "group_id": "uuid",
      "author_id": "uuid",
      "author_role": "tutor",
      "post_type": "announcement",
      "message_body": "Class is cancelled tomorrow.",
      "created_at": "2025-03-06T12:00:00Z",
      "updated_at": "2025-03-06T12:00:00Z",
      "author": { "id": "uuid", "full_name": "Jane Tutor", "avatar_url": "https://..." },
      "attachments": [],
      "replies": [
        {
          "id": "uuid",
          "post_id": "uuid",
          "author_id": "uuid",
          "message_body": "Thanks for letting us know!",
          "parent_reply_id": null,
          "created_at": "2025-03-06T12:05:00Z",
          "updated_at": "2025-03-06T12:05:00Z",
          "author": { "id": "uuid", "full_name": "John Student", "avatar_url": null },
          "replies": []
        }
      ]
    }
  ],
  "pagination": { "page": 1, "limit": 20, "has_more": false }
}
```

### POST /api/groups/{groupId}/stream/post (201)

```json
{
  "post": {
    "id": "uuid",
    "group_id": "uuid",
    "author_id": "uuid",
    "author_role": "tutor",
    "post_type": "announcement",
    "message_body": "Welcome to the group!",
    "created_at": "2025-03-06T12:00:00Z",
    "updated_at": "2025-03-06T12:00:00Z",
    "author": { "id": "uuid", "full_name": "Jane Tutor", "avatar_url": null },
    "attachments": [],
    "replies": []
  }
}
```

### POST /api/stream/post/{postId}/reply (201)

```json
{
  "reply": {
    "id": "uuid",
    "post_id": "uuid",
    "author_id": "uuid",
    "message_body": "My reply text",
    "parent_reply_id": null,
    "created_at": "2025-03-06T12:00:00Z",
    "updated_at": "2025-03-06T12:00:00Z",
    "author": { "id": "uuid", "full_name": "John Student", "avatar_url": null },
    "replies": []
  }
}
```

## Security

- **Tutor:** create posts (announcement/content/discussion), delete any post in their group.
- **Student:** create discussion posts only, reply to posts and replies, delete own replies (or group tutor can delete).
- **View:** only group tutor and approved members see the stream.

## Database indexes

- `stream_posts`: `group_id`, `created_at DESC`, `(group_id, created_at DESC)`
- `stream_replies`: `post_id`, `parent_reply_id` (partial), `created_at`
- `stream_attachments`: `post_id`

## Applying the migration

**Option A – npm script (recommended)**  
Uses `DATABASE_URL` from `.env.local` (Supabase → Settings → Database → Connection string URI).

```bash
npm run stream:migrate
```

**Option B – Supabase SQL Editor**  
1. Open Supabase Dashboard → your project → **SQL Editor**.  
2. Copy the contents of `src/supabase/migrations/092_group_stream.sql`.  
3. Paste and run.

**Option C – Supabase CLI**  
If the CLI is installed and the project is linked:

```bash
npx supabase db push
```
