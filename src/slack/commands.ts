import { Request, Response } from "express";
import { slackClient } from "../config";
import { getChannel, createChannel, updateChannelStatus, skipUser, unskipUser, getSkippedUsers, upsertUsers } from "../db/queries";
import { slackUserName } from "../cron/pairing";

// Poste via response_url — ne requiert pas que le bot soit membre du channel
async function postToChannel(responseUrl: string, text: string): Promise<void> {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response_type: "in_channel", text }),
  });
}

async function postEphemeral(responseUrl: string, text: string): Promise<void> {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response_type: "ephemeral", text }),
  });
}

// Résout un user ID depuis le texte : format <@U12345> (autocomplete) ou @displayname (saisie libre)
// En cas de saisie libre, cherche uniquement parmi les membres du channel pour limiter les appels API.
async function resolveUserId(text: string, channelId: string): Promise<string | null> {
  const mentionMatch = text.match(/<@([A-Z0-9]+)(?:\|[^>]+)?>/i);
  if (mentionMatch) return mentionMatch[1];

  const nameMatch = text.match(/@([\w.]+)/);
  if (!nameMatch) return null;

  const searchName = nameMatch[1].toLowerCase();
  let cursor: string | undefined;

  do {
    const result = await slackClient.conversations.members({ channel: channelId, limit: 200, cursor });
    cursor = result.response_metadata?.next_cursor || undefined;

    for (const userId of result.members || []) {
      const info = await slackClient.users.info({ user: userId });
      const u = info.user;
      if (!u || u.deleted || u.is_bot) continue;
      if (
        u.name?.toLowerCase() === searchName ||
        u.profile?.display_name?.toLowerCase() === searchName ||
        u.profile?.real_name?.toLowerCase().replace(/\s+/g, ".") === searchName
      ) {
        return userId;
      }
    }
  } while (cursor);

  return null;
}

export async function handleLafourcheDonuts(req: Request, res: Response): Promise<void> {
  const { channel_id, channel_name, user_id, text, response_url } = req.body;
  const rawText = (text || "").trim();
  const command = rawText.toLowerCase().split(/\s+/)[0];

  console.log(`[CMD] channel=${channel_id} user=${user_id} text="${rawText}" command="${command}"`);

  // Accusé de réception immédiat (Slack impose < 3s)
  res.status(200).send();

  try {
    if (command === "start") {
      const existingChannel = await getChannel(channel_id);

      if (!existingChannel) {
        await createChannel(channel_id, channel_name);
        await postToChannel(
          response_url,
          `🍩 *Lafourche-Donuts est activé sur ce channel !*\n\nChaque lundi, des membres seront matchés en duo.\n\nPour mettre en pause : \`/lafourche-donuts stop\``
        );
      } else if (existingChannel.status === "inactive") {
        await updateChannelStatus(existingChannel.id, "active");
        await postToChannel(
          response_url,
          `🍩 *Lafourche-Donuts est de nouveau actif !*\n\nLes pairings reprennent chaque lundi.\n\nPour mettre en pause : \`/lafourche-donuts stop\``
        );
      } else {
        await postToChannel(
          response_url,
          `🍩 Lafourche-Donuts est déjà actif sur ce channel ! Les pairings ont lieu chaque lundi.`
        );
      }
      return;
    }

    if (command === "stop") {
      const channel = await getChannel(channel_id);

      if (!channel || channel.status === "inactive") {
        await postToChannel(response_url, "⚠️ Lafourche-Donuts n'est pas actif sur ce channel.");
        return;
      }

      await updateChannelStatus(channel.id, "inactive");
      await postToChannel(
        response_url,
        "⏸️ *Lafourche-Donuts est maintenant en pause* sur ce channel.\n\nLes pairings hebdomadaires sont arrêtés. Pour les réactiver : \`/lafourche-donuts start\`."
      );
      return;
    }

    if (command === "skip" || command === "unskip") {
      const userId = await resolveUserId(rawText, channel_id);

      if (!userId) {
        await postEphemeral(response_url, `⚠️ Utilisateur introuvable. Utilisation : \`/lafourche-donuts ${command} @utilisateur\``);
        return;
      }

      const channel = await getChannel(channel_id);
      if (!channel) {
        await postEphemeral(response_url, "⚠️ Lafourche-Donuts n'est pas encore configuré sur ce channel. Lance d'abord `/lafourche-donuts start`.");
        return;
      }

      try {
        const info = await slackClient.users.info({ user: userId });
        await upsertUsers([{ slack_user_id: userId, name: slackUserName(info.user) }]);
      } catch (err) {
        console.error(`[CMD] Erreur sauvegarde du nom de ${userId}:`, err);
      }

      if (command === "skip") {
        await skipUser(channel.id, userId);
        await postToChannel(response_url, `⏭️ <@${userId}> ne participera pas aux prochains pairings *Lafourche-Donuts* sur ce channel.`);
        await slackClient.chat.postMessage({
          channel: user_id,
          text: `Pour remettre <@${userId}> dans le pool de matching, utilise la commande dans le channel :\n\`/lafourche-donuts unskip <@${userId}>\``,
        });
      } else {
        await unskipUser(channel.id, userId);
        await postToChannel(response_url, `✅ <@${userId}> est de nouveau dans le pool de matching *Lafourche-Donuts*.`);
      }
      return;
    }

    await postToChannel(
      response_url,
      "ℹ️ *Lafourche-Donuts* — commandes disponibles :\n• `/lafourche-donuts start` — activer les pairings\n• `/lafourche-donuts stop` — mettre en pause\n• `/lafourche-donuts skip @utilisateur` — exclure quelqu'un du matching\n• `/lafourche-donuts unskip @utilisateur` — le remettre dans le pool"
    );
  } catch (err) {
    console.error("Erreur handleLafourcheDonuts:", err);
    await postToChannel(response_url, "❌ Une erreur s'est produite. Réessaie dans quelques instants.");
  }
}
