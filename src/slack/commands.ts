import { Request, Response } from "express";
import { slackClient } from "../config";
import { getChannel, createChannel, updateChannelStatus, skipUser, unskipUser, getSkippedUsers } from "../db/queries";

function nextMondayParis(): string {
  const now = new Date();
  const parisTz = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = parisTz.formatToParts(now);
  const day = parseInt(parts.find((p) => p.type === "day")!.value);
  const month = parseInt(parts.find((p) => p.type === "month")!.value) - 1;
  const year = parseInt(parts.find((p) => p.type === "year")!.value);

  const localNow = new Date(Date.UTC(year, month, day));
  const dayOfWeek = localNow.getUTCDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;

  const nextMonday = new Date(localNow);
  nextMonday.setUTCDate(localNow.getUTCDate() + daysUntilMonday);

  return nextMonday.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

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

// Extrait l'ID utilisateur d'une mention Slack : <@U12345> ou <@U12345|name>
function parseMentionedUserId(text: string): string | null {
  const match = text.match(/<@([A-Z0-9]+)(?:\|[^>]+)?>/);
  return match ? match[1] : null;
}

export async function handleLafourcheDonuts(req: Request, res: Response): Promise<void> {
  const { channel_id, channel_name, user_id, text, response_url } = req.body;
  const rawText = (text || "").trim();
  const command = rawText.toLowerCase().split(/\s+/)[0];

  // Accusé de réception immédiat (Slack impose < 3s)
  res.status(200).send();

  try {
    if (command === "start") {
      const existingChannel = await getChannel(channel_id);

      if (!existingChannel) {
        await createChannel(channel_id, channel_name);
        const nextDate = nextMondayParis();
        await postToChannel(
          response_url,
          `🍩 *Lafourche-Donuts est activé sur ce channel !*\n\nChaque lundi, des membres seront matchés en duo. Le premier pairing aura lieu le *${nextDate} à 10h00*.\n\nPour mettre en pause : \`/lafourche-donuts stop\``
        );
      } else if (existingChannel.status === "inactive") {
        await updateChannelStatus(existingChannel.id, "active");
        const nextDate = nextMondayParis();
        await postToChannel(
          response_url,
          `🍩 *Lafourche-Donuts est de nouveau actif !*\n\nLes pairings reprennent. Le prochain matching aura lieu le *${nextDate} à 10h00*.\n\nPour mettre en pause : \`/lafourche-donuts stop\``
        );
      } else {
        const nextDate = nextMondayParis();
        await postToChannel(
          response_url,
          `🍩 Lafourche-Donuts est déjà actif sur ce channel ! Prochain matching programmé pour le *${nextDate} à 10h00*.`
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
      const userId = parseMentionedUserId(rawText);

      if (!userId) {
        await postEphemeral(response_url, `⚠️ Utilisation : \`/lafourche-donuts ${command} @utilisateur\``);
        return;
      }

      const channel = await getChannel(channel_id);
      if (!channel) {
        await postEphemeral(response_url, "⚠️ Lafourche-Donuts n'est pas encore configuré sur ce channel. Lance d'abord `/lafourche-donuts start`.");
        return;
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
