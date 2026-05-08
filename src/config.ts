import { WebClient } from "@slack/web-api";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

export const SLACK_BOT_TOKEN = requireEnv("SLACK_BOT_TOKEN");
export const SLACK_SIGNING_SECRET = requireEnv("SLACK_SIGNING_SECRET");
export const CRON_SECRET = requireEnv("CRON_SECRET");
export const PORT = parseInt(process.env.PORT || "3000", 10);

export const slackClient = new WebClient(SLACK_BOT_TOKEN);

export const supabase = createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY")
);
