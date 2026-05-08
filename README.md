# 🍩 Lafourche-Donuts

Bot Slack de **coffee roulette** interne. Chaque lundi à 10h00, les membres d'un channel sont matchés aléatoirement en binôme pour un café ou un meet informel.

## Fonctionnalités

- Activation/désactivation par channel via slash command
- Matching hebdomadaire automatique (lundi 10h00)
- Algorithme greedy : évite de re-matcher des personnes déjà rencontrées
- Gestion des nombres impairs : la personne sans match reçoit un DM et est prioritaire la semaine suivante
- Envoi d'un DM à chaque binôme + récap public dans le channel

## Stack

- **Runtime** : Node.js 20+ / TypeScript
- **HTTP** : Express
- **Base de données** : Supabase (PostgreSQL)
- **Scheduler** : cron-job.org (webhook HTTP)
- **Déploiement** : Render (ou Railway)

## Structure

```
src/
├── index.ts              # Entry point Express
├── config.ts             # Env vars + clients Slack/Supabase
├── db/
│   ├── schema.sql        # Script SQL Supabase
│   └── queries.ts        # Requêtes base de données
├── slack/
│   ├── commands.ts       # Handler slash command
│   └── middleware.ts     # Vérification signature Slack
├── cron/
│   └── pairing.ts        # Logique de matching + envoi DM
└── utils/
    └── matching.ts       # Algorithme de pairing
```

## Installation

```bash
npm install
cp .env.example .env
# Remplir les valeurs dans .env
```

## Variables d'environnement

| Variable | Description |
|---|---|
| `SLACK_BOT_TOKEN` | Token bot Slack (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | Secret de signature Slack |
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service role Supabase |
| `CRON_SECRET` | Secret pour authentifier cron-job.org |
| `PORT` | Port HTTP (défaut : `3000`) |

## Base de données

Exécuter `src/db/schema.sql` dans le SQL Editor de Supabase (Dashboard → SQL Editor → New query).

Crée trois tables : `channels`, `matches`, `unpaired_users`.

## Commandes

```bash
npm run dev    # Dev avec hot-reload (tsx watch)
npm run build  # Compilation TypeScript
npm start      # Démarrage production
```

## Endpoints

| Endpoint | Méthode | Appelé par |
|---|---|---|
| `/health` | GET | Monitoring |
| `/slack/commands` | POST | Slack (slash command) |
| `/cron/pairing` | POST | cron-job.org |

Le endpoint `/cron/pairing` requiert le header `x-cron-secret: <CRON_SECRET>`.

## Slash command Slack

| Commande | Effet |
|---|---|
| `/lafourche-donuts` | Active le bot sur le channel (ou affiche la date du prochain run) |
| `/lafourche-donuts stop` | Met le bot en pause sur le channel |

## Configuration Slack App

Sur [api.slack.com/apps](https://api.slack.com/apps) :

1. Créer une app **From scratch**
2. **Slash Commands** → créer `/lafourcheDonuts` pointant vers `https://TON-DOMAINE/slack/commands`
3. **OAuth & Permissions** → ajouter ces Bot Token Scopes :
   - `channels:read`, `groups:read`
   - `chat:write`
   - `im:write`, `mpim:write`
   - `users:read`
4. **Install to Workspace** → récupérer le Bot Token et le Signing Secret

## Configuration cron-job.org

| Champ | Valeur |
|---|---|
| URL | `https://TON-DOMAINE/cron/pairing` |
| Schedule | Lundi 09:00 UTC (= 10h00 Paris heure d'hiver) |
| Method | `POST` |
| Header | `x-cron-secret: <CRON_SECRET>` |

> Pour 10h00 heure de Paris toute l'année, utiliser le réglage timezone `Europe/Paris` directement dans cron-job.org si disponible.

## Déploiement sur Render

1. Pusher le code sur GitHub
2. Créer un **Web Service** sur [render.com](https://render.com)
3. **Build command** : `npm install && npm run build`
4. **Start command** : `npm start`
5. Ajouter toutes les variables d'environnement
6. Mettre à jour la Request URL Slack et l'URL cron-job.org avec le domaine Render

## Test en local

```bash
# Exposer le serveur local avec ngrok
npx ngrok http 3000

# Tester le health check
curl http://localhost:3000/health

# Déclencher le pairing manuellement
curl -X POST http://localhost:3000/cron/pairing \
  -H "x-cron-secret: TON_SECRET"
```

## Algorithme de matching

1. Si le nombre de membres est impair, la personne avec le plus de matchs cumulés devient `unpairedUser` (sauf si elle était déjà unpaired la semaine précédente — dans ce cas elle est exclue du tirage).
2. L'utilisateur prioritaire (unpaired de la semaine précédente) est matché en premier.
3. Le reste est matché de façon greedy : on privilégie les paires qui ne se sont jamais rencontrées, puis celles qui se sont rencontrées le moins souvent.
