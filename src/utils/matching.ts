import { Match } from "../db/queries";

/**
 * Génère les paires pour la semaine.
 *
 * Règles :
 * - Tout le monde doit se rencontrer au moins 1 fois avant d'être re-matché.
 * - La personne sans match la semaine dernière (priorityUser) est matchée en premier.
 * - Si le nombre de membres est impair, on choisit l'unpaired de cette semaine de façon à
 *   éviter que ce soit la même personne qu'une semaine à l'autre (on exclut priorityUser).
 */
export function generatePairs(
  members: string[],
  history: Match[],
  priorityUser: string | null
): { pairs: [string, string][]; unpairedUser: string | null } {
  const meetingCount: Record<string, Record<string, number>> = {};
  for (const m of history) {
    meetingCount[m.user_a] = meetingCount[m.user_a] || {};
    meetingCount[m.user_b] = meetingCount[m.user_b] || {};
    meetingCount[m.user_a][m.user_b] = (meetingCount[m.user_a][m.user_b] || 0) + 1;
    meetingCount[m.user_b][m.user_a] = (meetingCount[m.user_b][m.user_a] || 0) + 1;
  }

  const getMeetings = (a: string, b: string): number =>
    meetingCount[a]?.[b] || 0;

  let pool = [...members];
  const pairs: [string, string][] = [];

  let unpairedUser: string | null = null;
  if (pool.length % 2 !== 0) {
    const candidates = priorityUser
      ? pool.filter((u) => u !== priorityUser)
      : pool;

    // L'unpaired est la personne avec le plus de matchs cumulés (la moins prioritaire)
    const sorted = [...candidates].sort((a, b) => {
      const totalA = Object.values(meetingCount[a] || {}).reduce((s, v) => s + v, 0);
      const totalB = Object.values(meetingCount[b] || {}).reduce((s, v) => s + v, 0);
      return totalB - totalA;
    });

    unpairedUser = sorted[0];
    pool = pool.filter((u) => u !== unpairedUser);
  }

  // Matcher priorityUser en premier s'il est dans le pool
  if (priorityUser && pool.includes(priorityUser)) {
    const partner = findBestPartner(priorityUser, pool, getMeetings);
    if (partner) {
      pairs.push([priorityUser, partner]);
      pool = pool.filter((u) => u !== priorityUser && u !== partner);
    }
  }

  // Greedy matching pour le reste (paire avec le moins de rencontres communes d'abord)
  while (pool.length >= 2) {
    const user = pool[0];
    const partner = findBestPartner(user, pool.slice(1), getMeetings);
    if (!partner) break;
    pairs.push([user, partner]);
    pool = pool.filter((u) => u !== user && u !== partner);
  }

  return { pairs, unpairedUser };
}

function findBestPartner(
  user: string,
  candidates: string[],
  getMeetings: (a: string, b: string) => number
): string | null {
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => getMeetings(user, a) - getMeetings(user, b))[0];
}
