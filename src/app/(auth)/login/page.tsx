import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";
  const confirmed = sp.confirmed === "1";
  const failed = sp.error === "link";
  return <LoginForm next={next} confirmed={confirmed} linkFailed={failed} />;
}
