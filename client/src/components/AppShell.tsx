import React, { useState } from "react";
import { Link, NavLink } from "react-router-dom";

type NavItem = { to: string; label: string };

export function AppShell({
  title,
  nav,
  children,
  onLogout,
}: {
  title: string;
  nav: NavItem[];
  children: React.ReactNode;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-lg px-4 py-3 text-base font-medium min-h-[44px] flex items-center ${
      isActive ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-100"
    }`;

  return (
    <div className="min-h-dvh flex flex-col md:flex-row">
      <header className="md:hidden flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sticky top-0 z-20">
        <span className="font-semibold text-brand-900">{title}</span>
        <button
          type="button"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium min-h-[44px] min-w-[44px]"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
        >
          Menu
        </button>
      </header>

      {open && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] bg-white border-r border-slate-200 transform transition-transform md:static md:translate-x-0 md:flex md:flex-col ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 border-b border-slate-100 hidden md:block">
          <p className="text-xs uppercase tracking-wide text-slate-500">Level Test</p>
          <p className="font-semibold text-brand-900">{title}</p>
        </div>
        <nav className="p-3 flex-1 space-y-1 overflow-y-auto">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} className={linkClass} onClick={() => setOpen(false)}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-100">
          <Link
            to="/login"
            onClick={() => {
              onLogout();
              setOpen(false);
            }}
            className="block w-full rounded-lg border border-slate-200 px-4 py-3 text-center text-base font-medium min-h-[44px]"
          >
            Log out
          </Link>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 max-w-6xl w-full mx-auto">{children}</main>
    </div>
  );
}
