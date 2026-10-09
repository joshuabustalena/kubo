import { notFound } from "next/navigation";
import { getStoreSettings } from "@/lib/data";
import { dateTime, peso, SERVICE_LABEL } from "@/lib/format";
import { getOrderDetail, groupItems } from "@/lib/orders";
import { PrintButton } from "./print-button";

export default async function ReceiptPage(props: PageProps<"/pos/receipt/[id]">) {
  const { id } = await props.params;
  const [order, store] = await Promise.all([getOrderDetail(id), getStoreSettings()]);
  if (!order) notFound();
  const pay = order.payments.find((p) => p.status === "verified");
  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <PrintButton />
      <div className="receipt w-[72mm] bg-white p-4 font-mono text-[12px] leading-snug text-black shadow-md">
        <div className="text-center">
          <p className="text-base font-bold">{store.store_name.toUpperCase()}</p>
          {store.address ? <p>{store.address}</p> : null}
          {store.phone ? <p>{store.phone}</p> : null}
          <p className="mt-1">--------------------------------</p>
          <p className="text-sm font-bold">ORDER {order.order_number}</p>
          <p>{dateTime(order.created_at)}</p>
          <p>{SERVICE_LABEL[order.service_type]} · {order.channel === "online" ? "Online" : "Walk-in"}</p>
          {order.customer_name ? <p>Customer: {order.customer_name}</p> : null}
          {order.staff_name ? <p>Cashier: {order.staff_name}</p> : null}
          <p>--------------------------------</p>
        </div>
        {groupItems(order.items).map((i) => (
          <div key={i.id}>
            <div className="flex justify-between gap-2"><span>{i.quantity} {i.product_name}</span><span>{peso(i.line_total)}</span></div>
            {i.addons.map((a) => (
              <div key={a.id} className="flex justify-between gap-2 pl-3"><span>+{a.quantity} {a.product_name}</span><span>{peso(a.line_total)}</span></div>
            ))}
          </div>
        ))}
        <p>--------------------------------</p>
        <div className="flex justify-between"><span>Subtotal</span><span>{peso(order.subtotal)}</span></div>
        {order.packaging_fee > 0 ? <div className="flex justify-between"><span>Packaging</span><span>{peso(order.packaging_fee)}</span></div> : null}
        {order.discount_total > 0 ? <div className="flex justify-between"><span>Discount</span><span>-{peso(order.discount_total)}</span></div> : null}
        <div className="flex justify-between text-sm font-bold"><span>TOTAL</span><span>{peso(order.total)}</span></div>
        {pay ? (
          <>
            <div className="flex justify-between"><span>{order.payment_method_name ?? pay.method_code}</span><span>{peso(pay.amount_tendered ?? pay.amount)}</span></div>
            {pay.change_given > 0 ? <div className="flex justify-between"><span>Change</span><span>{peso(pay.change_given)}</span></div> : null}
            {pay.reference_no ? <p>Ref: {pay.reference_no}</p> : null}
          </>
        ) : (
          <p className="text-center font-bold">** UNPAID **</p>
        )}
        {order.refunded_total > 0 ? <div className="flex justify-between"><span>Refunded</span><span>-{peso(order.refunded_total)}</span></div> : null}
        {order.points_earned > 0 ? <p className="mt-1">Points earned: {order.points_earned}</p> : null}
        <p>--------------------------------</p>
        <p className="text-center">Salamat po! Come back to the kubo.</p>
        <p className="text-center">This is not an official receipt.</p>
      </div>
    </div>
  );
}
