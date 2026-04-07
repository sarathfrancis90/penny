"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  FAQ data                                                          */
/* ------------------------------------------------------------------ */

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqCategory {
  title: string;
  icon: string;
  items: FaqItem[];
}

const faqData: FaqCategory[] = [
  {
    title: "Getting Started",
    icon: "rocket",
    items: [
      {
        question: "What is Penny?",
        answer:
          "Penny is an AI-powered expense tracker built for self-incorporated software professionals in Canada. It uses Google Gemini AI to automatically categorize your expenses according to CRA T2125 tax categories, making tax time effortless.",
      },
      {
        question: "How do I create an account?",
        answer:
          "Download the app or visit the web version and tap \"Sign Up\". You can register with your email address and password. Once signed in, you're ready to start tracking expenses immediately.",
      },
      {
        question: "Is Penny free to use?",
        answer:
          "Penny is currently free for personal use. All core features including AI expense analysis, budgeting, income tracking, and savings goals are available at no cost.",
      },
      {
        question: "What platforms is Penny available on?",
        answer:
          "Penny is available as a Progressive Web App (PWA) that works on any modern browser, and as a native iOS app. An Android version is planned for the future.",
      },
    ],
  },
  {
    title: "Expenses & AI",
    icon: "receipt",
    items: [
      {
        question: "How do I add an expense?",
        answer:
          "On the Home screen, type a description of your expense (e.g., \"Lunch at Tim Hortons $14.50\") and tap send. Penny's AI will automatically extract the vendor, amount, category, and date. Review the details and tap \"Confirm & Save\". You can also tap the camera icon to scan a receipt.",
      },
      {
        question: "How does AI expense analysis work?",
        answer:
          "Penny uses Google Gemini AI to analyze your expense descriptions and receipt images. It automatically identifies the vendor, amount, date, and assigns the correct CRA T2125 tax category for Canadian self-incorporated professionals. You can always review and edit the details before saving.",
      },
      {
        question: "Can I scan receipts?",
        answer:
          "Yes! Tap the camera icon on the Home screen to take a photo of your receipt. Penny's AI will extract all the relevant information including vendor, amount, date, and individual line items. It works with most printed and digital receipts.",
      },
      {
        question: "Can I export my expenses?",
        answer:
          "Yes. On the Dashboard, tap the export icon (share button) in the top right. You can export your filtered expenses as a CSV file to share via email, AirDrop, or save to Files. This is especially useful for sharing with your accountant at tax time.",
      },
    ],
  },
  {
    title: "Budgets, Income & Savings",
    icon: "chart",
    items: [
      {
        question: "How do I set up a budget?",
        answer:
          "Go to the Finances tab and tap \"Manage Budgets\". Tap the + button to create a new budget. Select a CRA T2125 category, set a monthly limit, and optionally configure rollover and alert settings. You'll receive notifications when you approach or exceed your budget.",
      },
      {
        question: "How do I track my income?",
        answer:
          "Navigate to the Income section from the Finances tab. You can add income sources with details like name, category, amount, frequency, and whether they're recurring. Penny tracks your income alongside expenses to give you a complete financial picture.",
      },
      {
        question: "How do savings goals work?",
        answer:
          "In the Savings section, create goals with a target amount and monthly contribution. Penny tracks your progress with visual indicators and lets you set priorities. You can have multiple active goals running simultaneously.",
      },
      {
        question: "What are CRA T2125 categories?",
        answer:
          "CRA T2125 is the Canadian tax form for reporting business income and expenses. Penny uses these official categories (like Advertising, Meals & Entertainment, Office Expenses, Travel, etc.) to organize your expenses, making it easy to prepare your tax return.",
      },
    ],
  },
  {
    title: "Groups & Sharing",
    icon: "group",
    items: [
      {
        question: "How do I create a group for shared expenses?",
        answer:
          "Go to the Groups tab and tap the + button. Enter a group name, description, and icon. After creating the group, you can invite members by email. Group expenses are tracked separately and all members receive notifications for new expenses and changes.",
      },
      {
        question: "What roles are available in groups?",
        answer:
          "Groups support four roles: Owner (full control), Admin (can manage expenses and members), Member (can add and edit own expenses), and Viewer (read-only access to reports). The group creator is automatically the Owner.",
      },
      {
        question: "Can groups have their own budgets?",
        answer:
          "Yes! Group admins and owners can set up group-specific budgets. These work just like personal budgets but apply to the group's shared expenses. All members with appropriate permissions can view group budget progress.",
      },
      {
        question: "How do I leave or delete a group?",
        answer:
          "Members can leave a group from the group's settings page. Only the group Owner can delete a group entirely. When a group is deleted, all associated expenses and budgets are also removed.",
      },
    ],
  },
  {
    title: "Account & Security",
    icon: "shield",
    items: [
      {
        question: "Is my financial data secure?",
        answer:
          "Yes. All data is stored on Google Firebase with encryption at rest and in transit. Authentication is handled by Firebase Auth with support for email/password and biometric login. Receipt images are stored in Firebase Cloud Storage with access restricted to authenticated users.",
      },
      {
        question: "How do I switch between light and dark mode?",
        answer:
          "Go to Profile \u2192 Settings \u2192 Appearance. You can choose System (follows your device setting), Light, or Dark. The app will remember your preference across sessions.",
      },
      {
        question: "Can I change my email or password?",
        answer:
          "You can update your password from Profile \u2192 Settings \u2192 Security. For email changes, please contact our support team as this requires additional verification for security purposes.",
      },
      {
        question: "How do I delete my account?",
        answer:
          "Go to Profile \u2192 Settings \u2192 scroll to the bottom and tap \"Delete Account\". This will permanently delete all your data including expenses, budgets, income sources, savings goals, and any group memberships. This action cannot be undone.",
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Icon components (inline SVG, no external deps)                    */
/* ------------------------------------------------------------------ */

function IconRocket({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.63 8.41m5.96 5.96a14.926 14.926 0 0 1-5.84 2.58m0 0a6 6 0 0 1-7.38-5.84h4.8m2.58-5.84a14.927 14.927 0 0 0-2.58 5.84m2.58-5.84L3.75 3.75m0 0v3.375c0 .621.504 1.125 1.125 1.125H8.25M3.75 3.75h3.375c.621 0 1.125.504 1.125 1.125V8.25" />
    </svg>
  );
}

function IconReceipt({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

function IconChart({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  );
}

function IconShield({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}

function IconUsers({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  );
}

function IconSearch({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  );
}

function IconMail({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
    </svg>
  );
}

function IconBug({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0 1 12 12.75Zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 0 1-1.152-6.135 3.375 3.375 0 1 0-5.11-3.024A3.375 3.375 0 0 0 8.945 8.055a23.91 23.91 0 0 1-1.152 6.135C10.353 13.258 13.117 12.75 12 12.75Zm-3.75-3a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm7.5 0a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" />
    </svg>
  );
}

function IconChevron({ className = "w-5 h-5", open = false }: { className?: string; open?: boolean }) {
  return (
    <svg
      className={`${className} transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

const categoryIcons: Record<string, React.FC<{ className?: string }>> = {
  rocket: IconRocket,
  receipt: IconReceipt,
  chart: IconChart,
  shield: IconShield,
  group: IconUsers,
};

/* ------------------------------------------------------------------ */
/*  Quick-link cards                                                  */
/* ------------------------------------------------------------------ */

const quickLinks = [
  {
    title: "Getting Started",
    description: "Set up your account and learn the basics",
    icon: "rocket",
    href: "#getting-started",
  },
  {
    title: "Managing Expenses",
    description: "Add, edit, and analyze your expenses with AI",
    icon: "receipt",
    href: "#expenses-ai",
  },
  {
    title: "Budgets & Finances",
    description: "Track budgets, income, and savings goals",
    icon: "chart",
    href: "#budgets-income-savings",
  },
  {
    title: "Groups & Sharing",
    description: "Collaborate on shared expenses with your team",
    icon: "group",
    href: "#groups-sharing",
  },
  {
    title: "Account & Security",
    description: "Privacy, security, and account settings",
    icon: "shield",
    href: "#account-security",
  },
];

/* ------------------------------------------------------------------ */
/*  Slug helper                                                       */
/* ------------------------------------------------------------------ */

function toSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/* ------------------------------------------------------------------ */
/*  Accordion item                                                    */
/* ------------------------------------------------------------------ */

function AccordionItem({
  item,
  isOpen,
  onToggle,
}: {
  item: FaqItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 py-4 px-1 text-left transition-colors hover:text-foreground/80 cursor-pointer"
      >
        <span className="text-[15px] font-medium text-foreground leading-snug pr-2">
          {item.question}
        </span>
        <IconChevron className="w-4 h-4 shrink-0 text-muted-foreground" open={isOpen} />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? "max-h-96 opacity-100 pb-4" : "max-h-0 opacity-0"
        }`}
      >
        <p className="text-sm leading-relaxed text-muted-foreground px-1">
          {item.answer}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                         */
/* ------------------------------------------------------------------ */

export default function SupportPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  const toggleItem = (key: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  /* Filter FAQ by search query */
  const filteredFaq = useMemo(() => {
    if (!searchQuery.trim()) return faqData;
    const q = searchQuery.toLowerCase();
    return faqData
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.question.toLowerCase().includes(q) ||
            item.answer.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [searchQuery]);

  const totalResults = filteredFaq.reduce((sum, cat) => sum + cat.items.length, 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ---------------------------------------------------------- */}
      {/*  Hero Section                                              */}
      {/* ---------------------------------------------------------- */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-blue-50/60 to-background dark:from-blue-950/20 dark:to-background">
        <div className="mx-auto max-w-4xl px-5 py-16 sm:py-24 text-center">
          {/* App icon */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[22px] overflow-hidden shadow-lg shadow-blue-500/25 dark:shadow-blue-500/15">
            <Image src="/penny.png" alt="Penny" width={80} height={80} priority />
          </div>

          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Penny Support Center
          </h1>
          <p className="mt-3 text-base sm:text-lg text-muted-foreground max-w-lg mx-auto">
            Find answers to common questions, learn how to get the most out of Penny, or reach out to our team for help.
          </p>

          {/* Search bar */}
          <div className="relative mt-8 mx-auto max-w-xl">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
              <IconSearch className="w-5 h-5 text-muted-foreground" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for help..."
              className="w-full rounded-xl border border-border bg-card pl-11 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-4 text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Clear search"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {searchQuery && (
            <p className="mt-3 text-sm text-muted-foreground">
              {totalResults === 0
                ? "No results found. Try a different search term."
                : `${totalResults} result${totalResults !== 1 ? "s" : ""} found`}
            </p>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/*  Quick Links Grid                                          */}
      {/* ---------------------------------------------------------- */}
      {!searchQuery && (
        <section className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
          <h2 className="text-lg font-semibold text-center mb-8">Browse by topic</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickLinks.map((link) => {
              const Icon = categoryIcons[link.icon] || IconRocket;
              return (
                <a
                  key={link.title}
                  href={link.href}
                  className="group flex items-start gap-4 rounded-xl border border-border bg-card p-5 transition-all hover:shadow-md hover:border-blue-500/30 dark:hover:border-blue-400/30 hover:-translate-y-0.5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 transition-colors group-hover:bg-blue-500 group-hover:text-white dark:group-hover:bg-blue-500">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{link.title}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{link.description}</p>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------- */}
      {/*  FAQ Accordion                                              */}
      {/* ---------------------------------------------------------- */}
      <section className="mx-auto max-w-3xl px-5 pb-16">
        {!searchQuery && (
          <h2 className="text-lg font-semibold text-center mb-10">
            Frequently Asked Questions
          </h2>
        )}

        <div className="space-y-10">
          {filteredFaq.map((category) => {
            const slug = toSlug(category.title);
            const Icon = categoryIcons[category.icon] || IconRocket;
            return (
              <div key={category.title} id={slug}>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                    <Icon className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground">{category.title}</h3>
                </div>
                <div className="rounded-xl border border-border bg-card px-5">
                  {category.items.map((item, idx) => {
                    const key = `${slug}-${idx}`;
                    return (
                      <AccordionItem
                        key={key}
                        item={item}
                        isOpen={openItems.has(key)}
                        onToggle={() => toggleItem(key)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/*  Contact Section                                           */}
      {/* ---------------------------------------------------------- */}
      <section className="border-t border-border bg-muted/40">
        <div className="mx-auto max-w-4xl px-5 py-14 sm:py-16">
          <h2 className="text-lg font-semibold text-center mb-2">Still need help?</h2>
          <p className="text-sm text-muted-foreground text-center mb-10 max-w-md mx-auto">
            Can&apos;t find what you&apos;re looking for? Our team is happy to assist you.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
            {/* Email support card */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 mb-4">
                <IconMail className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Email Support</h3>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Send us a message and we&apos;ll get back to you within 24 hours.
              </p>
              <a
                href="mailto:sarathfrancis90@gmail.com"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                sarathfrancis90@gmail.com
              </a>
            </div>

            {/* Bug report card */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400 mb-4">
                <IconBug className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Report a Bug</h3>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Found something broken? Email us with a description, your device info, and screenshots if possible.
              </p>
              <a
                href="mailto:sarathfrancis90@gmail.com?subject=Bug%20Report%20-%20Penny"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Submit bug report
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/*  Footer                                                    */}
      {/* ---------------------------------------------------------- */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-4xl px-5 py-8">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md overflow-hidden shadow-sm">
                <Image src="/penny.png" alt="Penny" width={28} height={28} />
              </div>
              <span className="text-sm font-semibold text-foreground">Penny</span>
              <span className="text-xs text-muted-foreground">v1.0</span>
            </div>

            <div className="flex items-center gap-6 text-sm">
              <Link
                href="/privacy"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Privacy Policy
              </Link>
              <a
                href="mailto:sarathfrancis90@gmail.com"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Contact
              </a>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Penny. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
