'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FlaskConical, Play, RefreshCw, XCircle } from 'lucide-react';
import { api, post } from '@/lib/api';
import type { Backtest, Competition, Page, Prediction } from '@/lib/types';
import { formatDate, percent, shortId } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState, Metric, PageHeading, StatusBadge } from '@/components/common';

interface Season {
  year: number;
  available: boolean;
}

interface Metrics {
  sampleSize: number;
  correct: number;
  accuracy: number | null;
  brierScore: number | null;
  logLoss: number | null;
  coverage: number | null;
  limitation: string | null;
}

interface Item {
  id: string;
  status: string;
  reason: string | null;
  fixture: {
    id: string;
    kickoff: string;
    homeTeam: { name: string };
    awayTeam: { name: string };
    competition: { name: string };
    homeScore: number;
    awayScore: number;
  };
  prediction: Prediction | null;
}

export default function BacktestingPage() {
  const [selectedCompetitions, setSelectedCompetitions] = useState<string[]>([]);
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>([]);
  const [cutoffHours, setCutoffHours] = useState(24);
  const [minimum, setMinimum] = useState(5);
  const [configId, setConfigId] = useState('default');
  const [runId, setRunId] = useState<string | null>(null);
  useEffect(() => {
    setRunId(localStorage.getItem('currentBacktestId'));
  }, []);
  const competitions = useQuery({
    queryKey: ['competitions'],
    queryFn: () => api<Competition[]>('/competitions'),
  });
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () =>
      api<{ configs: { id: string; model: string; featureSetVersion: string }[] }>('/settings'),
  });
  const seasons = useQuery({
    queryKey: ['seasons', selectedCompetitions],
    queryFn: async () =>
      (
        await Promise.all(
          selectedCompetitions.map((id) => api<Season[]>(`/competitions/${id}/seasons`)),
        )
      ).flat(),
    enabled: selectedCompetitions.length > 0,
  });
  const years = [
    ...new Set(
      seasons.data?.filter((season) => season.available).map((season) => season.year) ?? [],
    ),
  ].sort((a, b) => b - a);
  const runs = useQuery({
    queryKey: ['backtests'],
    queryFn: () => api<Page<Backtest>>('/backtests?limit=10'),
  });
  const run = useQuery({
    queryKey: ['backtest', runId],
    queryFn: () => api<Backtest>(`/backtests/${runId}`),
    enabled: !!runId,
    refetchInterval: (query) =>
      ['QUEUED', 'RUNNING'].includes(query.state.data?.status ?? '') ? 2000 : false,
  });
  const metrics = useQuery({
    queryKey: ['backtestMetrics', runId, run.data?.completedCount],
    queryFn: () => api<Metrics>(`/backtests/${runId}/metrics`),
    enabled: !!runId,
  });
  const items = useQuery({
    queryKey: ['backtestItems', runId, run.data?.completedCount],
    queryFn: () => api<Page<Item>>(`/backtests/${runId}/predictions?limit=20`),
    enabled: !!runId,
  });
  const start = useMutation({
    mutationFn: () =>
      post<Backtest>('/backtests', {
        competitions: selectedCompetitions,
        seasons: selectedSeasons,
        cutoffHours,
        minHistoricalMatches: minimum,
        predictionConfigId: configId,
      }),
    onSuccess: (value) => {
      setRunId(value.id);
      localStorage.setItem('currentBacktestId', value.id);
      runs.refetch();
    },
  });
  const cancel = useMutation({
    mutationFn: () => post(`/backtests/${runId}/cancel`),
    onSuccess: () => run.refetch(),
  });
  const resume = useMutation({
    mutationFn: () => post(`/backtests/${runId}/resume`),
    onSuccess: () => run.refetch(),
  });
  const toggleCompetition = (id: string) => {
    setSelectedCompetitions(
      selectedCompetitions.includes(id)
        ? selectedCompetitions.filter((item) => item !== id)
        : [...selectedCompetitions, id],
    );
    setSelectedSeasons([]);
  };
  const toggleSeason = (year: number) =>
    setSelectedSeasons(
      selectedSeasons.includes(year)
        ? selectedSeasons.filter((item) => item !== year)
        : [...selectedSeasons, year],
    );
  const progress = run.data?.totalFixtures
    ? Math.round(
        ((run.data.completedCount + run.data.failedCount + run.data.excludedCount) /
          run.data.totalFixtures) *
          100,
      )
    : 0;
  return (
    <>
      <PageHeading
        title="Historical backtesting"
        description="Evaluate Jev using features reconstructed from matches before each hypothetical kickoff."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-50 p-2 text-primary">
                <FlaskConical size={20} />
              </div>
              <div>
                <CardTitle>New backtest</CardTitle>
                <CardDescription>
                  Choose leagues, seasons, and the pre-match cutoff.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              <Label>Competitions</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {competitions.data?.map((competition) => (
                  <label
                    key={competition.id}
                    className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCompetitions.includes(competition.id)}
                      onChange={() => toggleCompetition(competition.id)}
                      disabled={!competition.available}
                      className="accent-[#635BFF]"
                    />
                    {competition.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <Label>Available seasons</Label>
              {years.length ? (
                <div className="flex flex-wrap gap-2">
                  {years.map((year) => (
                    <button
                      type="button"
                      key={year}
                      aria-pressed={selectedSeasons.includes(year)}
                      onClick={() => toggleSeason(year)}
                      className={`rounded-lg border px-3 py-2 text-sm ${selectedSeasons.includes(year) ? 'border-primary bg-indigo-50 font-semibold text-primary' : 'border-border'}`}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a competition to load its available seasons.
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cutoff">Cutoff before kickoff</Label>
                <Select
                  id="cutoff"
                  value={cutoffHours}
                  onChange={(e) => setCutoffHours(Number(e.target.value))}
                >
                  <option value={6}>6 hours</option>
                  <option value={12}>12 hours</option>
                  <option value={24}>24 hours</option>
                  <option value={48}>48 hours</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="minimum">Minimum earlier matches</Label>
                <Input
                  id="minimum"
                  type="number"
                  min={0}
                  max={50}
                  value={minimum}
                  onChange={(e) => setMinimum(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Model and feature set</Label>
              <Select id="model" value={configId} onChange={(e) => setConfigId(e.target.value)}>
                {settings.data?.configs.map((config) => (
                  <option key={config.id} value={config.id}>
                    {config.model} · {config.featureSetVersion}
                  </option>
                ))}
              </Select>
            </div>
            {start.error && (
              <p role="alert" className="text-sm text-red-600">
                {start.error.message}
              </p>
            )}
            <Button
              disabled={start.isPending || !selectedCompetitions.length || !selectedSeasons.length}
              onClick={() => start.mutate()}
            >
              <Play size={16} /> {start.isPending ? 'Starting…' : 'Start backtest'}
            </Button>
          </CardContent>
        </Card>
        <Card data-testid="current-backtest">
          <CardHeader>
            <CardTitle>Current run</CardTitle>
            <CardDescription>
              Historical scoring stays separate from live prediction metrics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {run.data ? (
              <div className="space-y-5">
                <div className="flex justify-between">
                  <span className="font-mono text-sm">{shortId(run.data.id)}</span>
                  <StatusBadge status={run.data.status} />
                </div>
                <Progress value={progress} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{progress}% processed</span>
                  <span>
                    {run.data.completedCount} / {run.data.totalFixtures} predicted
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center text-sm">
                  <div>
                    <strong className="block text-xl">{run.data.completedCount}</strong>
                    <span className="text-xs text-muted-foreground">Completed</span>
                  </div>
                  <div>
                    <strong className="block text-xl">{run.data.excludedCount}</strong>
                    <span className="text-xs text-muted-foreground">Excluded</span>
                  </div>
                  <div>
                    <strong className="block text-xl">{run.data.failedCount}</strong>
                    <span className="text-xs text-muted-foreground">Failed</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {['QUEUED', 'RUNNING'].includes(run.data.status) && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => cancel.mutate()}
                      disabled={cancel.isPending}
                    >
                      <XCircle size={14} /> Cancel
                    </Button>
                  )}
                  {['CANCELLED', 'FAILED', 'COMPLETED_WITH_ERRORS'].includes(run.data.status) && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => resume.mutate()}
                      disabled={resume.isPending}
                    >
                      <RefreshCw size={14} /> Resume
                    </Button>
                  )}
                </div>
                {run.data.limitation && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                    {run.data.limitation}
                  </div>
                )}
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Start or select a backtest run.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      {run.data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="Evaluated" value={metrics.data?.sampleSize ?? 0} />
            <Metric label="Correct" value={metrics.data?.correct ?? 0} />
            <Metric label="Accuracy" value={percent(metrics.data?.accuracy)} />
            <Metric label="Brier score" value={metrics.data?.brierScore?.toFixed(3) ?? '—'} />
            <Metric label="Log loss" value={metrics.data?.logLoss?.toFixed(3) ?? '—'} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Sample predictions</CardTitle>
            </CardHeader>
            <CardContent>
              {items.data?.items.length ? (
                <div className="divide-y divide-border">
                  {items.data.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                    >
                      <div>
                        <div className="font-medium">
                          {item.fixture.homeTeam.name} vs {item.fixture.awayTeam.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.fixture.competition.name} · {formatDate(item.fixture.kickoff)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={item.status} />
                        {item.prediction && (
                          <Link
                            href={`/predictions/${item.prediction.id}`}
                            className="font-semibold text-primary"
                          >
                            Details →
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No match records yet.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
      <div>
        <h3 className="mb-3 text-lg font-semibold">Previous runs</h3>
        {runs.isError ? (
          <ErrorState error={runs.error} retry={() => runs.refetch()} />
        ) : runs.data?.items.length ? (
          <Card className="divide-y divide-border">
            {runs.data.items.map((item) => (
              <button
                key={item.id}
                className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50"
                onClick={() => {
                  setRunId(item.id);
                  localStorage.setItem('currentBacktestId', item.id);
                }}
              >
                <span>
                  <strong className="font-mono text-sm">{shortId(item.id)}</strong>
                  <span className="ml-3 text-xs text-muted-foreground">
                    {formatDate(item.createdAt)}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {item.competitions.join(', ')} · {item.seasons.join(', ')}
                  </span>
                </span>
                <StatusBadge status={item.status} />
              </button>
            ))}
          </Card>
        ) : (
          <EmptyState
            title="No backtests yet"
            description="Run a small historical sample to benchmark the model."
          />
        )}
      </div>
    </>
  );
}
