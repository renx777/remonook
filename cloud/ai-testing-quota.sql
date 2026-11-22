-- Install the shared guard before retiring the old trigger. Keep all reservations.
CREATE TRIGGER IF NOT EXISTS ai_shared_limits BEFORE INSERT ON ai_requests BEGIN
 SELECT CASE WHEN COALESCE((SELECT SUM(reserved) FROM ai_requests WHERE day=NEW.day),0)+NEW.reserved>8000 THEN RAISE(ABORT,'ai_app_limit') END;
END;
DROP TRIGGER IF EXISTS ai_request_limits;
