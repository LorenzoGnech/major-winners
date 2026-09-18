-- pgcrypto lives in the extensions schema on Supabase. Security-definer
-- duel RPCs pinned search_path to public, so gen_random_bytes/digest were
-- not visible at runtime.

create extension if not exists pgcrypto with schema extensions;

alter function public.duel_hash_secret(text) set search_path = public, extensions;
alter function public.duel_new_code() set search_path = public, extensions;
alter function public.create_duel() set search_path = public, extensions;
alter function public.join_duel(text) set search_path = public, extensions;
