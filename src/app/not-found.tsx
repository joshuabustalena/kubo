import { KuboMark } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <KuboMark className="size-16" />
      <h1 className="font-display text-3xl font-extrabold text-forest-800">Wala dito — nothing here</h1>
      <p className="max-w-md text-ink-muted">That page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <div className="flex gap-2">
        <ButtonLink href="/menu">See the menu</ButtonLink>
        <ButtonLink href="/" variant="outline">Home</ButtonLink>
      </div>
    </div>
  );
}
