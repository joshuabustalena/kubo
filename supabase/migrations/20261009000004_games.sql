-- =============================================================================
-- Java Kubo Play Zone — server-authoritative mini-games
--  * The browser never sends points. It sends moves/answers; the server scores.
--  * Hidden state (memory deck, quiz answers) lives in game_session_secrets,
--    which has no client access at all.
--  * Daily limits, cooldowns, one live session per game, single prize per
--    session (unique index) and a daily points cap block farming.
-- =============================================================================

-- Expire stale sessions for a customer/game
create or replace function public.expire_game_sessions(p_customer_id uuid, p_code text)
returns void language sql volatile security definer set search_path = public as $$
  update public.game_sessions set status = 'expired'
   where customer_id = p_customer_id and game_code = p_code and status = 'started' and expires_at <= now()
$$;

-- Throws if the player may not start another round now
create or replace function public.check_game_allowance(p_uid uuid, g public.games)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_today integer;
  v_last timestamptz;
  v_wait integer;
begin
  if not g.is_enabled then raise exception '% is closed right now.', g.name; end if;
  select count(*) into v_today from public.game_sessions
   where customer_id = p_uid and game_code = g.code and public.manila_date(started_at) = public.manila_today();
  if v_today >= g.daily_play_limit then
    raise exception 'You''ve used all % plays of % today. Come back tomorrow!', g.daily_play_limit, g.name;
  end if;
  select max(coalesce(completed_at, started_at)) into v_last from public.game_sessions
   where customer_id = p_uid and game_code = g.code;
  if v_last is not null and v_last + make_interval(secs => g.cooldown_seconds) > now() then
    v_wait := ceil(extract(epoch from (v_last + make_interval(secs => g.cooldown_seconds) - now())))::integer;
    raise exception 'COOLDOWN:%:Take a short break — you can play again in % seconds.', v_wait, v_wait;
  end if;
end $$;

-- Points already won from games today (for the daily cap)
create or replace function public.game_points_today(p_uid uuid, p_code text)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(gr.points), 0)::integer from public.game_rewards gr
    join public.game_sessions gs on gs.id = gr.session_id
   where gr.customer_id = p_uid and gs.game_code = p_code
     and public.manila_date(gr.created_at) = public.manila_today()
$$;

-- Grants a prize once per session and closes the session
create or replace function public.grant_game_prize(
  p_session public.game_sessions, p_prize public.game_prizes, p_score integer
) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  g public.games;
  v_type public.prize_type := coalesce(p_prize.prize_type, 'none');
  v_points integer := 0;
  v_label text := coalesce(p_prize.label, 'Better luck next time');
  v_reward public.rewards;
  r public.reward_redemptions;
  v_note text := null;
begin
  select * into g from public.games where code = p_session.game_code;

  if v_type = 'points' then
    v_points := least(p_prize.points, greatest(g.daily_points_cap - public.game_points_today(p_session.customer_id, g.code), 0));
    if v_points <= 0 then
      v_type := 'none';
      v_note := 'You reached today''s points cap for this game.';
      v_label := 'Daily cap reached';
    elsif v_points < p_prize.points then
      v_label := '+' || v_points || ' points (daily cap)';
    end if;
  elsif v_type = 'reward' then
    select * into v_reward from public.rewards where id = p_prize.reward_id and is_active
       and (expires_at is null or expires_at > now());
    if not found or (v_reward.total_limit is not null and (
        select count(*) from public.reward_redemptions where reward_id = v_reward.id and status <> 'cancelled'
      ) >= v_reward.total_limit) then
      v_type := 'none';
      v_label := 'Prize ran out — no prize this time';
    else
      r := public.issue_redemption(v_reward, p_session.customer_id, 'game', 0);
    end if;
  end if;

  insert into public.game_rewards (session_id, customer_id, prize_id, prize_type, points, redemption_id, label)
  values (p_session.id, p_session.customer_id, p_prize.id, v_type, v_points, r.id, v_label);

  if v_points > 0 then
    perform public.add_ledger_entry(p_session.customer_id, v_points, 'game_reward', g.name || ' prize',
      'game:' || p_session.id, null, null, null, p_session.id);
  end if;

  update public.game_sessions
     set status = 'completed', score = p_score, prize_label = v_label, completed_at = now()
   where id = p_session.id;

  return jsonb_build_object(
    'score', p_score, 'prize_type', v_type, 'points', v_points, 'label', v_label,
    'reward_code', r.code, 'reward_name', v_reward.name, 'note', v_note,
    'prize_id', p_prize.id);
end $$;

