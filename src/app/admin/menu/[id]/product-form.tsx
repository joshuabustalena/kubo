"use client";

import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { ProductImage } from "@/components/brand/meal-art";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { peso } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Category, Product } from "@/lib/types";
import { slugify } from "@/lib/utils";
import { saveProduct, type FormState } from "../actions";

export function ProductForm({
  product,
  categories,
  addons,
  selectedAddons,
}: {
  product: Product | null;
  categories: Category[];
  addons: { id: string; name: string; price: number }[];
  selectedAddons: string[];
}) {
  const [state, action] = useActionState<FormState, FormData>(saveProduct, {});
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [image, setImage] = useState<string | null>(product?.image_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setUploadError(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setUploadError("Use a JPG, PNG or WebP image.");
    if (file.size > 3 * 1024 * 1024) return setUploadError("Images must be 3 MB or smaller.");
    setUploading(true);
    const supabase = createClient();
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `products/${slugify(name || "item")}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("menu-images").upload(path, file, { cacheControl: "31536000", upsert: false });
    setUploading(false);
    if (error) return setUploadError(error.message);
    setImage(supabase.storage.from("menu-images").getPublicUrl(path).data.publicUrl);
  };

  return (
    <form action={action}>
      <Card>
        <CardBody className="space-y-4">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          {state.saved ? <Alert tone="success">Saved.</Alert> : null}
          <input type="hidden" name="id" value={product?.id ?? ""} />
          <input type="hidden" name="image_url" value={image ?? ""} />

          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <div className="space-y-2">
              <div className="overflow-hidden rounded-xl ring-1 ring-bamboo-300">
                <ProductImage src={image} slug={slug || slugify(name)} name={name || "New item"} sizes="200px" />
              </div>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-bamboo-500 py-2 text-sm font-semibold text-wood-700 hover:bg-cream-200">
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} {image ? "Replace photo" : "Upload photo"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
              {image ? <Button size="sm" variant="ghost" className="w-full" onClick={() => setImage(null)}><Trash2 /> Use illustration</Button> : null}
              {uploadError ? <p className="text-xs text-terracotta-600">{uploadError}</p> : null}
              <p className="text-xs text-ink-muted">Tip: shoot the meal on its black tray with greaseproof paper, from above, in daylight.</p>
            </div>
            <div className="space-y-4">
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" required maxLength={100} value={name} onChange={(e) => { setName(e.target.value); if (!product) setSlug(slugify(e.target.value)); }} />
              </Field>
              <Field label="URL slug" htmlFor="slug" hint={`Shown as /menu/${slug || "…"}`}>
                <Input id="slug" name="slug" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} maxLength={60} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category" htmlFor="category_id">
                  <Select id="category_id" name="category_id" defaultValue={product?.category_id ?? categories[0]?.id} required>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Price (₱)" htmlFor="price">
                  <Input id="price" name="price" type="number" min={0} step="0.01" required defaultValue={product?.price ?? ""} inputMode="decimal" />
                </Field>
              </div>
            </div>
          </div>

          <Field label="Description" htmlFor="description">
            <Textarea id="description" name="description" defaultValue={product?.description ?? ""} maxLength={500} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Checkbox name="is_available" label="Available to order" defaultChecked={product?.is_available ?? true} />
            <Checkbox name="is_featured" label="Feature on the home page" defaultChecked={product?.is_featured ?? false} />
            <Checkbox name="points_eligible" label="Earns loyalty points (meals)" defaultChecked={product?.points_eligible ?? true} />
            <Checkbox name="is_addon" label="Can be added to meals as an add-on" defaultChecked={product?.is_addon ?? false} />
          </div>
          <Field label="Sort order" htmlFor="sort_order" className="max-w-40">
            <Input id="sort_order" name="sort_order" type="number" min={0} max={9999} defaultValue={product?.sort_order ?? 0} />
          </Field>

          {addons.length > 0 ? (
            <fieldset className="rounded-xl border border-bamboo-300/60 p-4">
              <legend className="px-1 text-sm font-bold text-wood-700">Add-ons customers can choose for this item</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {addons.map((a) => (
                  <Checkbox key={a.id} name="addons" value={a.id} label={`${a.name} (+${peso(a.price)})`} defaultChecked={selectedAddons.includes(a.id)} />
                ))}
              </div>
            </fieldset>
          ) : null}

          <SubmitButton pendingText="Saving…" disabled={uploading}>{product ? "Save changes" : "Create item"}</SubmitButton>
        </CardBody>
      </Card>
    </form>
  );
}
