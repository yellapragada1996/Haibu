"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CreatorCard } from "@/components/ui/CreatorCard";
import { Pill } from "@/components/ui/Pill";
import { categoryLabel } from "@/lib/categories";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { NavBar } from "@/components/ui/NavBar";
import { ToastProvider, toast } from "@/components/ui/Toast";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-xs text-text-tertiary mb-2">{title}</p>
      {children}
    </div>
  );
}

export default function ComponentsShowcase() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="min-h-screen bg-bg-base p-6 max-w-[900px] mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">
          haibu — Component Library
        </h1>

        <Section title="NavBar">
          <SubSection title="Logged out">
            <NavBar isLoggedIn={false} />
          </SubSection>
          <SubSection title="Logged in, not creator">
            <NavBar isLoggedIn={true} isCreator={false} userName="Jane Fan" />
          </SubSection>
          <SubSection title="Logged in, is creator">
            <NavBar isLoggedIn={true} isCreator={true} userName="Alice Creator" />
          </SubSection>
        </Section>

        <Section title="Button">
          <SubSection title="Primary / default">
            <div className="flex gap-2 flex-wrap">
              <Button>Primary default</Button>
              <Button disabled>Primary disabled</Button>
            </div>
          </SubSection>
          <SubSection title="Primary / small">
            <Button size="small">Primary small</Button>
          </SubSection>
          <SubSection title="Secondary">
            <div className="flex gap-2 flex-wrap">
              <Button variant="secondary">Secondary default</Button>
              <Button variant="secondary" disabled>Secondary disabled</Button>
              <Button variant="secondary" size="small">Secondary small</Button>
            </div>
          </SubSection>
          <SubSection title="Ghost">
            <div className="flex gap-2 flex-wrap">
              <Button variant="ghost">Ghost default</Button>
              <Button variant="ghost" disabled>Ghost disabled</Button>
              <Button variant="ghost" size="small">Ghost small</Button>
            </div>
          </SubSection>
          <SubSection title="ButtonLink (primary)">
            <ButtonLink href="/">Primary link</ButtonLink>
          </SubSection>
        </Section>

        <Section title="Card">
          <div className="flex gap-4 flex-wrap">
            <Card className="w-64">
              <p className="text-white text-sm">Default card</p>
            </Card>
            <Card hover className="w-64">
              <p className="text-white text-sm">Hover card (try hover)</p>
            </Card>
            <Card className="w-64" padding={false}>
              <div className="aspect-[4/3] bg-bg-card-hover rounded-t-card" />
              <p className="text-white text-sm p-3">No-padding card</p>
            </Card>
          </div>
        </Section>

        <Section title="CreatorCard">
          <div className="flex gap-4 flex-wrap">
            <CreatorCard name="Sarah Music" categories={["music", "asmr", "casual_talk", "music"]} priceCents={2500} durationMinutes={30} rating={4.8} sessionCount={42} availableToday />
            <CreatorCard name="Alex Talk" categories={["casual_talk"]} priceCents={1500} durationMinutes={15} rating={0} sessionCount={3} />
            <CreatorCard name="Calm Vibes ASMR" categories={["asmr"]} priceCents={3500} durationMinutes={60} rating={4.9} sessionCount={127} availableToday />
          </div>
        </Section>

        <Section title="Pill / Chip">
          <SubSection title="Inactive">
            <div className="flex gap-2 flex-wrap">
              <Pill>All</Pill>
              <Pill>Casual Talk</Pill>
              <Pill>ASMR</Pill>
              <Pill>Music</Pill>
            </div>
          </SubSection>
          <SubSection title="Active">
            <div className="flex gap-2 flex-wrap">
              <Pill variant="active">All</Pill>
              <Pill variant="active">Casual Talk</Pill>
            </div>
          </SubSection>
        </Section>

        <Section title="Badge">
          <div className="flex gap-3 flex-wrap">
            <Badge variant="live" />
            <Badge variant="confirmed" />
            <Badge variant="pending" />
            <Badge variant="cancelled" />
            <Badge variant="completed" />
          </div>
        </Section>

        <Section title="Avatar">
          <SubSection title="With image">
            <Avatar src="https://i.pravatar.cc/64?img=1" name="Jane Doe" size={48} />
          </SubSection>
          <SubSection title="Fallback initials">
            <div className="flex gap-2">
              <Avatar name="Alice Creator" size={40} />
              <Avatar name="Bob" size={40} />
              <Avatar name="Charlie Delta" size={24} />
            </div>
          </SubSection>
        </Section>

        <Section title="Input">
          <SubSection title="Default">
            <Input placeholder="Enter your email" className="max-w-xs" />
          </SubSection>
          <SubSection title="With error">
            <Input placeholder="Enter your email" error="Invalid email address" className="max-w-xs" />
          </SubSection>
          <SubSection title="Pill variant (search)">
            <Input placeholder="Search creators" pill className="max-w-xs" />
          </SubSection>
          <SubSection title="Select">
            <Select className="max-w-xs">
              <option>Casual Talk</option>
              <option>ASMR</option>
              <option>Music</option>
            </Select>
          </SubSection>
        </Section>

        <Section title="Modal">
          <Button onClick={() => setModalOpen(true)}>Open modal</Button>
          <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Confirm cancellation">
            <p className="text-sm text-text-secondary mb-4">
              You&apos;ll receive a full refund of $20.00. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button size="small">Confirm</Button>
              <Button variant="secondary" size="small" onClick={() => setModalOpen(false)}>Cancel</Button>
            </div>
          </Modal>
        </Section>

        <Section title="Toast">
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" onClick={() => toast("Slot taken — here's what's available", "error")}>
              Trigger error toast
            </Button>
            <Button variant="secondary" onClick={() => toast("Booking confirmed!", "success")}>
              Trigger success toast
            </Button>
            <Button variant="secondary" onClick={() => toast("Your session starts in 5 minutes", "info")}>
              Trigger info toast
            </Button>
          </div>
        </Section>

        <div className="h-24" />
      </div>
    </ToastProvider>
  );
}
