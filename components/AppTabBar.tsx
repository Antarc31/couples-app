"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface Tab {
  href: "/home" | "/calendario" | "/appuntamenti" | "/wishlist" | "/profilo";
  label: string;
  icon: ReactNode;
}

const strokeProps = {
  fill: "none",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const tabs: Tab[] = [
  {
    href: "/home",
    label: "Home",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" {...strokeProps}>
        <path d="M3.5 10.5 12 3.5l8.5 7" />
        <path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-5.5a2 2 0 0 1 2-2v0a2 2 0 0 1 2 2V21h3.5a1 1 0 0 0 1-1V9.5" />
      </svg>
    ),
  },
  {
    href: "/calendario",
    label: "Calendario",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" {...strokeProps}>
        <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
        <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    href: "/appuntamenti",
    label: "Appuntamenti",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" {...strokeProps}>
        <path d="M12 20.5s-7.5-4.6-9.7-9A5.1 5.1 0 0 1 12 6.3a5.1 5.1 0 0 1 9.7 5.2c-2.2 4.4-9.7 9-9.7 9Z" />
      </svg>
    ),
  },
  {
    href: "/wishlist",
    label: "Wishlist",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" {...strokeProps}>
        <path d="M4 10.5h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z" />
        <path d="M2.5 7.5h19v3h-19zM12 7.5v13M12 7.5C10 4 6 4.3 6 7c0 1 .8 .5 6 .5ZM12 7.5c2-3.5 6-3.2 6-.5 0 1-.8 .5-6 .5Z" />
      </svg>
    ),
  },
  {
    href: "/profilo",
    label: "Profilo",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" {...strokeProps}>
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M4.5 20.5c1.4-4 4-6 7.5-6s6.1 2 7.5 6" />
      </svg>
    ),
  },
];

export default function AppTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="sticky bottom-0 z-30 flex justify-around border-t border-border bg-surface/95 on-surface backdrop-blur px-1 pt-1.5 shadow-[0_-8px_24px_-12px_rgb(58_44_48_/_0.12)]"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.4rem)" }}
      aria-label="Navigazione principale"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[11px] font-semibold transition ${
              active ? "text-couple" : "text-ink-soft"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {tab.icon}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
