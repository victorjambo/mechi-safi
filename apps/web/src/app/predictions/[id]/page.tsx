'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import type { Prediction } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, PageHeading, ProbabilityBars, StatusBadge } from '@/components/common';

export default function PredictionDetail() {
  const id = useParams<{ id: string }>().id;
  const query = useQuery({
    queryKey: ['prediction', id],
    queryFn: () =>
      api<
        Prediction & {
          rawRequest: unknown;
          rawResponse: unknown;
          config: { featureSetVersion: string; questionVersion: string };
        }
      >(`/predictions/${id}`),
  });
  if (query.isError) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  const p = query.data;
  return (
    <>
      <Link
        href="/predictions/history"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft size={16} /> Prediction history
      </Link>
      {p && (
        <>
          <PageHeading
            title={`${p.fixture?.homeTeam.name ?? 'Home'} vs ${p.fixture?.awayTeam.name ?? 'Away'}`}
            description={`${p.fixture?.competition.name ?? ''} · ${formatDate(p.fixture?.kickoff ?? p.predictedAt)}`}
            action={<StatusBadge status={p.status} />}
          />
          <div className="grid gap-5 lg:grid-cols-[1fr_0.85fr]">
            <Card>
              <CardHeader>
                <CardTitle>1X2 probability distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ProbabilityBars probabilities={p.probabilities} />
                <div className="mt-6 flex flex-wrap gap-3">
                  {p.predictedOutcome && (
                    <Badge className="border-indigo-200 bg-indigo-50 text-primary">
                      Predicted: {p.predictedOutcome.replaceAll('_', ' ')}
                    </Badge>
                  )}
                  {p.evaluation && (
                    <Badge
                      className={
                        p.evaluation.correct
                          ? 'border-green-200 bg-green-50 text-green-700'
                          : 'border-red-200 bg-red-50 text-red-700'
                      }
                    >
                      {p.evaluation.correct ? 'Correct' : 'Incorrect'} · Actual:{' '}
                      {p.evaluation.actualOutcome.replaceAll('_', ' ')}
                    </Badge>
                  )}
                </div>
                {p.evaluation && (
                  <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Brier score</span>
                      <div className="font-semibold">{p.evaluation.brierScore.toFixed(3)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Log loss</span>
                      <div className="font-semibold">{p.evaluation.logLoss.toFixed(3)}</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Prediction provenance</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Mode</dt>
                    <dd className="font-medium">{p.mode}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Model</dt>
                    <dd className="font-medium">
                      {p.modelIdentifier} · {p.modelVersion}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Feature set</dt>
                    <dd className="font-medium">{p.config.featureSetVersion}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Prediction cutoff</dt>
                    <dd className="font-medium">{formatDate(p.cutoff)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Generated</dt>
                    <dd className="font-medium">{formatDate(p.predictedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Latency</dt>
                    <dd className="font-medium">{p.latencyMs ?? '—'} ms</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Jev answer confidence</dt>
                    <dd className="font-medium">
                      {p.modelConfidence === null
                        ? '—'
                        : `${(p.modelConfidence * 100).toFixed(1)}%`}{' '}
                      <span className="text-xs text-muted-foreground">
                        (separate from outcome probabilities)
                      </span>
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Pre-match feature snapshot</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-muted-foreground">
                Reconstructed only from matches before the cutoff. Source publication times may be
                unavailable for historical data.
              </p>
              <pre className="max-h-96 overflow-auto rounded-lg bg-slate-900 p-4 text-xs leading-6 text-slate-100">
                {JSON.stringify(p.snapshot, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
