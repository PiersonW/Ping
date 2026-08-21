-- Prevents two accounts from claiming the same phone number.
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- Why: profiles.phone is a free-text field (app/settings.tsx) with no
-- verification that the number entered actually belongs to the user.
-- Contact-matching (lib/phone.ts) auto-links invites to whichever account
-- has a matching profiles.phone, so without this constraint, someone
-- could type in another real user's phone number and have that person's
-- invites route to the wrong account instead. This doesn't fully close
-- that gap (nothing stops someone from squatting on a number before its
-- real owner signs up and sets it) - actual verification (e.g. SMS OTP)
-- would be needed for that. This just prevents two profiles from holding
-- the same number at once, which is the worse, easier-to-hit case.
--
-- NULL is fine to repeat under a unique index/constraint in Postgres
-- (NULL is never considered equal to NULL), so users without a phone
-- number on file are unaffected.

-- Run this first to check for existing collisions - the constraint below
-- will fail to apply if any come back. If it returns rows, decide with
-- the affected users (or via admin judgment) who keeps the number before
-- proceeding; the other account's phone field will need to be cleared.
select phone, array_agg(id) as profile_ids, count(*)
from public.profiles
where phone is not null
group by phone
having count(*) > 1;

-- Once the above returns zero rows, apply the constraint:
alter table public.profiles
  add constraint profiles_phone_unique unique (phone);
