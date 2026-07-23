export default function BackgroundParticles() {
  return (
    <div aria-hidden className="background-particles">
      <div className="background-orb background-orb-brand-light" />
      <div className="background-orb background-orb-brand" />
      <div className="background-orb background-orb-soft" />

      <svg className="background-web" viewBox="0 0 720 640" fill="none">
        <g stroke="rgba(208, 221, 255, 0.15)" strokeWidth="1">
          <path d="M28 584L138 500L274 560L354 452L518 508L682 372" />
          <path d="M68 640L152 534L254 594L360 516L474 564L612 476" />
          <path d="M112 460L208 386L300 430L402 332L536 372L646 282" />
          <path d="M24 520L112 460L208 386L248 270L384 204L534 232L652 146" />
          <path d="M248 270L286 136L414 92L546 132L690 88" />
        </g>
        <g fill="rgba(236, 242, 255, 0.28)">
          <circle cx="28" cy="584" r="4" />
          <circle cx="138" cy="500" r="4" />
          <circle cx="274" cy="560" r="4" />
          <circle cx="354" cy="452" r="4" />
          <circle cx="518" cy="508" r="4" />
          <circle cx="682" cy="372" r="4" />
          <circle cx="112" cy="460" r="4" />
          <circle cx="208" cy="386" r="4" />
          <circle cx="248" cy="270" r="4" />
          <circle cx="384" cy="204" r="4" />
          <circle cx="536" cy="232" r="4" />
          <circle cx="646" cy="282" r="4" />
          <circle cx="286" cy="136" r="4" />
          <circle cx="414" cy="92" r="4" />
          <circle cx="546" cy="132" r="4" />
        </g>
      </svg>
    </div>
  );
}
