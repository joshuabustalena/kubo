import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderManager } from "@/components/orders/order-manager";
import { OrderSummary } from "@/components/orders/order-summary";
import { getPaymentMethods } from "@/lib/data";
import { getOrderDetail } from "@/lib/orders";

export default async function AdminOrderPage(props: PageProps<"/admin/orders/[id]">) {
  const { id } = await props.params;
  const [order, methods] = await Promise.all([getOrderDetail(id, { withCosts: true }), getPaymentMethods("pos")]);
  if (!order) notFound();
  return (
    <div className="space-y-4">
      <Link href="/admin/orders" className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700 hover:underline"><ArrowLeft className="size-4" /> Orders</Link>
      <OrderManager order={order} methods={methods} />
      <OrderSummary order={order} showCost />
    </div>
  );
}
