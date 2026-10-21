'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Sparkles, Target, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/lib/api';
import type { Batch, Fixture, Page } from '@/lib/types';
import { percent, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  EmptyState,
  ErrorState,
  LoadingCards,
  Metric,
  PageHeading,
  StatusBadge,
  TeamName,
} from '@/components/common';

interface Overview {
  totalPredictions: number;
  evaluatedPredictions: number;
  correct: number;
  accuracy: number | null;
  brierScore: number | null;
  coverage: number | null;
}

interface Point {
  period: string;
  accuracy: number | null;
  sampleSize: number;
}

export default function Dashboard() {
  const overview = useQuery({
    queryKey: ['overview', 'FORWARD'],
    queryFn: () => api<Overview>('/analytics/overview?mode=FORWARD'),
  });
  const fixtures = useQuery({
    queryKey: ['fixtures', 'dashboard'],
    queryFn: () => api<Page<Fixture>>('/fixtures?limit=5'),
  });
  const batches = useQuery({
    queryKey: ['batches', 'dashboard'],
    queryFn: () => api<Page<Batch>>('/prediction-batches?limit=3'),
  });
  const timeline = useQuery({
    queryKey: ['timeline', 'FORWARD'],
    queryFn: () => api<Point[]>('/analytics/timeline?mode=FORWARD'),
  });
  return (
    <>
      <PageHeading
        title="Good to see you"
        description="Track upcoming matches, prediction batches, and Jev's 1X2 accuracy."
        action={
          <Button asChild>
            <Link href="/predictions/generate">
              <Sparkles size={16} /> Generate Predictions
            </Link>
          </Button>
        }
      />
      {overview.isError ? (
        <ErrorState error={overview.error} retry={() => overview.refetch()} />
      ) : overview.isLoading ? (
        <LoadingCards />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Total predictions"
            value={overview.data?.totalPredictions ?? 0}
            detail="Live forward predictions"
            icon={<Sparkles size={18} />}
          />
          <Metric
            label="Evaluated"
            value={overview.data?.evaluatedPredictions ?? 0}
            detail="Final results received"
            icon={<CheckCircle2 size={18} />}
          />
          <Metric
            label="1X2 accuracy"
            value={percent(overview.data?.accuracy)}
            detail={`${overview.data?.correct ?? 0} correct predictions`}
            icon={<Target size={18} />}
          />
          <Metric
            label="Brier score"
            value={overview.data?.brierScore?.toFixed(3) ?? '—'}
            detail="Lower is better"
            icon={<TrendingUp size={18} />}
          />
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Accuracy over time</CardTitle>
                <CardDescription>Weekly live prediction accuracy</CardDescription>
              </div>
              <Link href="/performance" className="text-xs font-semibold text-primary">
                View analytics <ArrowRight size={13} className="inline" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {timeline.data?.length ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={timeline.data.map((row) => ({
                      ...row,
                      accuracyPct: row.accuracy === null ? null : row.accuracy * 100,
                    }))}
                  >
                    <defs>
                      <linearGradient id="accuracy" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#635BFF" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#635BFF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#EEF2F7" vertical={false} />
                    <XAxis dataKey="period" tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
                    <Area
                      type="monotone"
                      dataKey="accuracyPct"
                      stroke="#635BFF"
                      strokeWidth={2.5}
                      fill="url(#accuracy)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                Accuracy appears after predictions are evaluated.
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent batches</CardTitle>
            <CardDescription>Your latest prediction requests</CardDescription>
          </CardHeader>
          <CardContent>
            {batches.data?.items.length ? (
              <div className="divide-y divide-border">
                {batches.data.items.map((batch) => (
                  <Link
                    key={batch.id}
                    href={`/predictions/batches/${batch.id}`}
                    className="flex items-center justify-between gap-3 py-3 hover:text-primary"
                  >
                    <div>
                      <div className="text-sm font-semibold">Next {batch.periodHours} hours</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDate(batch.createdAt)}
                      </div>
                    </div>
                    <StatusBadge status={batch.status} />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">No batches yet.</div>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Upcoming fixtures</h3>
          <p className="text-sm text-muted-foreground">
            The next scheduled matches across enabled competitions
          </p>
        </div>
        <Button variant="secondary" asChild size="sm">
          <Link href="/fixtures">
            View all <ArrowRight size={14} />
          </Link>
        </Button>
      </div>
      {fixtures.isError ? (
        <ErrorState error={fixtures.error} retry={() => fixtures.refetch()} />
      ) : fixtures.data?.items.length ? (
        <Card className="divide-y divide-border overflow-hidden">
          {fixtures.data.items.map((fixture) => (
            <Link
              key={fixture.id}
              href={`/fixtures/${fixture.id}`}
              className="grid gap-2 px-5 py-4 text-sm hover:bg-slate-50 sm:grid-cols-[150px_1fr_170px_100px] sm:items-center"
            >
              <span className="text-xs text-muted-foreground">{formatDate(fixture.kickoff)}</span>
              <span className="flex flex-wrap items-center gap-2 font-medium">
                <TeamName name={fixture.homeTeam.name} crest={fixture.homeTeam.crest} />
                <span className="text-muted-foreground">vs</span>
                <TeamName name={fixture.awayTeam.name} crest={fixture.awayTeam.crest} />
              </span>
              <span className="text-xs text-muted-foreground">{fixture.competition.name}</span>
              <span>
                {fixture.latestPrediction ? (
                  <StatusBadge
                    status={fixture.latestPrediction.evaluation ? 'EVALUATED' : 'PREDICTED'}
                  />
                ) : (
                  <StatusBadge status="PENDING" />
                )}
              </span>
            </Link>
          ))}
        </Card>
      ) : (
        <EmptyState
          title="No upcoming fixtures"
          description="The worker will import fixtures after it starts. You can also run a sync from Settings."
          action={
            <Button asChild>
              <Link href="/settings">Open settings</Link>
            </Button>
          }
        />
      )}
    </>
  );
}
