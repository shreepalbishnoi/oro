"use client";

import { useState } from "react";
import { ShieldCheck, UserPlus } from "lucide-react";
import { FAMILY, type Member } from "@/lib/fixtures/room";

/** Family rooms and Guardian mode. Each member consents separately; the combined view is read-only. */
export function FamilyGuardian() {
  const [members, setMembers] = useState<Member[]>(FAMILY);
  const [name, setName] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <section className="rounded-[1.5rem] border border-line bg-ink-1/80" aria-labelledby="members">
        <h2 id="members" className="eyebrow border-b border-line px-5 py-4">
          Members
        </h2>
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-ink-3 font-display text-lg text-gold" aria-hidden="true">
                  {m.name[0]}
                </span>
                <div>
                  <p className="text-paper">
                    {m.name} <span className="text-[0.8rem] text-mute">· {m.relation}</span>
                  </p>
                  <p className="text-[0.78rem] text-paper-dim">{m.consent === "active" ? (m.lastCheck ?? "Consent given · shares a read-only view") : "Invitation sent · waiting for their consent"}</p>
                </div>
              </div>
              {m.relation !== "Owner" && m.consent === "active" && (
                <label className="flex cursor-pointer items-center gap-2 text-[0.85rem] text-paper-dim">
                  <span>Guardian alerts</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={m.guardian}
                    onClick={() => setMembers((xs) => xs.map((x) => (x.id === m.id ? { ...x, guardian: !x.guardian } : x)))}
                    className={`relative h-6 w-11 rounded-full transition-colors ${m.guardian ? "bg-gold" : "bg-ink-4"}`}
                  >
                    <span className={`absolute top-0.5 size-5 rounded-full bg-paper transition-transform ${m.guardian ? "translate-x-5.5" : "translate-x-0.5"}`} />
                    <span className="sr-only">Guardian alerts for {m.name}</span>
                  </button>
                </label>
              )}
            </li>
          ))}
        </ul>
        <form
          className="flex flex-wrap gap-2 border-t border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setMembers((xs) => [...xs, { id: `m${xs.length + 1}`, name: name.trim(), relation: "Family", consent: "invited", guardian: false }]);
            setSent(name.trim());
            setName("");
          }}
        >
          <label htmlFor="inv" className="sr-only">
            Name of family member to invite
          </label>
          <input id="inv" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name of family member" className="min-w-0 flex-1 rounded-xl border border-line bg-ink-2 px-3 py-2 text-paper focus:border-gold focus:outline-none" />
          <button className="btn btn-ghost h-10 px-4 text-sm">
            <UserPlus className="size-4" aria-hidden="true" /> Invite
          </button>
          {sent && (
            <p role="status" className="w-full text-[0.8rem] text-paper-dim">
              Invite link ready for {sent}. They choose what to share; nothing is visible until they agree.
            </p>
          )}
        </form>
      </section>

      <section className="glass rounded-[1.5rem] p-6" aria-labelledby="guardian">
        <ShieldCheck className="size-6 text-gold" aria-hidden="true" />
        <h2 id="guardian" className="display mt-3 text-[1.8rem] leading-tight">
          Guardian mode
        </h2>
        <p className="mt-3 text-paper-dim">
          Many investment-fraud victims are older relatives. If a member opts in, a High-risk check on their phone sends you an alert, so you can call before they pay anyone.
        </p>
        <ul className="mt-4 space-y-2 text-[0.9rem] text-paper-dim">
          <li>• The member turns it on; you can&rsquo;t turn it on for them.</li>
          <li>• You see the risk band and signals, not the tip text, unless they allow it.</li>
          <li>• They can switch it off any time, and you&rsquo;re told when they do.</li>
        </ul>
      </section>
    </div>
  );
}
