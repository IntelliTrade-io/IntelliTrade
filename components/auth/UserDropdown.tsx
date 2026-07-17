"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { LayoutDashboard, User, LogOut, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserDropdownProps {
  email: string;
  isSubscribed: boolean;
}

export function UserDropdown({ email, isSubscribed }: UserDropdownProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setOpen((v) => !v);
  };

  const handleSignOut = async () => {
    setOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const initial = email.charAt(0).toUpperCase();

  const dropdown = (
    <div
      ref={dropdownRef}
      style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 99999 }}
      className="w-56 rounded-[14px] border border-white/10 bg-[#111117] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] overflow-hidden"
    >
      {/* Email header */}
      <div className="px-4 py-3 border-b border-white/8">
        <p className="text-[11px] text-white/40 truncate">{email}</p>
      </div>

      <div className="p-1.5 space-y-0.5">
        {isSubscribed && (
          <Link
            href="/dashboardv2"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white/80 hover:text-white hover:bg-white/[0.08] transition-all"
          >
            <LayoutDashboard className="h-4 w-4 text-white/50 shrink-0" />
            Dashboard
          </Link>
        )}
        <Link
          href="/account"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white/80 hover:text-white hover:bg-white/[0.08] transition-all"
        >
          <User className="h-4 w-4 text-white/50 shrink-0" />
          My account
        </Link>

        <div className="h-px bg-white/10 mx-1 my-1" />

        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-white/60 hover:text-white hover:bg-white/[0.08] transition-all"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 rounded-full transition-all duration-200",
          open ? "ring-2 ring-brand/50" : "",
        )}
      >
        {/* Avatar */}
        <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/10 bg-gradient-to-br from-brand to-brandLight text-sm font-bold text-white shadow-md shadow-brand/30">
          {initial}
        </div>
        <ChevronDown className={cn("h-3.5 w-3.5 text-white/50 transition-transform duration-200", open ? "rotate-180" : "")} />
      </button>

      {mounted && open && createPortal(dropdown, document.body)}
    </>
  );
}
