import type { ReactNode } from "react";
import { CheckCheck, Eye, ChevronLeft, Forward, Mic, MoreVertical, Paperclip, Phone, Smile, Video } from "lucide-react";

export type ChatApp = "whatsapp" | "telegram";

/**
 * Chat-app look-alikes for the demo forwards. Colours follow each app's dark theme so the
 * message reads as something you'd actually receive; no logos or app names are drawn.
 */
const SKINS = {
  whatsapp: {
    bar: "#202c33",
    barText: "#e9edef",
    barSub: "#8696a0",
    avatar: "#00a884",
    wall: "#0b141a",
    // Code-drawn doodle wallpaper: faint line icons on a tile.
    pattern: `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' fill='none' stroke='#ffffff' stroke-opacity='0.045' stroke-width='1.4' stroke-linecap='round'><circle cx='20' cy='22' r='8'/><path d='M60 14l6 10h-12z'/><rect x='92' y='14' width='16' height='12' rx='3'/><path d='M14 70c6-8 14-8 20 0'/><circle cx='64' cy='66' r='3'/><path d='M96 60l10 10M106 60l-10 10'/><path d='M22 104h16M30 96v16'/><path d='M58 100c4 6 12 6 16 0'/><rect x='94' y='96' width='14' height='14' rx='7'/></svg>`,
    )}")`,
    bubble: "#202c33",
    text: "#e9edef",
    meta: "#8696a0",
    sender: "#53bdeb",
    input: "#2a3942",
    corner: "rounded-tl-none",
  },
  telegram: {
    bar: "#17212b",
    barText: "#f5f5f5",
    barSub: "#6d7f8f",
    avatar: "#5288c1",
    wall: "#0e1621",
    pattern:
      "radial-gradient(120% 80% at 10% 0%, rgb(82 136 193 / 0.22), transparent 60%), radial-gradient(90% 70% at 100% 100%, rgb(80 160 120 / 0.16), transparent 60%)",
    bubble: "#182533",
    text: "#f5f5f5",
    meta: "#6d7f8f",
    sender: "#71baf5",
    input: "#17212b",
    corner: "rounded-bl-none",
  },
} as const;

export const CHATS: Record<ChatApp, { name: string; sub: string; sender: string; initials: string }> = {
  whatsapp: { name: "Stock Tips Family 💰", sub: "Ramesh, Priya, Uncle ji and 211 others", sender: "~ Ramesh", initials: "ST" },
  telegram: { name: "VIP Calls 💎 Daily Profit", sub: "12,408 subscribers", sender: "VIP Calls 💎", initials: "VC" },
};

export function ChatFrame({ app, children, badge, time = "10:42" }: { app: ChatApp; children: ReactNode; badge?: ReactNode; time?: string }) {
  const s = SKINS[app];
  const c = CHATS[app];
  return (
    <div className="overflow-hidden rounded-[1.4rem] shadow-[0_24px_60px_-20px_rgb(0_0_0/0.7)]" style={{ background: s.wall }}>
      <div className="flex items-center gap-3 px-3 py-2.5" style={{ background: s.bar, color: s.barText }}>
        <ChevronLeft className="size-5 shrink-0 opacity-70" aria-hidden="true" />
        <span className="grid size-9 shrink-0 place-items-center rounded-full text-[0.8rem] font-semibold text-white" style={{ background: s.avatar }}>
          {c.initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.95rem] font-medium">{c.name}</span>
          <span className="block truncate text-[0.75rem]" style={{ color: s.barSub }}>
            {c.sub}
          </span>
        </span>
        {app === "whatsapp" ? (
          <span className="flex gap-4 opacity-80" style={{ color: s.barSub }} aria-hidden="true">
            <Video className="size-5" />
            <Phone className="size-[1.1rem]" />
            <MoreVertical className="size-5" />
          </span>
        ) : (
          <MoreVertical className="size-5 opacity-70" style={{ color: s.barSub }} aria-hidden="true" />
        )}
        {badge}
      </div>

      <div className="px-3 py-5 sm:px-5" style={{ backgroundImage: s.pattern }}>
        <p className="mx-auto mb-4 w-fit rounded-lg px-2.5 py-1 text-[0.72rem] uppercase" style={{ background: s.bubble, color: s.meta }}>
          Today
        </p>
        <div className={`relative max-w-[94%] rounded-xl ${s.corner} px-3 pt-1.5 pb-1 shadow-[0_1px_1px_rgb(0_0_0/0.3)]`} style={{ background: s.bubble, color: s.text }}>
          <p className="text-[0.85rem] font-medium" style={{ color: s.sender }}>
            {c.sender}
          </p>
          <p className="flex items-center gap-1 text-[0.78rem] italic" style={{ color: s.meta }}>
            <Forward className="size-3.5" aria-hidden="true" /> Forwarded many times
          </p>
          {children}
          <p className="flex items-center justify-end gap-1 text-[0.68rem]" style={{ color: s.meta }}>
            {app === "telegram" && (
              <span className="flex items-center gap-1">
                <Eye className="size-3.5" aria-hidden="true" /> 12.4K ·
              </span>
            )}
            {time}
            {app === "whatsapp" && <CheckCheck className="size-3.5 text-[#53bdeb]" aria-hidden="true" />}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: app === "whatsapp" ? s.wall : s.bar }} aria-hidden="true">
        <span className="flex h-10 flex-1 items-center gap-3 rounded-full px-4 text-[0.88rem]" style={{ background: s.input, color: s.meta }}>
          <Smile className="size-5" />
          {app === "whatsapp" ? "Message" : "Broadcast"}
          <Paperclip className="ml-auto size-5" />
        </span>
        <span className="grid size-10 place-items-center rounded-full text-white" style={{ background: app === "whatsapp" ? "#00a884" : "#5288c1" }}>
          <Mic className="size-5" />
        </span>
      </div>
    </div>
  );
}
