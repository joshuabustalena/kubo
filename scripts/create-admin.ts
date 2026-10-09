/**
 * Creates (or promotes) the first Kainan sa Kubo admin.
 *
 *   npm run create-admin -- owner@example.com "S3cure-Passw0rd" "Owner Name"
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.
 * If the email already has an account, the password argument is ignored and
 * the existing account is promoted.
 */
import { createClient } from "@supabase/supabase-js";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file missing: rely on the other file or the real environment
  }
}

async function main() {
  const [email, password, ...nameParts] = process.argv.slice(2);
  const fullName = nameParts.join(" ") || "Kainan sa Kubo Admin";
  if (!email || !password) {
    console.error('Usage: npm run create-admin -- <email> <password> "<full name>"');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let userId: string | undefined;
  const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (created.data.user) {
    userId = created.data.user.id;
    console.log(`Created login for ${email}.`);
  } else {
    const { data: existing } = await supabase.from("profiles").select("id").ilike("email", email).maybeSingle();
    if (!existing) {
      console.error(`Could not create or find ${email}: ${created.error?.message}`);
      process.exit(1);
    }
    userId = existing.id;
    console.log(`${email} already exists — promoting it.`);
  }

  const { error } = await supabase.from("profiles").update({ role: "admin", is_active: true, full_name: fullName }).eq("id", userId);
  if (error) {
    console.error(`Could not promote: ${error.message}`);
    process.exit(1);
  }
  await supabase.from("audit_logs").insert({ actor_id: null, action: "user.bootstrap_admin", entity_type: "profile", entity_id: userId, details: { email } });
  console.log(`✓ ${email} is now an admin. Log in at /login, then set an approval PIN under POS → PIN.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
