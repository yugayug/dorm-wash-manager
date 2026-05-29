
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Machines
CREATE TABLE public.machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','occupied','finished')),
  out_of_service BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.machines TO authenticated, anon;
GRANT ALL ON public.machines TO service_role;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can view machines" ON public.machines FOR SELECT USING (true);
CREATE POLICY "admins manage machines" ON public.machines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Occupancies (active)
CREATE TABLE public.occupancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL UNIQUE REFERENCES public.machines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  room_number TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.occupancies TO authenticated, anon;
GRANT ALL ON public.occupancies TO service_role;
ALTER TABLE public.occupancies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can view occupancies" ON public.occupancies FOR SELECT USING (true);
CREATE POLICY "admins manage occupancies" ON public.occupancies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- History
CREATE TABLE public.usage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  machine_number INT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  room_number TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL,
  released_by TEXT NOT NULL DEFAULT 'auto', -- auto | admin | user
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.usage_history TO authenticated;
GRANT ALL ON public.usage_history TO service_role;
ALTER TABLE public.usage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can view history" ON public.usage_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage history" ON public.usage_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Settings (key/value)
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO authenticated, anon;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone read settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "admins write settings" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Atomic occupy function: locks the machine row, validates availability + grace, inserts occupancy
CREATE OR REPLACE FUNCTION public.occupy_machine(
  _machine_id UUID,
  _user_name TEXT,
  _room_number TEXT,
  _duration_minutes INT
) RETURNS public.occupancies
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _machine public.machines;
  _existing public.occupancies;
  _grace INT;
  _new public.occupancies;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to occupy a machine';
  END IF;
  IF _duration_minutes < 5 OR _duration_minutes > 180 THEN
    RAISE EXCEPTION 'Duration must be between 5 and 180 minutes';
  END IF;
  IF length(trim(_user_name)) = 0 OR length(_user_name) > 100 THEN
    RAISE EXCEPTION 'Invalid name';
  END IF;
  IF length(trim(_room_number)) = 0 OR length(_room_number) > 20 THEN
    RAISE EXCEPTION 'Invalid room number';
  END IF;

  SELECT * INTO _machine FROM public.machines WHERE id = _machine_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Machine not found'; END IF;
  IF _machine.out_of_service THEN RAISE EXCEPTION 'Machine is out of service'; END IF;

  SELECT (value->>0)::INT INTO _grace FROM public.app_settings WHERE key = 'grace_period_minutes';
  _grace := COALESCE(_grace, 5);

  SELECT * INTO _existing FROM public.occupancies WHERE machine_id = _machine_id FOR UPDATE;
  IF FOUND THEN
    -- If past end + grace, auto-release
    IF _existing.end_time + (_grace || ' minutes')::INTERVAL <= now() THEN
      INSERT INTO public.usage_history(machine_id, machine_number, user_id, user_name, room_number, start_time, end_time, duration_minutes, released_by)
      VALUES (_machine.id, _machine.number, _existing.user_id, _existing.user_name, _existing.room_number, _existing.start_time, _existing.end_time, _existing.duration_minutes, 'auto');
      DELETE FROM public.occupancies WHERE id = _existing.id;
    ELSE
      RAISE EXCEPTION 'This machine has just been occupied by another user.';
    END IF;
  END IF;

  INSERT INTO public.occupancies(machine_id, user_id, user_name, room_number, start_time, end_time, duration_minutes)
  VALUES (_machine_id, auth.uid(), trim(_user_name), trim(_room_number), now(), now() + (_duration_minutes || ' minutes')::INTERVAL, _duration_minutes)
  RETURNING * INTO _new;

  UPDATE public.machines SET status = 'occupied', updated_at = now() WHERE id = _machine_id;
  RETURN _new;
END $$;
GRANT EXECUTE ON FUNCTION public.occupy_machine(UUID, TEXT, TEXT, INT) TO authenticated;

-- Release function: only the occupying user or admin can release
CREATE OR REPLACE FUNCTION public.release_machine(_machine_id UUID, _force BOOLEAN DEFAULT false)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _machine public.machines;
  _occ public.occupancies;
  _released_by TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _machine FROM public.machines WHERE id = _machine_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Machine not found'; END IF;
  SELECT * INTO _occ FROM public.occupancies WHERE machine_id = _machine_id FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.machines SET status = 'available', updated_at = now() WHERE id = _machine_id;
    RETURN true;
  END IF;

  IF _occ.user_id = auth.uid() THEN
    _released_by := 'user';
  ELSIF public.has_role(auth.uid(), 'admin') THEN
    _released_by := 'admin';
  ELSE
    RAISE EXCEPTION 'You can only release your own machine';
  END IF;

  INSERT INTO public.usage_history(machine_id, machine_number, user_id, user_name, room_number, start_time, end_time, duration_minutes, released_by)
  VALUES (_machine.id, _machine.number, _occ.user_id, _occ.user_name, _occ.room_number, _occ.start_time, now(), _occ.duration_minutes, _released_by);
  DELETE FROM public.occupancies WHERE id = _occ.id;
  UPDATE public.machines SET status = 'available', updated_at = now() WHERE id = _machine_id;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.release_machine(UUID, BOOLEAN) TO authenticated;

-- Sweep expired (auto-release after grace)
CREATE OR REPLACE FUNCTION public.sweep_expired_machines()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _grace INT; _r RECORD; _count INT := 0;
BEGIN
  SELECT (value->>0)::INT INTO _grace FROM public.app_settings WHERE key = 'grace_period_minutes';
  _grace := COALESCE(_grace, 5);
  FOR _r IN
    SELECT o.*, m.number AS m_number FROM public.occupancies o
    JOIN public.machines m ON m.id = o.machine_id
    WHERE o.end_time + (_grace || ' minutes')::INTERVAL <= now()
  LOOP
    INSERT INTO public.usage_history(machine_id, machine_number, user_id, user_name, room_number, start_time, end_time, duration_minutes, released_by)
    VALUES (_r.machine_id, _r.m_number, _r.user_id, _r.user_name, _r.room_number, _r.start_time, _r.end_time, _r.duration_minutes, 'auto');
    DELETE FROM public.occupancies WHERE id = _r.id;
    UPDATE public.machines SET status = 'available', updated_at = now() WHERE id = _r.machine_id;
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END $$;
GRANT EXECUTE ON FUNCTION public.sweep_expired_machines() TO authenticated, anon;

-- Seed machines + settings
INSERT INTO public.machines (number, label) VALUES
  (1, 'Machine 1'), (2, 'Machine 2'), (3, 'Machine 3'), (4, 'Machine 4'), (5, 'Machine 5')
ON CONFLICT (number) DO NOTHING;
INSERT INTO public.app_settings (key, value) VALUES ('grace_period_minutes', '[5]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.machines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.occupancies;

-- Auto-promote a specific email to admin on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  IF lower(NEW.email) = 'agarwalyug4@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();
