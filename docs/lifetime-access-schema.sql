-- Run in the Supabase SQL editor before configuring Vercel. Never run in the browser.
create table if not exists public.pulse_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  source text not null check (source in ('promo','stripe')),
  stripe_payment_intent text unique,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.pulse_entitlements enable row level security;
revoke all on table public.pulse_entitlements from anon, authenticated;

create table if not exists public.pulse_stripe_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);
alter table public.pulse_stripe_events enable row level security;
revoke all on table public.pulse_stripe_events from anon, authenticated;

create table if not exists public.pulse_payment_revocations (
  payment_intent text primary key,
  revoked_at timestamptz not null default now()
);
alter table public.pulse_payment_revocations enable row level security;
revoke all on table public.pulse_payment_revocations from anon, authenticated;

create or replace function public.apply_pulse_stripe_event(p_event_id text,p_event_type text,p_user_id uuid,p_payment_intent text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not (p_event_type = any(array['checkout.session.completed','checkout.session.async_payment_succeeded','charge.refunded','charge.dispute.created'])) then
    raise exception 'Invalid event type';
  end if;
  insert into public.pulse_stripe_events(event_id) values (p_event_id) on conflict do nothing;
  if not found then return; end if;
  if p_event_type in ('checkout.session.completed','checkout.session.async_payment_succeeded') then
    insert into public.pulse_entitlements(user_id,source,stripe_payment_intent,revoked_at)
      values(p_user_id,'stripe',p_payment_intent,(select revoked_at from public.pulse_payment_revocations where payment_intent=p_payment_intent))
    on conflict (user_id) do update set source='stripe',stripe_payment_intent=excluded.stripe_payment_intent,revoked_at=excluded.revoked_at;
  else
    -- Revocation tied to the same payment intent (not to an unrelated later order).
    insert into public.pulse_payment_revocations(payment_intent) values (p_payment_intent) on conflict do nothing;
    update public.pulse_entitlements set revoked_at=now()
      where stripe_payment_intent=p_payment_intent and revoked_at is null;
  end if;
end $$;
revoke execute on function public.apply_pulse_stripe_event(text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.apply_pulse_stripe_event(text,text,uuid,text) to service_role;
