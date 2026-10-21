import { db } from '../src/index';

const competitions = [
  ['PL', 'Premier League'],
  ['PD', 'La Liga'],
  ['SA', 'Serie A'],
  ['BL1', 'Bundesliga'],
  ['FL1', 'Ligue 1'],
  ['CL', 'UEFA Champions League'],
] as const;
async function main() {
  for (const [id, name] of competitions)
    await db.competition.upsert({
      where: { id },
      create: { id, name, available: process.env.MOCK_MODE !== 'false' },
      update: { name },
    });
  await db.predictionConfig.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      model: process.env.JEV_MODEL ?? 'jev-1.13',
      featureSetVersion: 'prematch-v1',
      questionVersion: 'football-1x2-v1',
    },
    update: {},
  });
  await db.applicationSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });
}
main().finally(() => db.$disconnect());