-- Picks the best prize tier reached for score-based games
create or replace function public.prize_for_score(p_code text, p_score integer)
returns public.game_prizes language sql stable security definer set search_path = public as $$
  select * from public.game_prizes
   where game_code = p_code and is_active and min_score <= p_score
   order by min_score desc, sort_order limit 1
$$;

-- ---------------------------------------------------------------------------
-- Start a round
-- ---------------------------------------------------------------------------
create or replace function public.game_start(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_signed_in();
  g public.games;
  v_session public.game_sessions;
  v_public jsonb;
  v_secret jsonb;
  v_items jsonb;
  v_deck jsonb;
  v_duration integer;
  v_count integer;
begin
  if p_code = 'wheel' then raise exception 'Use the spin button for the wheel.'; end if;
  select * into g from public.games where code = p_code for update; -- serializes starts
  if not found then raise exception 'Game not found.'; end if;

  perform public.expire_game_sessions(v_uid, p_code);
  select * into v_session from public.game_sessions
   where customer_id = v_uid and game_code = p_code and status = 'started';
  if found then
    -- Resume the live round instead of starting another one
    return jsonb_build_object('session_id', v_session.id, 'expires_at', v_session.expires_at,
      'started_at', v_session.started_at, 'state', v_session.public_state, 'resumed', true);
  end if;

  perform public.check_game_allowance(v_uid, g);

  if p_code = 'catch' then
    v_duration := coalesce((g.config ->> 'duration_seconds')::integer, 30);
    v_count := coalesce((g.config ->> 'item_count')::integer, 60);
    -- Pre-generated drop table: time (ms), horizontal position (%), kind
    select jsonb_agg(jsonb_build_object(
             'i', n - 1,
             't', ((n - 1) * (v_duration * 1000 - 2500) / v_count) + floor(random() * 300)::integer,
             'x', 8 + floor(random() * 84)::integer,
             'k', case when r < 0.12 then 'gold' when r < 0.40 then 'rock' else 'rice' end) order by n)
      into v_items
      from (select n, random() as r from generate_series(1, v_count) n) s;
    v_public := jsonb_build_object('duration_seconds', v_duration, 'items', v_items);
    v_secret := jsonb_build_object('items', v_items);
  elsif p_code = 'memory' then
    select jsonb_agg(sym order by random()) into v_deck
      from (select unnest(array['rice','hotdog','chicken','egg','pork','fish','drink','chili']) as sym
            union all
            select unnest(array['rice','hotdog','chicken','egg','pork','fish','drink','chili'])) d;
    v_public := jsonb_build_object('cards', 16, 'time_limit_seconds', 180);
    v_secret := jsonb_build_object('deck', v_deck, 'matched', '[]'::jsonb, 'pending', null,
      'moves', 0, 'last_flip_ms', 0);
  elsif p_code = 'quiz' then
    v_count := coalesce((g.config ->> 'question_count')::integer, 5);
    with q as (
      select id, question, choices, correct_index from public.quiz_questions
       where is_active order by random() limit v_count
    )
    select jsonb_agg(jsonb_build_object('id', id, 'question', question, 'choices', choices)),
           jsonb_agg(jsonb_build_object('id', id, 'correct', correct_index))
      into v_public, v_secret from q;
    if v_public is null then raise exception 'The quiz has no questions yet.'; end if;
    v_public := jsonb_build_object('questions', v_public, 'time_limit_seconds', 120);
    v_secret := jsonb_build_object('answers', v_secret);
  end if;

  insert into public.game_sessions (game_code, customer_id, public_state, expires_at)
  values (p_code, v_uid, v_public, now() + case p_code when 'catch' then interval '3 minutes'
                                                    when 'memory' then interval '4 minutes'
                                                    else interval '3 minutes' end)
  returning * into v_session;
  insert into public.game_session_secrets (session_id, secret) values (v_session.id, v_secret);

  return jsonb_build_object('session_id', v_session.id, 'expires_at', v_session.expires_at,
    'started_at', v_session.started_at, 'state', v_public, 'resumed', false);
end $$;

-- ---------------------------------------------------------------------------
-- Kubo Memory Match: the deck stays on the server; each flip is revealed here
-- ---------------------------------------------------------------------------
create or replace function public.game_memory_flip(p_session_id uuid, p_index integer)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_signed_in();
  v_session public.game_sessions;
  v_secret jsonb;
  v_deck jsonb;
  v_matched jsonb;
  v_pending integer;
  v_moves integer;
  v_now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000);
  v_symbol text;
  v_result jsonb;
