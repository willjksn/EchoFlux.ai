import React from "react";

export const WITME_LANDING_SECTION_CLASS = "max-w-6xl mx-auto px-4 sm:px-6 lg:px-8";

export const WitmePublicPageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative min-h-screen bg-gradient-to-b from-[#26324a] via-[#202b3f] to-[#182031] text-white">
    <div className="pointer-events-none absolute inset-0 -z-0">
      <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-sky-300/30 blur-3xl" />
      <div className="absolute right-0 top-1/3 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl" />
      <div className="absolute bottom-0 left-10 h-64 w-64 rounded-full bg-fuchsia-300/15 blur-3xl" />
    </div>
    <div className="relative z-10">{children}</div>
  </div>
);
