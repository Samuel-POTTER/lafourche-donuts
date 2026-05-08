import { Request, Response } from "express";
import { slackClient } from "../config";
import { getChannel, createChannel, updateChannelStatus } from "../db/queries";

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

export async function handleLafourcheDonuts(req: Request, res: Response): Promise<void> {
  const { channel_id, channel_name, text } = req.body;
  const command = (text || "").trim().toLowerCase();

  res.status(200).json({ response_type: "ephemeral", text: "⏳ Traitement en cours..." });

  try {
    if (command === "stop") {
      const channel = await getChannel(channel_id);

      if (!channel || channel.status === "inactive") {
        await slackClient.chat.postMessage({
          channel: channel_id,
          text: "⚠️ Lafourche-Donuts n'est pas actif sur ce channel.",
        });
        return;
      }

      await updateChannelStatus(channel.id, "inactive");
      await slackClient.chat.postMessage({
        channel: channel_id,
        text: "⏸️ *Lafourche-Donuts est maintenant en pause* sur ce channel.\n\nLes pairings hebdomadaires sont arrêtés. Pour les réactiver, utilisez simplement `/lafourcheDonuts`.",
      });
      return;
    }

    const existingChannel = await getChannel(channel_id);

    if (!existingChannel) {
      await createChannel(channel_id, channel_name);
      const nextDate = nextMondayParis();
      await slackClient.chat.postMessage({
        channel: channel_id,
        text: `🍩 *Lafourche-Donuts est activé sur ce channel !*\n\nChaque lundi, des membres seront matchés en duo. Le premier pairing aura lieu le *${nextDate} à 10h00*.\n\nPour mettre en pause : \`/lafourcheDonuts stop\``,
      });
    } else if (existingChannel.status === "inactive") {
      await updateChannelStatus(existingChannel.id, "active");
      const nextDate = nextMondayParis();
      await slackClient.chat.postMessage({
        channel: channel_id,
        text: `🍩 *Lafourche-Donuts est de nouveau actif !*\n\nLes pairings reprennent. Le prochain matching aura lieu le *${nextDate} à 10h00*.\n\nPour mettre en pause : \`/lafourcheDonuts stop\``,
      });
    } else {
      const nextDate = nextMondayParis();
      await slackClient.chat.postMessage({
        channel: channel_id,
        text: `🍩 Lafourche-Donuts est déjà actif sur ce channel ! Prochain matching programmé pour le *${nextDate} à 10h00*.`,
      });
    }
  } catch (err) {
    console.error("Erreur handleLafourcheDonuts:", err);
    await slackClient.chat.postMessage({
      channel: channel_id,
      text: "❌ Une erreur s'est produite. Réessaie dans quelques instants.",
    });
  }
}