begin
  select * into v_session from public.game_sessions
   where id = p_session_id and customer_id = v_uid and game_code = 'memory' for update;
  if not found then raise exception 'Game session not found.'; end if;
  if v_session.status <> 'started' then raise exception 'This round is over.'; end if;
  if v_session.expires_at <= now() then
    update public.game_sessions set status = 'expired' where id = p_session_id;
    return jsonb_build_object('expired', true);
  end if;

  select secret into v_secret from public.game_session_secrets where session_id = p_session_id for update;
  v_deck := v_secret -> 'deck';
  v_matched := v_secret -> 'matched';
  v_pending := (v_secret ->> 'pending')::integer;
  v_moves := (v_secret ->> 'moves')::integer;

  if p_index is null or p_index < 0 or p_index >= jsonb_array_length(v_deck) then
    raise exception 'Invalid card.';
  end if;
  if v_matched @> to_jsonb(p_index) then raise exception 'That card is already matched.'; end if;
  if v_pending = p_index then raise exception 'That card is already face up.'; end if;
  -- Humans cannot flip faster than this
  if v_now_ms - (v_secret ->> 'last_flip_ms')::bigint < 150 then
    raise exception 'Slow down a little!';
  end if;

  v_symbol := v_deck ->> p_index;
  if v_pending is null then
    v_secret := v_secret || jsonb_build_object('pending', p_index, 'last_flip_ms', v_now_ms);
    v_result := jsonb_build_object('index', p_index, 'symbol', v_symbol, 'first', true);
  else
    v_moves := v_moves + 1;
    if v_deck ->> v_pending = v_symbol then
      v_matched := v_matched || jsonb_build_array(v_pending, p_index);
    end if;
    v_result := jsonb_build_object('index', p_index, 'symbol', v_symbol, 'first', false,
      'other_index', v_pending, 'match', v_deck ->> v_pending = v_symbol, 'moves', v_moves,
      'done', jsonb_array_length(v_matched) = jsonb_array_length(v_deck));
    v_secret := v_secret || jsonb_build_object('pending', null, 'matched', v_matched,
      'moves', v_moves, 'last_flip_ms', v_now_ms);
  end if;
  update public.game_session_secrets set secret = v_secret where session_id = p_session_id;
  update public.game_sessions
     set public_state = public_state || jsonb_build_object('matched', v_matched, 'moves', v_moves)
   where id = p_session_id;
  return v_result;
end $$;

