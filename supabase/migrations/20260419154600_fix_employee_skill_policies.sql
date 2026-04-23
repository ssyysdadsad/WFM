DO $$
BEGIN
  -- 修复 employee_skill 缺失的 read/write policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'employee_skill' AND policyname = 'Allow authenticated read all'
  ) THEN
    CREATE POLICY "Allow authenticated read all" ON public.employee_skill FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'employee_skill' AND policyname = 'Allow anon insert'
  ) THEN
    CREATE POLICY "Allow anon insert" ON public.employee_skill FOR INSERT TO anon WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'employee_skill' AND policyname = 'Allow anon update'
  ) THEN
    CREATE POLICY "Allow anon update" ON public.employee_skill FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'employee_skill' AND policyname = 'Allow anon delete'
  ) THEN
    CREATE POLICY "Allow anon delete" ON public.employee_skill FOR DELETE TO anon USING (true);
  END IF;
END;
$$;
