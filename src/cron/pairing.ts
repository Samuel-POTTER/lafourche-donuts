import { slackClient } from "../config";
import {
  getActiveChannels,
  getMatchHistory,
  getLastUnpairedUser,
  insertMatches,
  saveUnpairedUser,
} from "../db/queries";
import { generatePairs } from "../utils/matching";

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

const DM_MESSAGE =
  "👋 Hello ! Vous avez été matchés cette semaine pour un *Lafourche-Donuts* 🍩\n\n" +
  "Prenez un moment durant la semaine pour vous caler un meet et discuter un peu de tout et de rien — " +
  "pour apprendre à vous connaître !\n\n" +
  "On essaie d'éviter de parler boulot hein 😄 *15-30 min* (ou plus si vous ne voyez pas le temps passer aha).";

export async function runPairing(): Promise<void> {
  const weekDate = getCurrentMondayDate();
  console.log(`[CRON] Démarrage du pairing pour la semaine du ${weekDate}`);

  const activeChannels = await getActiveChannels();
  console.log(`[CRON] ${activeChannels.length} channel(s) actif(s) à traiter`);

  for (const channel of activeChannels) {
    try {
      console.log(`[CRON] Traitement du channel ${channel.slack_channel_id}`);

      const members = await getHumanMembers(channel.slack_channel_id);
      console.log(`[CRON] ${members.length} membres humains trouvés`);

      if (members.length < 2) {
        console.log(`[CRON] Pas assez de membres, skip`);
        await slackClient.chat.postMessage({
          channel: channel.slack_channel_id,
          text: "⚠️ Lafourche-Donuts : pas assez de membres dans ce channel pour créer des pairings (minimum 2).",
        });
        continue;
      }

      const history = await getMatchHistory(channel.id);
      const priorityUser = await getLastUnpairedUser(channel.id);

      if (priorityUser) {
        console.log(`[CRON] Utilisateur prioritaire cette semaine : ${priorityUser}`);
      }

      const { pairs, unpairedUser } = generatePairs(members, history, priorityUser);
      console.log(`[CRON] ${pairs.length} paire(s) générée(s)`);

      await insertMatches(channel.id, pairs, weekDate);

      if (unpairedUser) {
        await saveUnpairedUser(channel.id, unpairedUser, weekDate);
        console.log(`[CRON] Unpaired cette semaine : ${unpairedUser}`);

        await slackClient.chat.postMessage({
          channel: unpairedUser,
          text: "🍩 *Lafourche-Donuts* : Tu n'as pas de match cette semaine (nombre impair de membres), mais tu seras en priorité la semaine prochaine ! 😊",
        });
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
            text: DM_MESSAGE,
          });

          console.log(`[CRON] DM envoyé à ${userA} + ${userB}`);
        } catch (err) {
          console.error(`[CRON] Erreur DM pour ${userA}/${userB}:`, err);
        }
      }

      const pairsMentions = pairs.map(([a, b]) => `• <@${a}> 🤝 <@${b}>`).join("\n");
      const unpairedNote = unpairedUser
        ? `\n\n_<@${unpairedUser}> n'a pas de match cette semaine mais sera prioritaire la semaine prochaine !_`
        : "";

      await slackClient.chat.postMessage({
        channel: channel.slack_channel_id,
        text: `🍩 *Lafourche-Donuts de la semaine !*\n\nVoici les matchs de cette semaine :\n${pairsMentions}${unpairedNote}\n\nBon meet à tous ! ☕`,
      });
    } catch (err) {
      console.error(`[CRON] Erreur sur channel ${channel.slack_channel_id}:`, err);
    }
  }

  console.log("[CRON] Pairing terminé.");
}
