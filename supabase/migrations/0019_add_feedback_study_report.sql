alter table study_reports add column type text not null default 'discovery' check (type in ('discovery', 'feedback'));
alter table study_reports add column what_worked_well jsonb not null default '[]';
alter table study_reports add column what_could_be_improved jsonb not null default '[]';
alter table study_reports add column topics_for_future jsonb not null default '[]';
alter table study_reports add column other_insights jsonb not null default '[]';
