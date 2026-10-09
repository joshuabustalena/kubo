"use client";

import { Loader2, Pencil, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { STAFF_PERMISSIONS, type Profile, type StaffPermission } from "@/lib/types";
import { createStaff, findUserByEmail, setAccess } from "./actions";

export function StaffManager({ staff, meId, canCreate }: { staff: Profile[]; meId: string; canCreate: boolean }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [lookup, setLookup] = useState("");
  const [busy, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  return (
    <div className="space-y-5">
      {!canCreate ? (
        <Alert tone="warning" title="Creating new logins needs SUPABASE_SECRET_KEY">
          Add the service key to the server environment, or ask the person to sign up as a customer and promote them below.
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <Button onClick={() => setCreating(true)} disabled={!canCreate}><UserPlus /> New staff login</Button>
        <form className="flex items-end gap-2" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await findUserByEmail(lookup);
            if (!res.ok) return toast.error(res.error);
            if (!res.data) return toast.error("No account with that username or mobile number.");
            setEditing({ ...(res.data as Profile), permissions: [], is_active: true });
          });
        }}>
          <Field label="Promote an existing account" htmlFor="lookup"><Input id="lookup" value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="username or mobile number" className="h-10 w-64" /></Field>
          <Button type="submit" variant="outline" disabled={busy || !lookup}>{busy ? <Loader2 className="animate-spin" /> : null} Find</Button>
        </form>
      </div>
      <Card>
        <Table>
          <thead><tr><Th>Name</Th><Th>Role</Th><Th>Permissions</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {staff.map((s) => (
              <Tr key={s.id}>
                <Td><span className="font-semibold">{s.full_name || "(no name)"}</span>{s.id === meId ? <span className="text-xs text-ink-muted"> (you)</span> : null}<br /><span className="text-xs text-ink-muted">{s.username ? `@${s.username}` : s.email}</span></Td>
                <Td><Badge tone={s.role === "admin" ? "forest" : "blue"}>{s.role}</Badge></Td>
                <Td className="space-x-1">{s.role === "admin" ? <span className="text-sm text-ink-muted">Everything</span> : s.permissions.length ? s.permissions.map((p) => <Badge key={p} tone="green">{STAFF_PERMISSIONS.find((x) => x.value === p)?.label ?? p}</Badge>) : <span className="text-sm text-ink-muted">POS basics</span>}</Td>
                <Td><Badge tone={s.is_active ? "green" : "red"}>{s.is_active ? "Active" : "Deactivated"}</Badge></Td>
                <Td><Button size="sm" variant="outline" onClick={() => setEditing(s)}><Pencil /> Edit</Button></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {creating ? <CreateDialog onClose={() => { setCreating(false); router.refresh(); }} /> : null}
      {editing ? <AccessDialog profile={editing} isMe={editing.id === meId} onClose={() => { setEditing(null); router.refresh(); }} /> : null}
    </div>
  );
}

function PermissionPicker({ value, onChange }: { value: StaffPermission[]; onChange: (v: StaffPermission[]) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-wood-700">Extra permissions</legend>
      {STAFF_PERMISSIONS.map((p) => (
        <div key={p.value}>
          <Checkbox label={p.label} checked={value.includes(p.value)} onChange={(e) => onChange(e.target.checked ? [...value, p.value] : value.filter((x) => x !== p.value))} />
          <p className="ml-7 text-xs text-ink-muted">{p.help}</p>
        </div>
      ))}
    </fieldset>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [perms, setPerms] = useState<StaffPermission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const toast = useToast();
  return (
    <Dialog open onClose={onClose} title="New staff login" description="Share the temporary password privately; they can change it after logging in." footer={<>
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button disabled={busy} onClick={() => start(async () => {
        const res = await createStaff({ full_name: name, username, phone, password, role, permissions: role === "staff" ? perms : [] });
        if (!res.ok) return setError(res.error);
        toast.success(`${name} can now log in.`);
        onClose();
      })}>{busy ? <Loader2 className="animate-spin" /> : null} Create login</Button>
    </>}>
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      <div className="space-y-3">
        <Field label="Full name" htmlFor="st-name"><Input id="st-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
        <Field label="Username (for logging in)" htmlFor="st-user" hint="3–20 letters, numbers, dots or underscores."><Input id="st-user" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoCapitalize="none" /></Field>
        <Field label="Mobile number (optional)" htmlFor="st-phone"><Input id="st-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0917 123 4567" /></Field>
        <Field label="Temporary password" htmlFor="st-pw" hint="At least 8 characters."><Input id="st-pw" type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" /></Field>
        <Field label="Role" htmlFor="st-role"><Select id="st-role" value={role} onChange={(e) => setRole(e.target.value as "staff" | "admin")}><option value="staff">Staff / cashier</option><option value="admin">Admin (full access)</option></Select></Field>
        {role === "staff" ? <PermissionPicker value={perms} onChange={setPerms} /> : null}
      </div>
    </Dialog>
  );
}

function AccessDialog({ profile, isMe, onClose }: { profile: Profile; isMe: boolean; onClose: () => void }) {
  const [role, setRole] = useState(profile.role);
  const [perms, setPerms] = useState<StaffPermission[]>(profile.permissions ?? []);
  const [active, setActive] = useState(profile.is_active);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const toast = useToast();
  return (
    <Dialog open onClose={onClose} title={`Access for ${profile.full_name || profile.username || profile.email}`} footer={<>
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button disabled={busy} onClick={() => start(async () => {
        const res = await setAccess(profile.id, role, role === "staff" ? perms : [], active);
        if (!res.ok) return setError(res.error);
        toast.success("Access updated.");
        onClose();
      })}>Save</Button>
    </>}>
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      <div className="space-y-3">
        <Field label="Role" htmlFor="ac-role">
          <Select id="ac-role" value={role} onChange={(e) => setRole(e.target.value as Profile["role"])} disabled={isMe}>
            <option value="customer">Customer (no staff access)</option><option value="staff">Staff / cashier</option><option value="admin">Admin</option>
          </Select>
        </Field>
        {role === "staff" ? <PermissionPicker value={perms} onChange={setPerms} /> : null}
        <Checkbox label="Account active (untick to block login)" checked={active} disabled={isMe} onChange={(e) => setActive(e.target.checked)} />
        {isMe ? <p className="text-xs text-ink-muted">You can&apos;t remove your own admin access.</p> : null}
      </div>
    </Dialog>
  );
}
