import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect } from "react";
import {
  Loader2,
  Search,
  Trash2,
  Download,
  FileJson,
  FileText,
  Sparkles,
  Globe2,
  Clock3,
  MonitorSmartphone,
  Zap,
  ArrowRight,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { runSearch, deleteRun } from "@/lib/search.functions";
import { checkServerEnv } from "@/lib/env.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { countries as countryList, getFlagEmoji } from "@/lib/countries";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kraken SERP — Google Search Scraper" },
      {
        name: "description",
        content:
          "Scrape Google search results at scale. Bulk keywords, country/language targeting, CSV & JSON export.",
      },
      { property: "og:title", content: "Kraken SERP — Google Search Scraper" },
      {
        property: "og:description",
        content: "Bulk Google SERP scraping with export to CSV and JSON.",
      },
    ],
  }),
  component: Dashboard,
});

interface Run {
  id: string;
  keyword: string;
  country: string | null;
  language: string | null;
  pages: number;
  device: string;
  status: string;
  total_results: number;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

interface Result {
  id: string;
  run_id: string;
  keyword: string;
  position: number;
  page: number;
  kind: string;
  title: string | null;
  url: string | null;
  display_url: string | null;
  description: string | null;
  domain: string | null;
}

function Dashboard() {
  const qc = useQueryClient();
  const runFn = useServerFn(runSearch);
  const delFn = useServerFn(deleteRun);

  const [keywords, setKeywords] = useState("");
  const [country, setCountry] = useState("us");
  const [language, setLanguage] = useState("en");
  const [pages, setPages] = useState("1");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const quickPresets = [
    { label: "US · EN · Desktop", country: "us", language: "en", device: "desktop" as const },
    { label: "GB · EN · Mobile", country: "gb", language: "en", device: "mobile" as const },
    { label: "DE · DE · Desktop", country: "de", language: "de", device: "desktop" as const },
  ];

  

  const [searchType, setSearchType] = useState("web");
  const [safeSearch, setSafeSearch] = useState(true);
  const [countryQuery, setCountryQuery] = useState("");
  const filteredCountries = countryList.filter((c) =>
    c.name.toLowerCase().includes(countryQuery.toLowerCase()) || c.code.toLowerCase().includes(countryQuery.toLowerCase()),
  );

  function highlightText(text: string, q: string) {
    if (!q) return text;
    const lower = text.toLowerCase();
    const qi = q.toLowerCase();
    const idx = lower.indexOf(qi);
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);
    return (
      <>
        {before}
        <span className="rounded px-1 bg-yellow-200/40 text-yellow-900 dark:bg-yellow-500/30 dark:text-yellow-900">{match}</span>
        {after}
      </>
    );
  }

  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("search_runs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        return (data ?? []) as Run[];
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to fetch runs (check server envs)"
        );
        return [] as Run[];
      }
    },
    refetchInterval: 3000,
  });

  const resultsQuery = useQuery({
    queryKey: ["results", selectedRunId],
    enabled: !!selectedRunId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("search_results")
        .select("*")
        .eq("run_id", selectedRunId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Result[];
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const list = keywords
        .split(/[\n,]/)
        .map((k) => k.trim())
        .filter(Boolean);
      if (list.length === 0) throw new Error("Enter at least one keyword");
      if (list.length > 50) throw new Error("Max 50 keywords per batch");
      return runFn({
        data: {
          keywords: list,
          country,
          language,
          pages: Number(pages),
          device,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`Started ${res.runIds.length} search${res.runIds.length > 1 ? "es" : ""}`);
      qc.invalidateQueries({ queryKey: ["runs"] });
      if (res.runIds[0]) setSelectedRunId(res.runIds[0]);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Search failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["runs"] });
      setSelectedRunId(null);
    },
  });

  const selectedRun = useMemo(
    () => runsQuery.data?.find((r) => r.id === selectedRunId) ?? null,
    [runsQuery.data, selectedRunId],
  );

  const envCheckFn = useServerFn(checkServerEnv);
  const [envStatus, setEnvStatus] = useState<{ ok: boolean; missing: string[] } | null>(null);
  useEffect(() => {
    let mounted = true;
    envCheckFn().then((res) => {
      if (mounted) setEnvStatus(res ?? null);
    }).catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const totalCompletedRuns = runsQuery.data?.filter((r) => r.status === "completed").length ?? 0;
  const activeRuns = runsQuery.data?.filter((r) => r.status === "running").length ?? 0;
  const totalResults = runsQuery.data?.reduce((sum, run) => sum + run.total_results, 0) ?? 0;

  function downloadCSV() {
    const rows = resultsQuery.data ?? [];
    if (rows.length === 0) return toast.error("No results to export");
    const headers = [
      "Keyword",
      "Position",
      "Title",
      "URL",
      "Display URL",
      "Description",
      "Domain",
      "Page",
      "Date",
      "Time",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const created = new Date(selectedRun?.created_at ?? Date.now());
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        [
          r.keyword,
          r.position,
          r.title,
          r.url,
          r.display_url,
          r.description,
          r.domain,
          r.page,
          created.toISOString().slice(0, 10),
          created.toISOString().slice(11, 19),
        ]
          .map(esc)
          .join(","),
      ),
    ].join("\n");
    downloadBlob(csv, `serp-${selectedRun?.keyword ?? "results"}.csv`, "text/csv");
  }

  function downloadJSON() {
    const rows = resultsQuery.data ?? [];
    if (rows.length === 0) return toast.error("No results to export");
    downloadBlob(
      JSON.stringify({ run: selectedRun, results: rows }, null, 2),
      `serp-${selectedRun?.keyword ?? "results"}.json`,
      "application/json",
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(61,91,131,0.14),_transparent_35%),linear-gradient(135deg,_#f8fcff_0%,_#eef7fb_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(150,195,214,0.18),_transparent_35%),linear-gradient(135deg,_#0b1220_0%,_#121c2b_100%)]">
      <header className="sticky top-0 z-20 border-b border-white/50 bg-white/70 backdrop-blur-xl shadow-[0_12px_40px_-24px_rgba(61,91,131,0.45)] dark:border-slate-800/70 dark:bg-slate-950/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3D5B83] to-[#96C3D6] text-white shadow-[0_12px_28px_-16px_rgba(61,91,131,0.9)]">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-[#3D5B83] dark:text-[#96C3D6]">Kraken SERP</h1>
              <p className="text-xs text-muted-foreground">Search scraper · built for modern research</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="hidden rounded-full px-3 py-1 text-[11px] sm:inline-flex">Live refresh</Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">CSV + JSON</Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-8">
        {envStatus && !envStatus.ok && (
          <div className="rounded-lg border border-yellow-400/40 bg-yellow-50/60 p-4 text-sm text-yellow-900 dark:bg-yellow-900/10 dark:text-yellow-300">
            <div className="flex items-start justify-between gap-3">
              <div>
                <strong>Warning:</strong> Missing server environment variables — some live features may be disabled.
                <div className="mt-1 text-xs text-muted-foreground">
                  Missing: {envStatus.missing.join(", ")}
                </div>
              </div>
              <div className="shrink-0">
                <a
                  href="https://vercel.com/docs/environment-variables"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="rounded-md bg-yellow-400/90 px-3 py-1 text-xs font-semibold text-black"
                >
                  Fix on Vercel
                </a>
              </div>
            </div>
          </div>
        )}
        <section className="overflow-hidden rounded-[30px] border border-white/70 bg-white/70 p-4 shadow-[0_28px_90px_-40px_rgba(61,91,131,0.55)] backdrop-blur-xl sm:p-6 lg:p-8 dark:border-slate-800/70 dark:bg-slate-900/70">
          <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#96C3D6]/40 bg-[#96C3D6]/20 px-3 py-1 text-sm font-medium text-[#3D5B83] dark:text-[#96C3D6]">
                <Sparkles className="h-4 w-4" />
                <span>Polished SERP workflows for modern research teams</span>
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-[#3D5B83] sm:text-4xl dark:text-[#96C3D6]">
                Launch powerful search batches and review results in one elegant workspace.
              </h2>
              <p className="mt-3 max-w-xl text-sm text-slate-600 sm:text-base dark:text-slate-300">
                Toggle country and language targeting, switch between desktop and mobile, and export your findings in seconds.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {quickPresets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setCountry(preset.country);
                      setLanguage(preset.language);
                      setDevice(preset.device);
                    }}
                    className="rounded-full border border-[#96C3D6]/40 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#3D5B83]/40 hover:text-[#3D5B83] dark:bg-slate-800/80 dark:text-slate-300"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-[#96C3D6]/30 bg-white/70 p-3 shadow-sm backdrop-blur dark:bg-slate-800/70">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#3D5B83] dark:text-[#96C3D6]">
                    <Globe2 className="h-4 w-4" /> Country targeting
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Geo-tuned search control</p>
                </div>
                <div className="rounded-2xl border border-[#96C3D6]/30 bg-white/70 p-3 shadow-sm backdrop-blur dark:bg-slate-800/70">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#3D5B83] dark:text-[#96C3D6]">
                    <MonitorSmartphone className="h-4 w-4" /> Device mode
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Desktop or mobile view</p>
                </div>
                <div className="rounded-2xl border border-[#96C3D6]/30 bg-white/70 p-3 shadow-sm backdrop-blur dark:bg-slate-800/70">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#3D5B83] dark:text-[#96C3D6]">
                    <Zap className="h-4 w-4" /> Fast exports
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">CSV and JSON in one click</p>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/30 bg-gradient-to-br from-[#3D5B83] via-[#4f6f94] to-[#96C3D6] p-4 text-white shadow-[0_24px_60px_-28px_rgba(61,91,131,0.95)] sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white/80">Launch your first batch</p>
                  <h3 className="mt-1 text-xl font-semibold">Search setup</h3>
                </div>
                <div className="rounded-2xl bg-white/15 p-2">
                  <Search className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-white/20 bg-white/90 p-3 text-slate-700 shadow-sm">
                  <Label htmlFor="kw" className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                    Keywords
                  </Label>
                  <Textarea
                    id="kw"
                    placeholder={"best coffee grinder\nrtx 5090 review"}
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    rows={4}
                    className="mt-2 min-h-[80px] text-sm border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/20 bg-white/90 p-3 text-slate-700">
                    <Label htmlFor="country" className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                      Country
                    </Label>
                    <Select
                      value={country}
                      onValueChange={(v) => {
                        setCountry(v);
                        setCountryQuery("");
                      }}
                    >
                      <SelectTrigger id="country" className="mt-2 min-h-10 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition-colors focus:ring-0 focus-visible:ring-0 sm:h-8 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="w-[min(92vw,24rem)] max-h-[70vh] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xl">
                        <div className="p-2.5">
                          <Input
                            placeholder="Filter countries..."
                            value={countryQuery}
                            onChange={(e) => setCountryQuery(e.target.value)}
                            className="mb-2 h-9 text-sm"
                          />
                        </div>
                        <div className="max-h-[55vh] overflow-auto p-2">
                          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                            {filteredCountries.map((c) => (
                              <SelectItem key={c.code} value={c.code} className="min-h-11 rounded-xl px-2 py-2.5 sm:px-2">
                                <div className="flex w-full flex-wrap items-center justify-between gap-2">
                                  <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <span className="text-lg leading-none">{getFlagEmoji(c.code)}</span>
                                    <span className="min-w-0 flex-1 truncate text-sm">
                                      {highlightText(c.name, countryQuery)}
                                    </span>
                                  </div>
                                  <span className="shrink-0 rounded-full bg-slate-100/80 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
                                    {highlightText(c.code.toUpperCase(), countryQuery)}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </div>
                        </div>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-2xl border border-white/20 bg-white/90 p-3 text-slate-700">
                    <Label htmlFor="lang" className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                      Language
                    </Label>
                    <Input
                      id="lang"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      maxLength={5}
                      placeholder="en"
                      className="mt-2 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                    />
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/20 bg-white/90 p-3 text-slate-700">
                    <Label htmlFor="pages" className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                      Pages
                    </Label>
                    <Select value={pages} onValueChange={setPages}>
                      <SelectTrigger id="pages" className="mt-2 h-8 text-sm border-0 bg-transparent p-0 shadow-none focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-2xl border border-white/20 bg-white/90 p-3 text-slate-700">
                    <Label htmlFor="device" className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                      Device
                    </Label>
                    <Select value={device} onValueChange={(v) => setDevice(v as "desktop" | "mobile")}>
                      <SelectTrigger id="device" className="mt-2 h-8 text-sm border-0 bg-transparent p-0 shadow-none focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="desktop">Desktop</SelectItem>
                        <SelectItem value="mobile">Mobile</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 items-center">
                  <div className="flex items-center gap-3">
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">Search type</Label>
                    <Select value={searchType} onValueChange={setSearchType}>
                      <SelectTrigger className="w-36 h-8 text-sm text-white border-0 bg-transparent p-0 shadow-none focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="web">Web</SelectItem>
                        <SelectItem value="images">Images</SelectItem>
                        <SelectItem value="news">News</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/90">Safe search</Label>
                    <Switch className="scale-90" checked={safeSearch} onCheckedChange={(v) => setSafeSearch(Boolean(v))} />
                  </div>
                </div>

                <Button
                  onClick={() => runMutation.mutate()}
                  disabled={runMutation.isPending}
                  className="w-full justify-center rounded-2xl bg-white text-[#3D5B83] transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-[0_16px_32px_-20px_rgba(61,91,131,0.8)]"
                >
                  {runMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scraping…
                    </>
                  ) : (
                    <>
                      Run search <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,400px)_1fr]">
          <div className="space-y-6">
            <Card className="border-white/70 bg-white/80 shadow-[0_20px_60px_-35px_rgba(61,91,131,0.45)] backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-900/80">
              <CardHeader>
                <CardTitle className="text-[#3D5B83] dark:text-[#96C3D6]">Recent runs</CardTitle>
                <CardDescription>
                  {runsQuery.data?.length ?? 0} total · auto-refreshes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 p-2">
                {runsQuery.data?.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border/70 bg-background/60 px-3 py-8 text-center text-sm text-muted-foreground">
                    No runs yet. Start one above.
                  </div>
                )}
                {runsQuery.data?.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRunId(r.id)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent ${
                      selectedRunId === r.id ? "border-primary/40 bg-accent" : "border-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{r.keyword}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{r.total_results} results</span>
                      <span>·</span>
                      <span>{r.country?.toUpperCase()}</span>
                      <span>·</span>
                      <span>{new Date(r.created_at).toLocaleTimeString()}</span>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="min-h-[660px] border-white/70 bg-white/80 shadow-[0_20px_60px_-35px_rgba(61,91,131,0.45)] backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-900/80">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-[#3D5B83] dark:text-[#96C3D6]">
                  {selectedRun ? selectedRun.keyword : "Select a run"}
                </CardTitle>
                <CardDescription>
                  {selectedRun
                    ? `${selectedRun.total_results} results · ${selectedRun.country?.toUpperCase()} · ${
                        selectedRun.language
                      } · ${selectedRun.pages} page${selectedRun.pages > 1 ? "s" : ""}${
                        selectedRun.duration_ms
                          ? ` · ${(selectedRun.duration_ms / 1000).toFixed(1)}s`
                          : ""
                      }`
                    : "Pick a run from the list to view its SERP results"}
                </CardDescription>
              </div>
              {selectedRun && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={downloadCSV} className="transition-all duration-200 hover:-translate-y-0.5">
                    <FileText className="mr-1.5 h-4 w-4" /> CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadJSON} className="transition-all duration-200 hover:-translate-y-0.5">
                    <FileJson className="mr-1.5 h-4 w-4" /> JSON
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(selectedRun.id)}
                    className="transition-all duration-200 hover:-translate-y-0.5"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-[#96C3D6]/30 bg-white/70 p-3 shadow-sm backdrop-blur dark:bg-slate-800/70">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#3D5B83] dark:text-[#96C3D6]">
                    <Clock3 className="h-4 w-4" /> Runs
                  </div>
                  <p className="mt-2 text-2xl font-semibold">{runsQuery.data?.length ?? 0}</p>
                </div>
                <div className="rounded-2xl border border-[#96C3D6]/30 bg-white/70 p-3 shadow-sm backdrop-blur dark:bg-slate-800/70">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#3D5B83] dark:text-[#96C3D6]">
                    <Zap className="h-4 w-4" /> Completed
                  </div>
                  <p className="mt-2 text-2xl font-semibold">{totalCompletedRuns}</p>
                </div>
                <div className="rounded-2xl border border-[#96C3D6]/30 bg-white/70 p-3 shadow-sm backdrop-blur dark:bg-slate-800/70">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#3D5B83] dark:text-[#96C3D6]">
                    <Search className="h-4 w-4" /> Results
                  </div>
                  <p className="mt-2 text-2xl font-semibold">{totalResults}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <div className="rounded-full border border-[#96C3D6]/30 bg-[#96C3D6]/10 px-3 py-1.5 text-xs font-medium text-[#3D5B83] dark:text-[#96C3D6]">
                  Smart presets enabled
                </div>
                <div className="rounded-full border border-[#96C3D6]/30 bg-[#96C3D6]/10 px-3 py-1.5 text-xs font-medium text-[#3D5B83] dark:text-[#96C3D6]">
                  Export ready
                </div>
                <div className="rounded-full border border-[#96C3D6]/30 bg-[#96C3D6]/10 px-3 py-1.5 text-xs font-medium text-[#3D5B83] dark:text-[#96C3D6]">
                  Auto-refresh on
                </div>
              </div>

              {selectedRun?.status === "failed" && (
                <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  {selectedRun.error ?? "Search failed"}
                </div>
              )}
              {selectedRun?.status === "running" && (
                <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/60 px-4 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Scraping in progress…
                </div>
              )}
              {selectedRun && resultsQuery.data && resultsQuery.data.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead className="w-40">Domain</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resultsQuery.data.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-muted-foreground">{r.position}</TableCell>
                          <TableCell>
                            <a
                              href={r.url ?? "#"}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="font-medium text-primary hover:underline"
                            >
                              {r.title || r.url}
                            </a>
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {r.description}
                            </p>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.domain}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {selectedRun && (!resultsQuery.data || resultsQuery.data.length === 0) && selectedRun.status !== "running" && selectedRun.status !== "failed" && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/60 py-16 text-center text-muted-foreground">
                  <Download className="mb-3 h-8 w-8 opacity-50" />
                  <p className="text-sm font-medium text-foreground">No results available yet</p>
                  <p className="mt-1 max-w-sm text-sm">This run is still processing or returned no matches.</p>
                </div>
              )}
              {!selectedRun && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/60 py-24 text-center text-muted-foreground">
                  <Download className="mb-3 h-8 w-8 opacity-50" />
                  <p className="text-sm font-medium text-foreground">Results appear here once a run completes</p>
                  <p className="mt-1 text-sm">Choose a run from the list to inspect its SERP data.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <div className="rounded-full border border-[#96C3D6]/30 bg-[#96C3D6]/10 px-3 py-1.5 text-xs font-medium text-[#3D5B83] dark:text-[#96C3D6]">
        Completed
      </div>
    );
  }
  if (status === "running") {
    return (
      <div className="rounded-full border border-primary/40 bg-accent/20 px-3 py-1.5 text-xs font-medium text-primary">
        Running
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="rounded-full border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive">
        Failed
      </div>
    );
  }
  return (
    <div className="rounded-full border border-input bg-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground">
      Pending
    </div>
  );
}

