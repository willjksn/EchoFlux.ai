import React, { useEffect } from "react";
import { witmePublicHref } from "../src/lib/witmeFirstCreator";
import { WITME_OG_IMAGE_PATH } from "../src/lib/witmePublicAssets";
import { trackWitmeEvent } from "../src/lib/witmeTrackEvent";
import { useWitmeSeo } from "./witme-home/useWitmeSeo";
import { WITME_LANDING_SECTION_CLASS, WitmePublicPageShell } from "./witme-home/WitmePublicPageShell";

const APPLY_MAILTO =
  "mailto:contact@echoflux.ai?subject=witme%20creator%20waitlist&body=Tell%20us%20about%20your%20page%20and%20audience%3A%0A%0A";

export const WitmeCreatorsApplyPage: React.FC<{ echofluxUrl?: string }> = ({ echofluxUrl = "https://echoflux.ai" }) => {
  useWitmeSeo({
    title: "Apply to create | witme.io",
    description:
      "Join the WitMe creator waitlist. We are expanding carefully with early creators who want their own page and experience.",
    path: "/creators/apply",
    imageUrl: WITME_OG_IMAGE_PATH,
  });

  useEffect(() => {
    trackWitmeEvent("page_view", { surface: "creators_apply" });
  }, []);

  const homeHref = witmePublicHref("/");
  const base = echofluxUrl.replace(/\/$/, "");

  return (
    <WitmePublicPageShell>
      <div className={`${WITME_LANDING_SECTION_CLASS} pt-12 pb-20 sm:pt-16 sm:pb-24`}>
        <a href={homeHref} className="inline-flex items-center gap-2 text-sm text-gray-300 transition hover:text-white">
          <span aria-hidden>←</span>
          <span>Back to</span>
          <img src="/witme-wordmark.svg" alt="witme" className="h-7 w-auto sm:h-8" loading="lazy" />
        </a>

        <h1 className="mt-8 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Apply to create on WitMe</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-300 sm:text-lg">
          We&apos;re onboarding creators in phases. Tell us what you want to build — each page on WitMe is meant to feel
          distinct, so we review applications to keep quality and fit high.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a
            href={APPLY_MAILTO}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-200 to-white px-8 py-3.5 text-sm font-semibold text-gray-900 transition hover:from-white hover:to-indigo-100"
            onClick={() => trackWitmeEvent("apply_email_click", { location: "apply_page" })}
          >
            Email the waitlist
          </a>
          <a
            href={base}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-full border border-white/25 bg-white/[0.08] px-8 py-3.5 text-sm font-medium text-white transition hover:bg-white/[0.12]"
            onClick={() => trackWitmeEvent("apply_echoflux_click", { location: "apply_page" })}
          >
            Creator studio (EchoFlux)
          </a>
        </div>

        <p className="mt-10 max-w-xl text-sm text-gray-400">
          Prefer email? Use{" "}
          <a className="underline decoration-white/30 underline-offset-2 hover:text-white" href={APPLY_MAILTO}>
            contact@echoflux.ai
          </a>{" "}
          with the subject line &quot;witme creator waitlist&quot;.
        </p>
      </div>
    </WitmePublicPageShell>
  );
};

export default WitmeCreatorsApplyPage;
