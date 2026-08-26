-- Optional full raw system-prompt override, mutually exclusive with research_topic (nullable = optional).
alter table studies add column custom_prompt text;
