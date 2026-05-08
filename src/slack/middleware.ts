import { Request, Response, NextFunction } from "express";
import * as crypto from "crypto";
import { SLACK_SIGNING_SECRET } from "../config";

export function verifySlackSignature(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const timestamp = req.headers["x-slack-request-timestamp"] as string;
  const signature = req.headers["x-slack-signature"] as string;

  if (!timestamp || !signature) {
    res.status(401).send("Missing Slack headers");
    return;
  }

  // Éviter les replay attacks (5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    res.status(401).send("Request too old");
    return;
  }

  const sigBaseString = `v0:${timestamp}:${(req as any).rawBody}`;
  const hmac = crypto
    .createHmac("sha256", SLACK_SIGNING_SECRET)
    .update(sigBaseString)
    .digest("hex");
  const mySignature = `v0=${hmac}`;

  if (
    !crypto.timingSafeEqual(
      Buffer.from(mySignature, "utf8"),
      Buffer.from(signature, "utf8")
    )
  ) {
    res.status(401).send("Invalid Slack signature");
    return;
  }

  next();
}
