import express, { Request, Response } from "express";
import { PORT, CRON_SECRET } from "./config";
import { verifySlackSignature } from "./slack/middleware";
import { handleLafourcheDonuts } from "./slack/commands";
import { runPairing } from "./cron/pairing";

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

app.listen(PORT, () => {
  console.log(`🍩 Lafourche-Donuts démarré sur le port ${PORT}`);
});
