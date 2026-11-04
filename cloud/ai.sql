-- Operational metadata only. Never store prompts, excerpts or generated text.
CREATE TABLE IF NOT EXISTS ai_requests (
 uid TEXT NOT NULL, id TEXT NOT NULL, day TEXT NOT NULL, minute INTEGER NOT NULL,
 reserved INTEGER NOT NULL CHECK(reserved>0), state TEXT NOT NULL DEFAULT 'active',
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 PRIMARY KEY(uid,id)
);
CREATE INDEX IF NOT EXISTS ai_requests_day ON ai_requests(day);
CREATE INDEX IF NOT EXISTS ai_requests_user_day ON ai_requests(uid,day);
CREATE TRIGGER IF NOT EXISTS ai_request_limits BEFORE INSERT ON ai_requests BEGIN
 SELECT CASE WHEN (SELECT COUNT(*) FROM ai_requests WHERE uid=NEW.uid AND day=NEW.day)>=10 THEN RAISE(ABORT,'ai_daily_limit') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM ai_requests WHERE uid=NEW.uid AND minute=NEW.minute)>=2 THEN RAISE(ABORT,'ai_minute_limit') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM ai_requests WHERE uid=NEW.uid AND state='active' AND expires_at>NEW.created_at) THEN RAISE(ABORT,'ai_active_limit') END;
 SELECT CASE WHEN COALESCE((SELECT SUM(reserved) FROM ai_requests WHERE day=NEW.day),0)+NEW.reserved>8000 THEN RAISE(ABORT,'ai_app_limit') END;
END;
