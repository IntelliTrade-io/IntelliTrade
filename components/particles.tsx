"use client";

import { useEffect } from "react";

declare global {
    interface Window {
      particlesJS: (
        tagId: string,
        params: object,
        callback?: () => void
      ) => void;
    }
  }



export default function Particles() {

    const particleJsonObject : object = {
        particles: {
          number: {
            value: 80,
            density: { enable: true, value_area: 800 },
          },
          color: { value: "#ffffff" },
          shape: {
            type: "circle",
            stroke: { width: 0, color: "#000000" },
            polygon: { nb_sides: 5 },
          },
          opacity: { value: 0.5 },
          size: { value: 3, random: true },
          line_linked: {
            enable: true,
            distance: 150,
            color: "#ffffff",
            opacity: 0.4,
            width: 1,
          },
          move: {
            enable: true,
            speed: 6,
            direction: "none",
            out_mode: "out",
          },
        },
        interactivity: {
          detect_on: "canvas",
          events: {
            onhover: { enable: true, mode: "repulse" },
            onclick: { enable: true, mode: "push" },
          },
          modes: {
            repulse: { distance: 200, duration: 0.4 },
            push: { particles_nb: 4 },
          },
        },
        retina_detect: true,
    }


  useEffect(() => {
    // Dynamically load the script into the browser
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/particles.js/2.0.0/particles.min.js";

    script.async = true;
    document.head.appendChild(script);
    

    script.onload = () => {
      if (typeof window !== "undefined" && window.particlesJS) {
        window.particlesJS("particles-js", particleJsonObject);
      } else {
        console.error("particlesJS not available on window");
      }
    };

    // Cleanup script tag on unmount
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div
      id="particles-js"
      className="absolute top-0 left-0 w-full h-full -z-10"
    />
  );
}
