import { Match } from "../db/queries";

// Nombre de pairings candidats générés ; on garde le meilleur.
const ATTEMPTS = 200;

/**
 * Génère les paires pour la semaine.
 *
 * Règles :
 * - On évite au maximum de re-matcher des gens qui se sont déjà rencontrés : on génère
 *   ATTEMPTS pairings sur des ordres mélangés et on garde celui qui a le moins de re-matchs.
 * - La personne sans match la semaine dernière (priorityUser) est forcément matchée.
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

  let unpairedUser: string | null = null;
  if (pool.length % 2 !== 0) {
    const candidates = priorityUser
      ? pool.filter((u) => u !== priorityUser)
      : pool;

    // L'unpaired est la personne avec le plus de matchs cumulés (la moins prioritaire).
    // Mélange préalable pour départager les égalités au hasard.
    const sorted = shuffle(candidates).sort((a, b) => {
      const totalA = Object.values(meetingCount[a] || {}).reduce((s, v) => s + v, 0);
      const totalB = Object.values(meetingCount[b] || {}).reduce((s, v) => s + v, 0);
      return totalB - totalA;
    });

    unpairedUser = sorted[0];
    pool = pool.filter((u) => u !== unpairedUser);
  }

  let bestPairs: [string, string][] = [];
  let bestScore = Infinity;

  for (let i = 0; i < ATTEMPTS && bestScore > 0; i++) {
    const pairs = greedyPairs(shuffle(pool), priorityUser, getMeetings);
    const score = scorePairs(pairs, getMeetings);
    if (score < bestScore) {
      bestScore = score;
      bestPairs = pairs;
    }
  }

  return { pairs: bestPairs, unpairedUser };
}

/**
 * Appariement glouton sur un ordre donné : chacun prend le partenaire qu'il a le moins vu.
 * priorityUser (s'il est dans le pool) choisit en premier.
 */
function greedyPairs(
  order: string[],
  priorityUser: string | null,
  getMeetings: (a: string, b: string) => number
): [string, string][] {
  let pool = order;
  if (priorityUser && pool.includes(priorityUser)) {
    pool = [priorityUser, ...pool.filter((u) => u !== priorityUser)];
  }

  const pairs: [string, string][] = [];
  while (pool.length >= 2) {
    const user = pool[0];
    const partner = findBestPartner(user, pool.slice(1), getMeetings);
    if (!partner) break;
    pairs.push([user, partner]);
    pool = pool.filter((u) => u !== user && u !== partner);
  }
  return pairs;
}

/**
 * Coût d'un pairing : somme des carrés du nombre de rencontres passées de chaque paire.
 * Le carré pénalise plus un 3e match qu'un 2e, pour répartir les re-matchs inévitables.
 */
function scorePairs(
  pairs: [string, string][],
  getMeetings: (a: string, b: string) => number
): number {
  return pairs.reduce((s, [a, b]) => s + getMeetings(a, b) ** 2, 0);
}

function findBestPartner(
  user: string,
  candidates: string[],
  getMeetings: (a: string, b: string) => number
): string | null {
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => getMeetings(user, a) - getMeetings(user, b))[0];
}

/** Fisher-Yates, renvoie une copie. */
function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
