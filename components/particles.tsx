/* eslint-disable @typescript-eslint/no-namespace */
"use client";

import { useEffect } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "web-particles": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        options?: string;
      };
    }
  }
}

export default function Particles() {
  const tsParticlesConfig = {
    fps_limit: 60,
    interactivity: {
      detectsOn: "canvas",
      events: {
        onClick: { enable: true, mode: "push" },
        onHover: { enable: true, mode: "repulse" },
        resize: true,
      },
      modes: {
        push: { particles_nb: 4 },
        repulse: { distance: 200, duration: 0.4 },
      },
    },
    particles: {
      color: { value: "#ffffff" },
      links: {
        color: "#ffffff",
        distance: 150,
        enable: true,
        opacity: 0.4,
        width: 1,
      },
      move: {
        bounce: false,
        direction: "none",
        enable: true,
        outMode: "out",
        random: false,
        speed: 5,
        straight: false,
      },
      number: {
        density: { enable: true, area: 800 },
        value: 80,
      },
      opacity: { value: 0.5 },
      shape: { type: "circle" },
      size: { random: true, value: 3 },
    },
    detectRetina: true,
  };

  useEffect(() => {
    const scripts = [
      "https://cdn.jsdelivr.net/npm/tsparticles@1.28.0/dist/tsparticles.min.js",
      "https://cdn.jsdelivr.net/npm/@webcomponents/webcomponentsjs@2.5.0/custom-elements-es5-adapter.js",
      "https://cdn.jsdelivr.net/npm/@webcomponents/webcomponentsjs@2.5.0/webcomponents-loader.js",
      "https://cdn.jsdelivr.net/npm/web-particles@1.1.0/dist/web-particles.min.js",
    ];

    const loadedScripts: HTMLScriptElement[] = [];

    scripts.forEach((src) => {
      // Check if script is already loaded
      if (!document.querySelector(`script[src="${src}"]`)) {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.defer = true;
        
        // Set type="module" for the web-particles script
        if (src.includes("web-particles")) {
          script.type = "module";
        }
        
        document.head.appendChild(script);
        loadedScripts.push(script);
      }
    });

    // Cleanup function to remove scripts on unmount
    return () => {
      loadedScripts.forEach((script) => {
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      });
    };
  }, []);

  return (
    <web-particles
      id="tsparticles"
      options={JSON.stringify(tsParticlesConfig)}
      className="fixed top-0 left-0 w-full h-full"
      style={{
        backgroundColor: "black",
        backgroundImage: 'url("")',
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        backgroundPosition: "50% 50%",
        zIndex: 0,
        pointerEvents: "auto",
      }}
    />
  );
}