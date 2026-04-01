const fs = require("fs");
const path = require("path");

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "ZOOM_CLIENT_ID",
  "ZOOM_CLIENT_SECRET",
  "ZOOM_REDIRECT_URI",
  "TOKEN_ENCRYPTION_KEY",
  "CRON_SECRET",
  "PAID_CLASSES_ENABLED",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_FIREBASE_VAPID_KEY",
];

const envFilePath = path.join(process.cwd(), ".env.local");
const fileEnv: Record<string, string> = {};

if (fs.existsSync(envFilePath)) {
  const lines = fs.readFileSync(envFilePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key) fileEnv[key] = value;
  }
}

const getValue = (key: string): string => {
  const fromProcess = process.env[key];
  if (fromProcess && fromProcess.trim()) return fromProcess.trim();
  const fromFile = fileEnv[key];
  if (fromFile && fromFile.trim()) return fromFile.trim();
  return "";
};

const missing = required.filter((k) => !getValue(k));

if (missing.length > 0) {
  console.error("Missing required staging env vars:");
  for (const key of missing) console.error(`- ${key}`);
  process.exit(1);
}

console.log("Staging env validation passed.");
