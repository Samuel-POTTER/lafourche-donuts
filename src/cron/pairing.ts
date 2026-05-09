import { slackClient } from "../config";
import {
  getActiveChannels,
  getMatchHistory,
  getLastUnpairedUser,
  insertMatches,
  saveUnpairedUser,
  getSkippedUsers,
  getChannel,
  skipUser,
  unskipUser,
} from "../db/queries";
import { generatePairs } from "../utils/matching";

export { getChannel, skipUser, unskipUser };

function getCurrentMondayDate(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff);
  return monday.toISOString().split("T")[0];
}

async function getHumanMembers(channelId: string): Promise<string[]> {
  const members: string[] = [];
  let cursor: string | undefined;

  do {
    const result = await slackClient.conversations.members({
      channel: channelId,
      limit: 200,
      cursor,
    });

    const ids = result.members || [];
    cursor = result.response_metadata?.next_cursor;

    for (const userId of ids) {
      const info = await slackClient.users.info({ user: userId });
      if (!info.user?.is_bot && !info.user?.deleted) {
        members.push(userId);
      }
    }
  } while (cursor);

  return members;
}

function dmMessage(userA: string, userB: string): string {
  return (
    `👋 Hello <@${userA}>, <@${userB}> !\n\n` +
    "Vous avez été matchés cette semaine pour un *Lafourche-Donuts* 🍩\n\n" +
    "Prenez un moment durant la semaine pour vous caler un meet et discuter un peu de tout et de rien — " +
    "pour apprendre à vous connaître !\n\n" +
    "On essaie d'éviter de parler boulot hein 😄 *15-30 min* (ou plus si vous ne voyez pas le temps passer aha)."
  );
}

export async function runPairingWithMembers(
  slackChannelId: string,
  mockedMembers?: string[]
): Promise<void> {
  const weekDate = getCurrentMondayDate();
  const label = mockedMembers ? "[DEV]" : "[CRON]";

  const channel = await getChannel(slackChannelId);
  if (!channel) {
    console.error(`${label} Channel ${slackChannelId} introuvable en base.`);
    return;
  }

  console.log(`${label} Traitement du channel ${slackChannelId}`);

  const allMembers = mockedMembers ?? await getHumanMembers(slackChannelId);
  const skipped = await getSkippedUsers(channel.id);
  const members = skipped.length > 0
    ? allMembers.filter((u) => !skipped.includes(u))
    : allMembers;

  if (skipped.length > 0) {
    console.log(`${label} ${skipped.length} membre(s) skippé(s) : ${skipped.join(", ")}`);
  }
  console.log(`${label} ${members.length} membres trouvés`);

  if (members.length < 2) {
    console.log(`${label} Pas assez de membres, skip`);
    return;
  }

  const history = await getMatchHistory(channel.id);
  const priorityUser = await getLastUnpairedUser(channel.id);

  if (priorityUser) {
    console.log(`${label} Utilisateur prioritaire cette semaine : ${priorityUser}`);
  }

  const { pairs, unpairedUser } = generatePairs(members, history, priorityUser);
  console.log(`${label} ${pairs.length} paire(s) générée(s)`);

  await insertMatches(channel.id, pairs, weekDate);

  if (unpairedUser) {
    await saveUnpairedUser(channel.id, unpairedUser, weekDate);
    console.log(`${label} Unpaired cette semaine : ${unpairedUser}`);

    try {
      await slackClient.chat.postMessage({
        channel: unpairedUser,
        text: "🍩 *Lafourche-Donuts* : Tu n'as pas de match cette semaine (nombre impair de membres), mais tu seras en priorité la semaine prochaine ! 😊",
      });
    } catch (err) {
      console.error(`${label} Erreur DM unpaired pour ${unpairedUser}:`, err);
    }
  }

  for (const [userA, userB] of pairs) {
    try {
      const conversation = await slackClient.conversations.open({
        users: `${userA},${userB}`,
      });

      const dmChannelId = conversation.channel?.id;
      if (!dmChannelId) continue;

      await slackClient.chat.postMessage({
        channel: dmChannelId,
        text: dmMessage(userA, userB),
      });

      console.log(`${label} DM envoyé à ${userA} + ${userB}`);
    } catch (err) {
      console.error(`${label} Erreur DM pour ${userA}/${userB}:`, err);
    }
  }

  console.log(`${label} Pairing terminé.`);
}

export async function runPairing(): Promise<void> {
  const weekDate = getCurrentMondayDate();
  console.log(`[CRON] Démarrage du pairing pour la semaine du ${weekDate}`);

  const activeChannels = await getActiveChannels();
  console.log(`[CRON] ${activeChannels.length} channel(s) actif(s) à traiter`);

  for (const channel of activeChannels) {
    try {
      await runPairingWithMembers(channel.slack_channel_id);
    } catch (err) {
      console.error(`[CRON] Erreur sur channel ${channel.slack_channel_id}:`, err);
    }
  }

  console.log("[CRON] Pairing terminé.");
}
