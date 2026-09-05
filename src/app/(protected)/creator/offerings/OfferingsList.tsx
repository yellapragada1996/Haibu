"use client";

import { useEffect, useRef, useState } from "react";
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

const durations = [5, 15, 30, 45, 60];

type CategoryOption = { value: string; label: string };

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
  categories,
  createFormId,
  hideCreateSubmit,
  hideCreateForm,
  onCreated,
}: {
  offerings: Offering[];
  profileId: string;
  profileCategory: string;
  categories: CategoryOption[];
  createFormId?: string;
  hideCreateSubmit?: boolean;
  hideCreateForm?: boolean;
  onCreated?: () => void;
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
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{o.title}</span>
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
              <div className="hidden shrink-0 gap-2 md:flex">
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
              <OfferingActionsMenu
                offering={o}
                onEdit={() => setEditingId(o.id)}
                onDelete={setPendingDelete}
              />
            </div>
          )}
        </Card>
      ))}

      {!editingId && !hideCreateForm && (
        <CreateOfferingForm
          defaultCategory={profileCategory}
          categories={categories}
          formId={createFormId}
          hideSubmit={hideCreateSubmit}
          onCreated={onCreated}
        />
      )}

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

function CreateOfferingForm({
  defaultCategory,
  categories,
  formId,
  hideSubmit,
  onCreated,
}: {
  defaultCategory: string;
  categories: CategoryOption[];
  formId?: string;
  hideSubmit?: boolean;
  onCreated?: () => void;
}) {
  const [state, action, pending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      return createOffering(formData);
    },
    null,
  );

  useEffect(() => {
    if (state && typeof state === "object" && "success" in state) {
      onCreated?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} id={formId} className="space-y-4">
      <h3 className="font-medium text-text-primary">New Offering</h3>

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

      {!hideSubmit && (
        <Button type="submit" disabled={pending} size="small">
          Create offering
        </Button>
      )}
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
    <Button variant="secondary" size="small" onClick={() => onDelete(offering)}>
      Delete
    </Button>
  );
}

function OfferingActionsMenu({
  offering,
  onEdit,
  onDelete,
}: {
  offering: Offering;
  onEdit: () => void;
  onDelete: (o: Offering) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const menuItem =
    "block w-full rounded-input px-3 py-2.5 text-left text-sm transition-colors";

  return (
    <div ref={ref} className="relative shrink-0 md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${offering.title} actions`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center rounded-pill text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`${offering.title} actions`}
          className="absolute right-0 top-full z-20 mt-1 w-44 rounded-input bg-bg-surface p-1 shadow-xl ring-1 ring-border-subtle"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className={`${menuItem} text-text-primary hover:bg-bg-card-hover`}
          >
            Edit
          </button>
          {offering.is_active ? (
            <form
              action={async () => {
                await deactivateOffering(offering.id);
              }}
            >
              <button
                type="submit"
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`${menuItem} text-text-primary hover:bg-bg-card-hover`}
              >
                Deactivate
              </button>
            </form>
          ) : (
            <form
              action={async () => {
                await reactivateOffering(offering.id);
              }}
            >
              <button
                type="submit"
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`${menuItem} text-text-primary hover:bg-bg-card-hover`}
              >
                Reactivate
              </button>
            </form>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete(offering);
            }}
            className={`${menuItem} text-error hover:bg-bg-card-hover`}
          >
            Delete
          </button>
        </div>
      )}
    </div>
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
        <h3 className="mb-2 text-lg font-semibold text-text-primary">Delete offering</h3>
        <p className="mb-6 text-sm text-text-secondary">
          Delete &quot;{offering.title}&quot;? This will remove it from your
          active offerings.
        </p>
        <div className="flex gap-2">
          <Button
            variant="destructive"
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
            variant="ghost"
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
