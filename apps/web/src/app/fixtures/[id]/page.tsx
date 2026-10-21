'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { api, post } from '@/lib/api';
import type { Fixture, Prediction } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  EmptyState,
  ErrorState,
  PageHeading,
  ProbabilityBars,
  StatusBadge,
  TeamName,
} from '@/components/common';

export default function FixturePage() {
  const id = useParams<{ id: string }>().id;
  const fixture = useQuery({
    queryKey: ['fixture', id],
    queryFn: () => api<Fixture>(`/fixtures/${id}`),
  });
  const history = useQuery({
    queryKey: ['fixturePredictions', id],
    queryFn: () => api<Prediction[]>(`/fixtures/${id}/predictions`),
  });
  const predict = useMutation({
    mutationFn: () => post<{ batchId: string }>(`/admin/predictions/${id}/run`),
    onSuccess: () => {
      fixture.refetch();
      history.refetch();
    },
  });
  if (fixture.isError) return <ErrorState error={fixture.error} retry={() => fixture.refetch()} />;
  const row = fixture.data;
  const snapshot = history.data?.at(-1)?.snapshot as
    | {
        home?: {
          played: number;
          recentPoints: number;
          goalsFor: number;
          goalsAgainst: number;
          elo: number;
        };
        away?: {
          played: number;
          recentPoints: number;
          goalsFor: number;
          goalsAgainst: number;
          elo: number;
        };
      }
    | undefined;
  return (
    <>
      <Link
        href="/fixtures"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft size={16} /> Back to fixtures
      </Link>
      {row && (
        <>
          <PageHeading
            title={`${row.homeTeam.name} vs ${row.awayTeam.name}`}
            description={`${row.competition.name} · ${formatDate(row.kickoff)}`}
            action={<StatusBadge status={row.status} />}
          />
          <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
            <Card>
              <CardHeader>
                <CardTitle>Match overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center justify-around gap-4 py-6 text-center">
                  <div className="min-w-36">
                    <div className="flex justify-center">
                      <TeamName name={row.homeTeam.name} crest={row.homeTeam.crest} />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Home</div>
                  </div>
                  <div className="text-2xl font-bold">
                    {row.homeScore !== null && row.awayScore !== null
                      ? `${row.homeScore} : ${row.awayScore}`
                      : 'vs'}
                  </div>
                  <div className="min-w-36">
                    <div className="flex justify-center">
                      <TeamName name={row.awayTeam.name} crest={row.awayTeam.crest} />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Away</div>
                  </div>
                </div>
                <div className="grid gap-3 border-t border-border pt-5 text-sm sm:grid-cols-3">
                  <div>
                    <span className="text-muted-foreground">Competition</span>
                    <div className="font-medium">{row.competition.name}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Season</span>
                    <div className="font-medium">{row.season ?? 'Current'}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Kickoff</span>
                    <div className="font-medium">{formatDate(row.kickoff)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Latest Jev prediction</CardTitle>
              </CardHeader>
              <CardContent>
                {row.latestPrediction?.probabilities ? (
                  <>
                    <ProbabilityBars probabilities={row.latestPrediction.probabilities} />
                    <div className="mt-5 flex justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                      <span>
                        {row.latestPrediction.modelVersion}
                        <span className="mt-1 block">
                          Generated {formatDate(row.latestPrediction.predictedAt)}
                        </span>
                      </span>
                      <Link
                        className="font-semibold text-primary"
                        href={`/predictions/${row.latestPrediction.id}`}
                      >
                        View details
                      </Link>
                    </div>
                    {row.latestPrediction.evaluation && (
                      <div className="mt-3 text-xs font-semibold">
                        Actual outcome:{' '}
                        {row.latestPrediction.evaluation.actualOutcome.replaceAll('_', ' ')} ·{' '}
                        {row.latestPrediction.evaluation.correct ? 'Correct' : 'Incorrect'}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mb-5 text-sm text-muted-foreground">
                      This fixture does not have a prediction yet.
                    </p>
                    {row.status === 'SCHEDULED' && (
                      <Button disabled={predict.isPending} onClick={() => predict.mutate()}>
                        <Sparkles size={16} /> Predict match
                      </Button>
                    )}
                  </>
                )}
                {predict.error && (
                  <p className="mt-3 text-xs text-red-600">{predict.error.message}</p>
                )}
                {predict.data && (
                  <Link
                    href={`/predictions/batches/${predict.data.batchId}`}
                    className="mt-3 block text-xs font-semibold text-primary"
                  >
                    View queued batch
                  </Link>
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Pre-match statistics</CardTitle>
            </CardHeader>
            <CardContent>
              {snapshot?.home && snapshot?.away ? (
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <div className="text-muted-foreground">Statistic</div>
                  <div className="font-semibold">{row.homeTeam.name}</div>
                  <div className="font-semibold">{row.awayTeam.name}</div>
                  {[
                    ['Earlier matches', snapshot.home.played, snapshot.away.played],
                    ['Recent points', snapshot.home.recentPoints, snapshot.away.recentPoints],
                    ['Goals scored', snapshot.home.goalsFor, snapshot.away.goalsFor],
                    ['Goals conceded', snapshot.home.goalsAgainst, snapshot.away.goalsAgainst],
                    ['Pre-match Elo', Math.round(snapshot.home.elo), Math.round(snapshot.away.elo)],
                  ].map(([label, home, away]) => (
                    <div className="contents" key={String(label)}>
                      <div className="text-muted-foreground">{label}</div>
                      <div>{home}</div>
                      <div>{away}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Pre-match statistics appear after a prediction is generated.
                </p>
              )}
            </CardContent>
          </Card>
          <div>
            <h3 className="mb-3 text-lg font-semibold">Prediction history</h3>
            {history.data?.length ? (
              <Card className="divide-y divide-border">
                {history.data.map((prediction) => (
                  <Link
                    href={`/predictions/${prediction.id}`}
                    key={prediction.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-slate-50"
                  >
                    <div>
                      <div className="text-sm font-semibold">{prediction.modelVersion}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(prediction.predictedAt)} · {prediction.mode}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={prediction.status} />
                      <span className="text-xs font-semibold text-primary">Details →</span>
                    </div>
                  </Link>
                ))}
              </Card>
            ) : (
              <EmptyState
                title="No prediction versions"
                description="Generate a prediction to begin this fixture's history."
              />
            )}
          </div>
        </>
      )}
    </>
  );
}
