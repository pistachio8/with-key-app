-- 0013_action_photos_drop_heic.sql — tighten action-photos MIME allowlist.
--
-- Client now transcodes HEIC/HEIF → JPEG before upload, so the bucket
-- policy no longer needs to allow those MIME types. Tightening prevents
-- a failed client transcode from silently uploading an un-renderable
-- original on Chrome/Firefox.

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'action-photos';