-- ---------------------------------------------------------------------------
-- Finish a round: score on the server, grant at most one prize
-- ---------------------------------------------------------------------------
create or replace function public.game_finish(p_session_id uuid, p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_signed_in();
  v_session public.game_sessions;
  v_secret jsonb;
  v_score integer := 0;
  v_elapsed_ms numeric;
  v_duration_ms integer;
  v_item jsonb;
  v_idx integer;
  v_seen integer[] := '{}';
  v_hits integer;
  v_answers jsonb;
  v_prize public.game_prizes;
  v_existing public.game_rewards;
  v_moves integer;
  v_pairs integer;
begin
  select * into v_session from public.game_sessions
   where id = p_session_id and customer_id = v_uid for update;
  if not found then raise exception 'Game session not found.'; end if;

  -- Replayed request: return the original result, never a second prize
  if v_session.status = 'completed' then
    select * into v_existing from public.game_rewards where session_id = p_session_id;
    return jsonb_build_object('score', v_session.score, 'prize_type', coalesce(v_existing.prize_type, 'none'),
      'points', coalesce(v_existing.points, 0), 'label', coalesce(v_existing.label, v_session.prize_label),
      'reward_code', (select code from public.reward_redemptions where id = v_existing.redemption_id),
      'replayed', true);
  end if;
  if v_session.status <> 'started' then raise exception 'This round has expired.'; end if;
  if v_session.expires_at + interval '15 seconds' <= now() then
    update public.game_sessions set status = 'expired' where id = p_session_id;
    raise exception 'This round has expired.';
  end if;

  select secret into v_secret from public.game_session_secrets where session_id = p_session_id;
  v_elapsed_ms := extract(epoch from (now() - v_session.started_at)) * 1000;

  if v_session.game_code = 'catch' then
    v_duration_ms := (v_session.public_state ->> 'duration_seconds')::integer * 1000;
    if v_elapsed_ms < v_duration_ms - 1500 then
      raise exception 'The round is not over yet.';
    end if;
    -- Count each caught item once, only if it really was rice and had already dropped
    if jsonb_typeof(p_payload -> 'caught') = 'array' then
      for v_idx in select distinct (x)::integer from jsonb_array_elements_text(p_payload -> 'caught') x
                    where x ~ '^[0-9]{1,4}$' loop
        v_item := v_secret -> 'items' -> v_idx;
        if v_item is not null and (v_item ->> 't')::integer <= v_elapsed_ms then
          v_score := v_score + case v_item ->> 'k' when 'rice' then 1 when 'gold' then 3 else 0 end;
          v_seen := v_seen || v_idx;
        end if;
      end loop;
    end if;
    v_hits := least(greatest(coalesce((p_payload ->> 'hits')::integer, 0), 0), 100);
    v_score := greatest(v_score - v_hits * 2, 0);
  elsif v_session.game_code = 'memory' then
    if jsonb_array_length(v_secret -> 'matched') <> jsonb_array_length(v_secret -> 'deck') then
      raise exception 'Match all the cards first.';
    end if;
    v_moves := (v_secret ->> 'moves')::integer;
    v_pairs := jsonb_array_length(v_secret -> 'deck') / 2;
    -- Perfect game (8 moves) = 100; each extra move costs 4 points
    v_score := greatest(100 - (v_moves - v_pairs) * 4, 0);
  elsif v_session.game_code = 'quiz' then
    v_answers := p_payload -> 'answers';
    if jsonb_typeof(v_answers) <> 'array' then raise exception 'Answers are missing.'; end if;
    select count(*) into v_score
      from jsonb_array_elements(v_secret -> 'answers') with ordinality a(ans, pos)
     where (v_answers ->> (pos - 1)::integer) = (ans ->> 'correct');
  else
    raise exception 'Unsupported game.';
  end if;

  v_prize := public.prize_for_score(v_session.game_code, v_score);
  return public.grant_game_prize(v_session, v_prize, v_score) || jsonb_build_object(
    'correct_answers', case when v_session.game_code = 'quiz' then v_secret -> 'answers' end);
end $$;

-- ---------------------------------------------------------------------------
-- Lucky Kubo Wheel: one call, the server picks the slice
-- ---------------------------------------------------------------------------
create or replace function public.game_spin_wheel()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_signed_in();
  g public.games;
  v_session public.game_sessions;
  v_prize public.game_prizes;
  v_total integer;
  v_roll numeric;
  v_slices jsonb;
  v_slice_index integer;
begin
  select * into g from public.games where code = 'wheel' for update;
  if not found then raise exception 'Game not found.'; end if;
  perform public.expire_game_sessions(v_uid, 'wheel');
  perform public.check_game_allowance(v_uid, g);

  select coalesce(sum(weight), 0) into v_total from public.game_prizes where game_code = 'wheel' and is_active;
  if v_total = 0 then raise exception 'The wheel has no prizes configured.'; end if;
  v_roll := random() * v_total;

  select p.* into v_prize from (
    select gp.*, sum(gp.weight) over (order by gp.sort_order, gp.id) as running
      from public.game_prizes gp where gp.game_code = 'wheel' and gp.is_active and gp.weight > 0
  ) p where p.running > v_roll order by p.running limit 1;

  select jsonb_agg(id order by sort_order, id) into v_slices
    from public.game_prizes where game_code = 'wheel' and is_active;
  select (pos - 1)::integer into v_slice_index
    from jsonb_array_elements_text(v_slices) with ordinality s(pid, pos) where pid = v_prize.id::text;

  insert into public.game_sessions (game_code, customer_id, public_state, expires_at)
  values ('wheel', v_uid, '{}'::jsonb, now() + interval '1 minute')
  returning * into v_session;

  return public.grant_game_prize(v_session, v_prize, 0) || jsonb_build_object('slice_index', v_slice_index);
end $$;

-- Play Zone overview for the signed-in player
create or replace function public.my_game_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.assert_signed_in();
begin
  return (
    select coalesce(jsonb_object_agg(g.code, jsonb_build_object(
      'plays_today', (select count(*) from public.game_sessions gs
                       where gs.customer_id = v_uid and gs.game_code = g.code
                         and public.manila_date(gs.started_at) = public.manila_today()),
      'daily_limit', g.daily_play_limit,
      'points_today', public.game_points_today(v_uid, g.code),
      'points_cap', g.daily_points_cap,
      'cooldown_until', (select max(coalesce(gs.completed_at, gs.started_at)) + make_interval(secs => g.cooldown_seconds)
                           from public.game_sessions gs where gs.customer_id = v_uid and gs.game_code = g.code)
    )), '{}'::jsonb)
    from public.games g
  );
end $$;
