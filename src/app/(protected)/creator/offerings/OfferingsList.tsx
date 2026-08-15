"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createOffering,
  updateOffering,
  deactivateOffering,
  reactivateOffering,
  deleteOffering,
} from "../actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Pill } from "@/components/ui/Pill";
import { useActionState } from "react";

const durations = [15, 30, 45, 60];
const categories = [
  { value: "casual_talk", label: "Casual Talk" },
  { value: "asmr", label: "ASMR" },
  { value: "music", label: "Music" },
];

type Offering = {
  id: string;
  title: string;
  category: string;
  duration_minutes: number;
  price_cents: number;
  is_active: boolean;
  booking_count: number;
};

export function OfferingsList({
  offerings,
  profileId,
  profileCategory,
}: {
  offerings: Offering[];
  profileId: string;
  profileCategory: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Offering | null>(null);
  const router = useRouter();

  const activeOfferings = offerings.filter((o) => o.is_active);
  const inactiveOfferings = offerings.filter((o) => !o.is_active);
  const visible = showInactive ? offerings : activeOfferings;

  return (
    <div className="space-y-4">
      {inactiveOfferings.length > 0 && (
        <Pill
          variant={showInactive ? "active" : "inactive"}
          onClick={() => setShowInactive(!showInactive)}
          className="mb-2"
        >
          {showInactive
            ? "Hide inactive offerings"
            : `Show inactive offerings (${inactiveOfferings.length})`}
        </Pill>
      )}

      {visible.length === 0 && !editingId && (
        <p className="text-sm text-text-secondary">
          No offerings yet. Create one below.
        </p>
      )}

      {visible.map((o) => (
        <Card key={o.id}>
          {editingId === o.id ? (
            <OfferingEditForm
              offering={o}
              onCancel={() => setEditingId(null)}
              onSaved={() => {
                setEditingId(null);
                router.refresh();
              }}
            />
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">{o.title}</span>
                  {!o.is_active && <Badge variant="cancelled" label="Inactive" />}
                </div>
                <div className="mt-1 flex gap-3 text-sm text-text-secondary">
                  <span>
                    {categories.find((c) => c.value === o.category)?.label ??
                      o.category}
                  </span>
                  <span>{o.duration_minutes} min</span>
                  <span>${(o.price_cents / 100).toFixed(2)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => setEditingId(o.id)}
                >
                  Edit
                </Button>
                {o.is_active ? (
                  <DeactivateButton id={o.id} />
                ) : (
                  <ReactivateButton id={o.id} />
                )}
                <DeleteButton offering={o} onDelete={setPendingDelete} />
              </div>
            </div>
          )}
        </Card>
      ))}

      {!editingId && <CreateOfferingForm defaultCategory={profileCategory} />}

      {pendingDelete && (
        <DeleteConfirmModal
          offering={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function CreateOfferingForm({ defaultCategory }: { defaultCategory: string }) {
  const [state, action, pending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      return createOffering(formData);
    },
    null,
  );

  return (
    <form action={action} className="space-y-4">
      <h3 className="font-medium text-white">New Offering</h3>

      <Input
        name="title"
        type="text"
        required
        placeholder="Session title (e.g. Late-night chat)"
      />

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-text-secondary">Category</label>
          <Select name="category" defaultValue={defaultCategory}>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-text-secondary">Duration</label>
          <Select name="duration_minutes" defaultValue={30}>
            {durations.map((d) => (
              <option key={d} value={d}>
                {d} minutes
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-text-secondary">
          Price (USD)
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
            $
          </span>
          <Input
            name="price_dollars"
            type="number"
            step="0.01"
            min="5"
            max="500"
            required
            placeholder="20.00"
            className="pl-8"
          />
        </div>
      </div>

      {state && "error" in state && (
        <p className="text-sm text-error">{state.error}</p>
      )}

      <Button type="submit" disabled={pending} size="small">
        Create offering
      </Button>
    </form>
  );
}

function OfferingEditForm({
  offering,
  onCancel,
  onSaved,
}: {
  offering: Offering;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Capture synchronously — React nulls e.currentTarget after await.
    const form = e.currentTarget;
    setSaving(true);
    setError(null);
    const formData = new FormData(form);
    const result = await updateOffering(offering.id, formData);
    if (result && "error" in result) {
      setError((result as { error: string }).error);
      setSaving(false);
    } else {
      onSaved();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input name="title" type="text" defaultValue={offering.title} />
      <div>
        <label className="mb-1 block text-xs text-text-secondary">
          Price (USD)
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
            $
          </span>
          <Input
            name="price_dollars"
            type="number"
            step="0.01"
            min="5"
            max="500"
            defaultValue={(offering.price_cents / 100).toFixed(2)}
            className="pl-8"
          />
        </div>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving} size="small">
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button
          variant="secondary"
          size="small"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DeactivateButton({ id }: { id: string }) {
  return (
    <form
      action={async () => {
        await deactivateOffering(id);
      }}
    >
      <Button variant="ghost" size="small" type="submit">
        Deactivate
      </Button>
    </form>
  );
}

function ReactivateButton({ id }: { id: string }) {
  return (
    <form
      action={async () => {
        await reactivateOffering(id);
      }}
    >
      <Button variant="secondary" size="small" type="submit">
        Reactivate
      </Button>
    </form>
  );
}

function DeleteButton({
  offering,
  onDelete,
}: {
  offering: Offering;
  onDelete: (o: Offering) => void;
}) {
  return (
    <Button variant="ghost" size="small" onClick={() => onDelete(offering)}>
      Delete
    </Button>
  );
}

function DeleteConfirmModal({
  offering,
  onCancel,
  onConfirm,
}: {
  offering: Offering;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-modal bg-bg-surface p-6">
        <h3 className="mb-2 text-lg font-semibold text-white">Delete offering</h3>
        <p className="mb-6 text-sm text-text-secondary">
          Delete &quot;{offering.title}&quot;? This will remove it from your
          active offerings.
        </p>
        <div className="flex gap-2">
          <Button
            size="small"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              await deleteOffering(offering.id);
              onConfirm();
              router.refresh();
            }}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={onCancel}
            disabled={deleting}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
