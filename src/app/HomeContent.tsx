"use client";

import { useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { PosterCard, type PosterCreator } from "@/components/ui/PosterCard";
import { EdgeScroller } from "@/components/ui/EdgeScroller";
import s from "./home.module.css";

export type HomeCreator = PosterCreator;

export interface HomeReview {
  id: string;
  text: string;
  guest: string;
  creator: string;
  category: string;
}

export interface HomeViewer {
  firstName: string;
  isCreator: boolean;
  nextSession: {
    id: string;
    with: string;
    avatar: string | null;
    offering: string;
    when: string;
    soon: boolean;
  } | null;
}

interface HomeContentProps {
  creators: HomeCreator[];
  availableToday: HomeCreator[];
  categories: { slug: string; display_label: string }[];
  categoryLabels: Record<string, string>;
  reviews: HomeReview[];
  isAnon: boolean;
  viewer: HomeViewer | null;
}

const RAIL_MAX = 12;
const GRID_MAX = 10;

const STEPS = [
  {
    title: "Pick someone",
    body: "Browse by what you’re into, read their bios and compare prices and open times.",
  },
  {
    title: "Book a time",
    body: "Choose a slot that suits you and pay securely. Your confirmation lands in your inbox right away.",
  },
  {
    title: "Go live",
    body: "Join the video call from your browser when it starts. If your creator doesn’t show, you’re refunded in full.",
  },
];

const SPEC = [
  { label: "Price", title: "You set it", body: "Charge what your time is worth." },
  { label: "Hours", title: "You choose them", body: "Open only the times that suit you." },
  { label: "Payouts", title: "Through Stripe", body: "Earnings go straight to your bank." },
  { label: "Setup", title: "A few minutes", body: "Publish now, connect your bank later." },
];

function scrollToId(e: MouseEvent<HTMLAnchorElement>, id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

export function HomeContent({
  creators,
  availableToday,
  categories,
  categoryLabels,
  reviews,
  isAnon,
  viewer,
}: HomeContentProps) {
  const [active, setActive] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  const availableIds = new Set(availableToday.map((c) => c.id));
  const availableList = availableToday.slice(0, RAIL_MAX);
  const exploreList = creators.filter((c) => !availableIds.has(c.id)).slice(0, GRID_MAX);

  // With a category picked, one results grid replaces the two sections, so no
  // section can vanish and nobody appears twice. Available-today creators lead.
  const activeLabel = active ? categoryLabels[active] ?? active : "";
  const results = active
    ? [
        ...availableToday.filter((c) => c.categories.includes(active)),
        ...creators.filter((c) => !availableIds.has(c.id) && c.categories.includes(active)),
      ].slice(0, GRID_MAX)
    : [];
  const findTarget = availableList.length > 0 ? "available" : "explore";

  const pick = (slug: string | null) => {
    setActive(slug);
    if (railRef.current) railRef.current.scrollLeft = 0;
  };
  const target = active ? "results" : findTarget;

  const howItWorks = isAnon ? (
    <section id="how" className={`${s.wrap} ${s.block}`}>
      <div className={s.head}>
        <div>
          <span className={`${s.mono} ${s.kick}`}>How it works</span>
          <h2 className={s.h2}>
            Three steps, then you’re <em>live</em>.
          </h2>
        </div>
      </div>
      <div className={s.rundown}>
        {STEPS.map((step, i) => (
          <div key={step.title} className={s.step}>
            <span className={s.num}>
              0{i + 1}
              <i />
            </span>
            <div>
              <h3 className={s.stepTitle}>{step.title}</h3>
              <p className={s.stepBody}>{step.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  ) : null;

  return (
    <main className={s.main}>
      {isAnon && (
        <header className={s.hero}>
          <div className={s.spot} />
          <div className={s.vf}>
            <i className={`${s.corner} ${s.tl}`} />
            <i className={`${s.corner} ${s.tr}`} />
            <i className={`${s.corner} ${s.bl}`} />
            <i className={`${s.corner} ${s.br}`} />
            <div className={s.hudTop}>
              <span className={s.onair}>ON AIR</span>
              <span className={s.mono}>
                <span className={s.onlyMobile}>Private · 1:1</span>
                <span className={s.onlyDesktop}>Private · One-on-one</span>
              </span>
            </div>
            <h1 className={s.h1}>
              <span className={s.setup}>Their audience is everyone.</span>
              <span className={s.punch}>
                This time, it’s <em className={s.word}>just you</em>.
              </span>
            </h1>
            <p className={s.lede}>Book a private video call with your favorite creators.</p>
            <div className={s.ctas}>
              <a
                href={`#${target}`}
                onClick={(e) => scrollToId(e, target)}
                className={`${s.btn} ${s.primary}`}
              >
                Find a creator
              </a>
              <a href="#how" onClick={(e) => scrollToId(e, "how")} className={`${s.btn} ${s.ghost}`}>
                How it works
              </a>
            </div>
            <div className={s.hudBottom}>
              <span>
                <i />
                Secure checkout · Stripe
              </span>
              <span>
                <i />
                Live video · Face to face
              </span>
              <span>
                <i />
                You pick the time
              </span>
            </div>
          </div>
        </header>
      )}

      {viewer && (
        <header className={s.welcome}>
          <div className={s.welcomeSpot} />
          <div className={`${s.wrap} ${s.welcomeIn}`}>
            <div>
              <span className={`${s.mono} ${s.kick}`}>Welcome back</span>
              <h1 className={s.welcomeTitle}>
                Good to see you, <em className={s.word}>{viewer.firstName}</em>.
              </h1>
            </div>
            {(viewer.nextSession || viewer.isCreator) && (
              <div className={s.welcomeSide}>
                {viewer.nextSession && (
                  <Link href={`/bookings/${viewer.nextSession.id}`} className={s.next}>
                    <span className={s.nextAvatar} aria-hidden="true">
                      {viewer.nextSession.with.charAt(0)}
                      {viewer.nextSession.avatar && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={viewer.nextSession.avatar}
                          alt=""
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      )}
                    </span>
                    <span className={s.nextBody}>
                      <span className={`${s.mono} ${s.nextLabel}`}>
                        {viewer.nextSession.soon && <span className={s.liveDot} />}
                        Your next session
                      </span>
                      <span className={s.nextName}>{viewer.nextSession.with}</span>
                      <span className={s.nextMeta}>
                        {viewer.nextSession.when} · {viewer.nextSession.offering}
                      </span>
                    </span>
                    <span className={s.nextGo} aria-hidden="true">
                      →
                    </span>
                  </Link>
                )}
                {viewer.isCreator && (
                  <Link href="/creator" className={`${s.btn} ${s.ghost} ${s.studio}`}>
                    Open Studio
                  </Link>
                )}
              </div>
            )}
          </div>
        </header>
      )}

      <section className={`${s.into} ${viewer ? s.intoAfterWelcome : ""}`}>
        <span className={s.mono}>What are you into?</span>
        <EdgeScroller
          label="categories"
          className={s.pills}
          wrapClassName={s.pillsWrap}
          edge="0px"
          fade="72px"
          revealKey={active}
        >
          <button
            type="button"
            className={s.pill}
            aria-pressed={active === null}
            onClick={() => pick(null)}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.slug}
              type="button"
              className={s.pill}
              aria-pressed={active === c.slug}
              onClick={() => pick(c.slug)}
            >
              {c.display_label}
            </button>
          ))}
        </EdgeScroller>
      </section>

      {active ? (
        <>
          <section id="results" className={`${s.wrap} ${s.block}`}>
            <div className={s.head}>
              <div>
                <span className={`${s.mono} ${s.kick}`}>
                  {results.some((c) => availableIds.has(c.id)) ? "Available today first" : "Category"}
                </span>
                <h2 className={s.h2}>
                  <em>{activeLabel}</em>
                </h2>
              </div>
              <Link href={`/browse/${active}`} className={s.more}>
                View all →
              </Link>
            </div>
            {results.length > 0 ? (
              <div className={s.grid}>
                {results.map((c) => (
                  <PosterCard
                    key={c.id}
                    creator={c}
                    labels={categoryLabels}
                    priorityCategory={active}
                    availableToday={availableIds.has(c.id)}
                    compact
                  />
                ))}
              </div>
            ) : (
              <p className={s.empty}>No one in {activeLabel} yet. Check back soon.</p>
            )}
          </section>
          {howItWorks}
        </>
      ) : (
        <>
        {availableList.length > 0 && (
          <section id="available" className={s.block}>
            <div className={`${s.wrap} ${s.head}`}>
              <div>
                <span className={`${s.mono} ${s.kick}`}>Open for booking</span>
                <h2 className={s.h2}>
                  <span className={s.liveDot} />
                  Available <em>today</em>
                </h2>
              </div>
              <Link
                href="/browse?available=today"
                className={s.more}
              >
                View all →
              </Link>
            </div>
            <EdgeScroller
              label="available creators"
              className={s.rail}
              wrapClassName={s.railWrap}
              edge="max(22px, calc((100% - 1200px) / 4))"
              fade="max(24px, calc((100% - 1200px) / 2))"
              scrollerRef={railRef}
            >
              {availableList.map((c) => (
                <PosterCard key={c.id} creator={c} labels={categoryLabels} />
              ))}
            </EdgeScroller>
          </section>
        )}

        {availableList.length > 0 && howItWorks}

        {exploreList.length > 0 && (
          <section id="explore" className={`${s.wrap} ${s.block}`}>
            <div className={s.head}>
              <div>
                <span className={`${s.mono} ${s.kick}`}>Every kind of expert</span>
                <h2 className={s.h2}>
                  Explore <em>creators</em>
                </h2>
              </div>
              <Link href="/browse" className={s.more}>
                View all →
              </Link>
            </div>
            <div className={s.grid}>
              {exploreList.map((c) => (
                <PosterCard key={c.id} creator={c} labels={categoryLabels} compact />
              ))}
            </div>
          </section>
        )}

        {availableList.length === 0 && howItWorks}
        </>
      )}

      {reviews.length >= 3 && (
        <section className={s.block}>
          <div className={`${s.wrap} ${s.head}`}>
            <div>
              <span className={`${s.mono} ${s.kick}`}>From completed sessions</span>
              <h2 className={s.h2}>
                What guests <em>say</em>
              </h2>
            </div>
          </div>
          <div className={s.quotes}>
            {reviews.slice(0, 3).map((r) => (
              <figure key={r.id} className={s.quote}>
                <span className={s.mark} aria-hidden="true">
                  “
                </span>
                <blockquote className={s.quoteText}>{r.text}</blockquote>
                <figcaption>
                  <span className={s.avatar}>{r.guest.charAt(0)}</span>
                  <span className={s.who}>
                    <b>{r.guest}</b>
                    <span>
                      Session with {r.creator} · {r.category}
                    </span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {!viewer?.isCreator && (
        <section className={s.band}>
          <div className={s.bandCopy}>
            <span className={s.onair}>ON AIR</span>
            <h2 className={s.bandTitle}>
              Get paid to go <em>live</em> with your audience.
            </h2>
            <p className={s.bandBody}>
              Your expertise, one person at a time. Share your profile link with your audience and let them book you
              directly.
            </p>
            <Link href="/creator" className={`${s.btn} ${s.primary} ${s.bandCta} ${s.bandCtaDesk}`}>
              Start as a creator
            </Link>
          </div>
          <div className={s.spec}>
            {SPEC.map((row) => (
              <div key={row.label} className={s.specRow}>
                <span className={s.mono}>{row.label}</span>
                <div>
                  <b>{row.title}</b>
                  <span>{row.body}</span>
                </div>
              </div>
            ))}
          </div>
          <Link href="/creator" className={`${s.btn} ${s.primary} ${s.bandCta} ${s.bandCtaMob}`}>
            Start as a creator
          </Link>
        </section>
      )}

      <footer className={s.footer}>
        <div className={s.footerIn}>
          <Logo height={32} className={s.footLogo} />
          <div className={s.footerLinks}>
            <Link href="/terms" className={s.more}>
              Terms of Service
            </Link>
            <Link href="/support" className={s.more}>
              Support
            </Link>
          </div>
          <span className={`${s.mono} ${s.copy}`}>© 2026 Haibu</span>
        </div>
      </footer>
    </main>
  );
}
