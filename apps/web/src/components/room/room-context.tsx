"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type Ctx = { focus: string | null; setFocus: (id: string | null) => void; sheet: boolean; setSheet: (v: boolean) => void };
const RoomCtx = createContext<Ctx>({ focus: null, setFocus: () => {}, sheet: false, setSheet: () => {} });

/** Which story the Discover panel follows. */
export function RoomProvider({ children }: { children: ReactNode }) {
  const [focus, setFocus] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  return <RoomCtx.Provider value={{ focus, setFocus, sheet, setSheet }}>{children}</RoomCtx.Provider>;
}

export const useRoom = () => useContext(RoomCtx);
