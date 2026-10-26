-- CabGo database schema for Supabase (PostgreSQL).
-- Run this once in the SQL Editor of a NEW, empty project to create everything.
--
-- Row level security is switched on for every table, and NO policies are defined on purpose:
-- with security on and no policies, the public (publishable) key can read nothing.
-- Only the server, using the secret key, can read and write.

-- ---------- Tables ----------

create table users (
  id uuid primary key default gen_random_uuid(),
  clerk_id text unique not null,
  role text not null default 'rider' check (role in ('rider', 'driver')),
  name text,
  email text,
  phone text,
  created_at timestamptz default now()
);

create table drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references users(id) on delete cascade,
  vehicle_model text,
  vehicle_number text,
  is_online boolean default false,
  current_lat double precision,
  current_lng double precision,
  last_seen_at timestamptz,
  rating_sum integer not null default 0,
  rating_count integer not null default 0,
  created_at timestamptz default now()
);

create table rides (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references users(id),
  driver_id uuid references users(id),
  pickup_address text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  dropoff_address text not null,
  dropoff_lat double precision not null,
  dropoff_lng double precision not null,
  distance_km numeric(8,2),
  duration_min numeric(8,2),
  fare numeric(10,2),
  ride_type text not null default 'car' check (ride_type in ('bike', 'auto', 'car')),
  status text not null default 'requested'
    check (status in ('requested', 'accepted', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides(id),
  provider text not null default 'razorpay',
  provider_order_id text,
  provider_payment_id text,
  amount numeric(10,2) not null,
  currency text default 'inr',
  platform_fee numeric(10,2),
  driver_earning numeric(10,2),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  receipt_sent_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null unique references rides(id),
  rider_id uuid not null references users(id),
  driver_id uuid not null references users(id),
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now()
);

create table rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

-- ---------- Indexes and rules the database enforces ----------

-- A rider has at most one unfinished ride, and a driver at most one ride in progress
create unique index rides_one_active_per_rider
  on rides (rider_id) where status in ('requested', 'accepted', 'in_progress');
create unique index rides_one_active_per_driver
  on rides (driver_id) where status in ('accepted', 'in_progress');

-- A ride can be paid for only once, and each gateway order belongs to one payment
create unique index payments_one_success_per_ride
  on payments (ride_id) where status = 'succeeded';
create unique index payments_provider_order_id_key
  on payments (provider_order_id) where provider_order_id is not null;

-- Speed: history lists, open requests, online drivers, and a driver's reviews
create index rides_rider_created_idx on rides (rider_id, created_at desc);
create index rides_driver_created_idx on rides (driver_id, created_at desc) where driver_id is not null;
create index rides_open_requests_idx on rides (created_at desc) where status = 'requested';
create index drivers_online_idx on drivers (user_id) where is_online = true;
create index reviews_driver_created_idx on reviews (driver_id, created_at desc);

-- ---------- Security ----------

alter table users enable row level security;
alter table drivers enable row level security;
alter table rides enable row level security;
alter table payments enable row level security;
alter table reviews enable row level security;
alter table rate_limits enable row level security;

-- ---------- Functions ----------

-- Keeps each driver's rating totals in step with their reviews
create or replace function refresh_driver_rating() returns trigger
language plpgsql as $$
declare
  target uuid;
begin
  if tg_op = 'DELETE' then
    target := old.driver_id;
  else
    target := new.driver_id;
  end if;

  update drivers
  set rating_sum = coalesce((select sum(rating) from reviews where driver_id = target), 0),
      rating_count = (select count(*) from reviews where driver_id = target)
  where user_id = target;

  return null;
end;
$$;

create trigger reviews_refresh_driver_rating
after insert or update or delete on reviews
for each row execute function refresh_driver_rating();

-- Counts one request against a limit. Returns true if it is allowed, false if it is over.
create or replace function rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
as $$
declare
  v_count integer;
begin
  insert into rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case
          when r.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else r.count + 1
        end,
        window_start = case
          when r.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else r.window_start
        end
  returning r.count into v_count;

  return v_count <= p_max;
end;
$$;

-- Only our server (secret key) may call it. The public key must not.
revoke execute on function rate_limit_hit(text, integer, integer) from public, anon, authenticated;