-- Update 3: keep the "Pair" and "Article Doc" columns of the order history sheet.
-- Run ONCE in Supabase -> SQL Editor (after 0002). Safe to run twice.
alter table public.orders add column if not exists pair        text;
alter table public.orders add column if not exists article_url text;
