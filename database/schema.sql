PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;
CREATE TABLE templates (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE campaigns (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
    template_id TEXT REFERENCES templates(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE contacts (
    id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL, email TEXT NOT NULL, email_key TEXT NOT NULL,
    opted_out INTEGER NOT NULL DEFAULT 0 CHECK (opted_out IN (0, 1)),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(campaign_id, email_key)
);
CREATE TABLE runs (
    id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('pending','running','completed','completed_with_errors','failed','interrupted')),
    provider TEXT NOT NULL CHECK(provider IN ('fake','resend')), from_address TEXT,
    subject_snapshot TEXT NOT NULL, body_snapshot TEXT NOT NULL,
    created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT, error_code TEXT,
    active_slot INTEGER UNIQUE CHECK(active_slot IS NULL OR active_slot = 1),
    CHECK ((status IN ('pending','running') AND active_slot = 1)
        OR (status NOT IN ('pending','running') AND active_slot IS NULL))
);
CREATE TABLE outcomes (
    id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL, position INTEGER NOT NULL,
    first_name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','sending','sent','skipped','failed','unknown','not_attempted')),
    provider_message_id TEXT, error_code TEXT, error_message TEXT,
    attempted_at TEXT, completed_at TEXT, UNIQUE(run_id, position)
);
CREATE INDEX runs_campaign_created ON runs(campaign_id, created_at);
INSERT INTO templates VALUES ('template_1', 'Customer research introduction', 'A quick question, {first_name}',
    'Hi {first_name}, I would love to learn how your team handles customer research.',
    '2026-09-04T00:00:00+00:00', '2026-09-04T00:00:00+00:00');
INSERT INTO campaigns VALUES ('campaign_1', 'Founding customer outreach',
    'A personal introduction to our first potential customers.', 'template_1',
    '2026-09-04T00:00:00+00:00', '2026-09-04T00:00:00+00:00');
INSERT INTO contacts VALUES
    ('contact_1','campaign_1','Maya','maya@example.com','maya@example.com',0,'2026-09-04T00:00:00+00:00','2026-09-04T00:00:00+00:00'),
    ('contact_2','campaign_1','Noah','noah@example.com','noah@example.com',0,'2026-09-04T00:00:00+00:00','2026-09-04T00:00:00+00:00'),
    ('contact_3','campaign_1','Sam','sam@example.com','sam@example.com',0,'2026-09-04T00:00:00+00:00','2026-09-04T00:00:00+00:00'),
    ('contact_4','campaign_1','Avery','avery@example.com','avery@example.com',1,'2026-09-04T00:00:00+00:00','2026-09-04T00:00:00+00:00');
PRAGMA user_version = 1;
COMMIT;
