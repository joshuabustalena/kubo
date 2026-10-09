import type { Metadata } from "next";
import { RewardValidator } from "./reward-validator";

export const metadata: Metadata = { title: "Validate reward" };

export default function PosRewardsPage() {
  return (
    <div className="mx-auto max-w-xl p-4">
      <h1 className="font-display text-2xl font-bold text-wood-800">Validate a reward code</h1>
      <p className="mb-4 text-sm text-ink-muted">
        To apply a discount reward to a sale, enter the code on the Register. Use this screen to check a code, or to hand over a reward without a sale (e.g. a free drink).
      </p>
      <RewardValidator />
    </div>
  );
}
