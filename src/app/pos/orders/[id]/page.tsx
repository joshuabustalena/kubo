import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/orders/auto-refresh";
import { OrderManager } from "@/components/orders/order-manager";
import { OrderSummary } from "@/components/orders/order-summary";
import { getPaymentMethods } from "@/lib/data";
import { getOrderDetail } from "@/lib/orders";

export default async function PosOrderPage(props: PageProps<"/pos/orders/[id]">) {
  const { id } = await props.params;
  const [order, methods] = await Promise.all([getOrderDetail(id), getPaymentMethods("pos")]);
  if (!order) notFound();
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <AutoRefresh seconds={15} enabled={!["completed", "cancelled"].includes(order.status)} />
      <Link href="/pos/orders" className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700 hover:underline">
        <ArrowLeft className="size-4" /> Order queue
      </Link>
      <OrderManager order={order} methods={methods} />
      <OrderSummary order={order} />
    </div>
  );
}
