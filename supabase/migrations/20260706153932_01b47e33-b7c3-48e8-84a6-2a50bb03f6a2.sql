
CREATE TABLE public.search_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword TEXT NOT NULL,
  country TEXT,
  language TEXT,
  pages INTEGER NOT NULL DEFAULT 1,
  device TEXT NOT NULL DEFAULT 'desktop',
  status TEXT NOT NULL DEFAULT 'pending',
  total_results INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE public.search_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.search_runs(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  position INTEGER NOT NULL,
  page INTEGER NOT NULL DEFAULT 1,
  kind TEXT NOT NULL DEFAULT 'organic',
  title TEXT,
  url TEXT,
  display_url TEXT,
  description TEXT,
  domain TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_search_results_run ON public.search_results(run_id);
CREATE INDEX idx_search_runs_created ON public.search_runs(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_runs TO anon, authenticated;
GRANT ALL ON public.search_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_results TO anon, authenticated;
GRANT ALL ON public.search_results TO service_role;

ALTER TABLE public.search_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read runs" ON public.search_runs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public write runs" ON public.search_runs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update runs" ON public.search_runs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete runs" ON public.search_runs FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "Public read results" ON public.search_results FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public write results" ON public.search_results FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public delete results" ON public.search_results FOR DELETE TO anon, authenticated USING (true);
