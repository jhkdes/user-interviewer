-- Text interview mode (feedback studies only) — see TEXT_INTERVIEW_MODE.md.
-- Foundation only: nothing in the app reads or writes these yet except the
-- repository layer.

-- How the participant takes the interview. Every existing row is voice.
alter table interviews
  add column mode text not null default 'voice'
    check (mode in ('voice', 'text'));

-- Text mode idle handling: last participant/interviewer/typing activity, and
-- when the one-time "are you still there?" nudge was inserted.
alter table interviews add column last_activity_at timestamptz;
alter table interviews add column idle_nudge_sent_at timestamptz;

-- Set when a started voice interview was restarted as a typing interview.
alter table interviews add column switched_to_text_at timestamptz;

-- Messages of an in-progress text interview. Append-only while the interview
-- runs; the rows are deleted once the transcript has been written into
-- interviews.transcript, so the redactable transcript is the only copy.
create table interview_messages (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references interviews (id) on delete cascade,
  seq integer not null check (seq >= 1),
  speaker text not null check (speaker in ('interviewer', 'participant')),
  text text not null,
  client_message_id text,
  created_at timestamptz not null default now(),
  -- The database enforces ordering and rejects two writers claiming the
  -- same slot.
  constraint interview_messages_interview_seq_key unique (interview_id, seq),
  -- Makes a retried / double-submitted participant message a no-op. Unique
  -- constraints allow multiple NULLs, so interviewer messages are unaffected.
  constraint interview_messages_interview_client_message_key
    unique (interview_id, client_message_id)
);

-- Same deny-all posture as the other tables (see 0005_enable_rls.sql): every
-- real read/write goes through the server-only service-role key.
alter table interview_messages enable row level security;

-- Atomically appends one message to an in-progress interview.
--
--   * p_after_seq: when not null, the append only succeeds if the interview's
--     current last seq equals it (0 for an empty interview) — optimistic
--     concurrency for callers that decided what to say based on a specific
--     state of the conversation.
--   * The status check and the insert happen under a share lock on the
--     interview row, so an interview cannot be completed in between (the
--     completing UPDATE needs the row lock and waits for this transaction).
--
-- Returns jsonb: { "outcome": "appended" | "duplicate" | "conflict" |
-- "interview-not-in-progress" | "interview-not-found", "message": {...}? }.
create function append_interview_message(
  p_interview_id uuid,
  p_speaker text,
  p_text text,
  p_client_message_id text default null,
  p_after_seq integer default null
) returns jsonb
language plpgsql
as $$
declare
  v_status text;
  v_last_seq integer;
  v_row interview_messages;
begin
  select status into v_status
    from interviews
    where id = p_interview_id
    for share;

  if not found then
    return jsonb_build_object('outcome', 'interview-not-found');
  end if;

  -- A retry of a message that was already stored is answered with the stored
  -- message, even if the interview has completed since.
  if p_client_message_id is not null then
    select * into v_row
      from interview_messages
      where interview_id = p_interview_id
        and client_message_id = p_client_message_id;
    if found then
      return jsonb_build_object('outcome', 'duplicate', 'message', to_jsonb(v_row));
    end if;
  end if;

  if v_status <> 'in-progress' then
    return jsonb_build_object('outcome', 'interview-not-in-progress');
  end if;

  select coalesce(max(seq), 0) into v_last_seq
    from interview_messages
    where interview_id = p_interview_id;

  if p_after_seq is not null and p_after_seq <> v_last_seq then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  begin
    insert into interview_messages (interview_id, seq, speaker, text, client_message_id)
      values (p_interview_id, v_last_seq + 1, p_speaker, p_text, p_client_message_id)
      returning * into v_row;
  exception when unique_violation then
    -- Another writer claimed this seq (or this client_message_id) between our
    -- read and our insert.
    if p_client_message_id is not null then
      select * into v_row
        from interview_messages
        where interview_id = p_interview_id
          and client_message_id = p_client_message_id;
      if found then
        return jsonb_build_object('outcome', 'duplicate', 'message', to_jsonb(v_row));
      end if;
    end if;
    return jsonb_build_object('outcome', 'conflict');
  end;

  return jsonb_build_object('outcome', 'appended', 'message', to_jsonb(v_row));
end;
$$;
