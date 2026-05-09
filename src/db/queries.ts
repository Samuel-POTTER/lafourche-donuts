import { supabase } from "../config";

export interface Channel {
  id: string;
  slack_channel_id: string;
  slack_channel_name: string | null;
  status: "active" | "inactive";
}

export interface Match {
  user_a: string;
  user_b: string;
  week_date: string;
}

export async function getChannel(slackChannelId: string): Promise<Channel | null> {
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .eq("slack_channel_id", slackChannelId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createChannel(
  slackChannelId: string,
  slackChannelName: string
): Promise<Channel> {
  const { data, error } = await supabase
    .from("channels")
    .insert({ slack_channel_id: slackChannelId, slack_channel_name: slackChannelName, status: "active" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateChannelStatus(
  channelId: string,
  status: "active" | "inactive"
): Promise<void> {
  const { error } = await supabase
    .from("channels")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", channelId);

  if (error) throw error;
}

export async function getActiveChannels(): Promise<Channel[]> {
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .eq("status", "active");

  if (error) throw error;
  return data || [];
}

export async function getMatchHistory(channelId: string): Promise<Match[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("user_a, user_b, week_date")
    .eq("channel_id", channelId);

  if (error) throw error;
  return data || [];
}

export async function insertMatches(
  channelId: string,
  pairs: [string, string][],
  weekDate: string
): Promise<void> {
  const rows = pairs.map(([user_a, user_b]) => ({
    channel_id: channelId,
    user_a,
    user_b,
    week_date: weekDate,
  }));

  const { error } = await supabase.from("matches").insert(rows);
  if (error) throw error;
}

export async function getLastUnpairedUser(channelId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("unpaired_users")
    .select("slack_user_id, week_date")
    .eq("channel_id", channelId)
    .order("week_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.slack_user_id || null;
}

export async function saveUnpairedUser(
  channelId: string,
  slackUserId: string,
  weekDate: string
): Promise<void> {
  const { error } = await supabase
    .from("unpaired_users")
    .insert({ channel_id: channelId, slack_user_id: slackUserId, week_date: weekDate });

  if (error) throw error;
}

export async function skipUser(channelId: string, slackUserId: string): Promise<void> {
  const { error } = await supabase
    .from("skipped_users")
    .upsert(
      { channel_id: channelId, slack_user_id: slackUserId },
      { onConflict: "channel_id,slack_user_id" }
    );

  if (error) throw error;
}

export async function unskipUser(channelId: string, slackUserId: string): Promise<void> {
  const { error } = await supabase
    .from("skipped_users")
    .delete()
    .eq("channel_id", channelId)
    .eq("slack_user_id", slackUserId);

  if (error) throw error;
}

export async function getSkippedUsers(channelId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("skipped_users")
    .select("slack_user_id")
    .eq("channel_id", channelId);

  if (error) throw error;
  return (data || []).map((r) => r.slack_user_id);
}
