'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Competition } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, PageHeading } from '@/components/common';

export default function CompetitionsPage() {
  const query = useQuery({
    queryKey: ['competitions'],
    queryFn: () => api<Competition[]>('/competitions'),
  });
  return (
    <>
      <PageHeading
        title="Competitions"
        description="Leagues available to your configured football-data provider."
      />
      {query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : query.data?.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {query.data.map((competition) => (
            <Card key={competition.id} className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-sm font-bold text-primary">
                {competition.id}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">{competition.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  football-data.org code {competition.id}
                </p>
              </div>
              <Badge
                className={
                  competition.available
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700'
                }
              >
                {competition.available ? 'Available' : 'Unavailable'}
              </Badge>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No competitions"
          description="The worker will discover competitions after startup."
        />
      )}
    </>
  );
}
