-- Drops viewer_invites, created by 0025 and never used (see VIEWER_ACCESS.md).
--
-- The plan was to keep unaccepted invites in this table and create the role and
-- study grants when the invite was accepted. As built, the account, the viewer
-- role and the grant are all created at invite time, and "Invited" vs "Active"
-- is read from whether the account's email is confirmed, so nothing reads or
-- writes this table.
--
-- Apply by hand in the Supabase SQL editor, as with the earlier migrations.
-- `if exists` makes it safe on a project that never created the table. Nothing
-- else references it, so no other table is affected.

drop table if exists viewer_invites;
