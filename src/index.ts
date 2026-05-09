import express, { Request, Response } from "express";
import { PORT, CRON_SECRET } from "./config";
import { verifySlackSignature } from "./slack/middleware";
import { handleLafourcheDonuts } from "./slack/commands";
import { runPairing, runPairingWithMembers } from "./cron/pairing";
import { generatePairs } from "./utils/matching";
import { getChannel, createChannel, skipUser, unskipUser, getSkippedUsers, getMatchHistory, getLastUnpairedUser } from "./db/queries";

const app = express();

app.use(
  express.urlencoded({
    extended: true,
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post(
  "/slack/commands",
  verifySlackSignature,
  async (req: Request, res: Response) => {
    const { command } = req.body;

    if (command === "/lafourche-donuts") {
      await handleLafourcheDonuts(req, res);
    } else {
      res.status(200).json({ text: "Commande inconnue." });
    }
  }
);

app.post("/cron/pairing", async (req: Request, res: Response) => {
  const secret = req.headers["x-cron-secret"] || req.query.secret;

  if (secret !== CRON_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.status(200).json({ message: "Pairing démarré" });

  runPairing().catch((err) => console.error("[CRON] Erreur fatale:", err));
});

if (process.env.NODE_ENV === "development") {
  const { MOCK_MEMBERS, MOCK_CHANNEL_ID } = require("./dev/mockData");

  app.post("/dev/pairing", async (_req: Request, res: Response) => {
    let channel = await getChannel(MOCK_CHANNEL_ID);
    if (!channel) {
      channel = await createChannel(MOCK_CHANNEL_ID, "dev-mock");
      console.log("[DEV] Channel mock créé en base.");
    }
    const skipped = await getSkippedUsers(channel.id);
    const activeMembers = MOCK_MEMBERS.filter((u: string) => !skipped.includes(u));

    const history = await getMatchHistory(channel.id);
    const priorityUser = await getLastUnpairedUser(channel.id);
    const { pairs, unpairedUser } = generatePairs(activeMembers, history, priorityUser);

    res.json({
      message: "Pairing mock démarré",
      channelId: MOCK_CHANNEL_ID,
      members: activeMembers,
      skipped,
      preview: {
        pairs: pairs.map(([a, b]) => ({ a, b })),
        unpairedUser: unpairedUser ?? null,
        priorityNextWeek: unpairedUser ?? null,
      },
    });
    runPairingWithMembers(MOCK_CHANNEL_ID, MOCK_MEMBERS)
      .catch((err) => console.error("[DEV] Erreur pairing mock:", err));
  });

  app.post("/dev/matching", (req: Request, res: Response) => {
    const { members, history, priorityUser } = req.body;
    const result = generatePairs(
      members || MOCK_MEMBERS,
      history || [],
      priorityUser || null
    );
    res.json(result);
  });

  app.post("/dev/skip", async (req: Request, res: Response) => {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ error: "userId requis" });
      return;
    }
    try {
      const channel = await getChannel(MOCK_CHANNEL_ID);
      if (!channel) {
        res.status(404).json({ error: `Channel ${MOCK_CHANNEL_ID} introuvable. Lance /dev/pairing d'abord pour l'enregistrer.` });
        return;
      }
      await skipUser(channel.id, userId);
      const skipped = await getSkippedUsers(channel.id);
      res.json({ skipped });
    } catch (err) {
      console.error("[DEV] Erreur skip:", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.post("/dev/unskip", async (req: Request, res: Response) => {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ error: "userId requis" });
      return;
    }
    try {
      const channel = await getChannel(MOCK_CHANNEL_ID);
      if (!channel) {
        res.status(404).json({ error: `Channel ${MOCK_CHANNEL_ID} introuvable.` });
        return;
      }
      await unskipUser(channel.id, userId);
      const skipped = await getSkippedUsers(channel.id);
      res.json({ skipped });
    } catch (err) {
      console.error("[DEV] Erreur unskip:", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  console.log("🛠️  Mode développement : endpoints /dev/pairing, /dev/matching, /dev/skip, /dev/unskip disponibles");
}

app.listen(PORT, () => {
  console.log(`🍩 Lafourche-Donuts démarré sur le port ${PORT}`);
});
