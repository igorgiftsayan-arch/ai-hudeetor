CREATE TABLE marathons (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  timezone text NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_marathons_dates CHECK (ends_on >= starts_on)
);

CREATE TABLE marathon_teams (
  id uuid PRIMARY KEY,
  marathon_id uuid NOT NULL REFERENCES marathons(id),
  name text NOT NULL,
  join_code_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_marathon_teams_join_code_hash UNIQUE (join_code_hash),
  CONSTRAINT uq_marathon_teams_marathon_name UNIQUE (marathon_id, name)
);

CREATE TABLE marathon_memberships (
  id uuid PRIMARY KEY,
  marathon_id uuid NOT NULL REFERENCES marathons(id),
  team_id uuid NOT NULL REFERENCES marathon_teams(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL,
  baseline_weight_kg numeric(6,2),
  baseline_weight_entry_id uuid REFERENCES weight_entries(id),
  baseline_captured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_marathon_memberships_role CHECK (role IN ('captain','participant')),
  CONSTRAINT uq_marathon_memberships_marathon_user UNIQUE (marathon_id, user_id)
);
CREATE UNIQUE INDEX uq_marathon_memberships_team_captain
  ON marathon_memberships(team_id) WHERE role='captain';
CREATE INDEX idx_marathon_memberships_team_id ON marathon_memberships(team_id);

CREATE TABLE marathon_wellness_reports (
  id uuid PRIMARY KEY,
  membership_id uuid NOT NULL REFERENCES marathon_memberships(id),
  report_date date NOT NULL,
  morning_shake boolean NOT NULL,
  physical_activity boolean NOT NULL,
  water_target boolean NOT NULL,
  second_shake boolean NOT NULL,
  healthy_dinner boolean NOT NULL,
  good_sleep boolean NOT NULL,
  no_junk_food boolean NOT NULL,
  no_smoking boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_marathon_wellness_reports_membership_date UNIQUE (membership_id, report_date)
);
CREATE INDEX idx_marathon_wellness_reports_date ON marathon_wellness_reports(report_date);

CREATE TABLE marathon_captain_tasks (
  id uuid PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES marathon_teams(id),
  task_date date NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  created_by_membership_id uuid NOT NULL REFERENCES marathon_memberships(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_marathon_captain_tasks_team_date UNIQUE (team_id, task_date)
);

CREATE TABLE marathon_task_completions (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES marathon_captain_tasks(id),
  membership_id uuid NOT NULL REFERENCES marathon_memberships(id),
  completed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_marathon_task_completions_task_membership UNIQUE (task_id, membership_id)
);

CREATE INDEX idx_marathons_dates ON marathons(starts_on, ends_on);
