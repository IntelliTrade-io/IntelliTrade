"use client";

import { useState, useEffect } from "react";

declare global {
  interface Window {
    grecaptcha: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);



 const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsSubmitting(true);
  setStatus("idle");

  try {
    const formData = new URLSearchParams({
      EMAIL: email,
      email_address_check: "", // Honeypot field
      locale: "en",
    });

    const response = await fetch(
      "https://e2c25aa6.sibforms.com/serve/MUIFAFTQ6bjuaYhsWDX31Yy-k_CEfsOgfcw4rc8qrLzS12hZfUohDXNCkwvTRPQSTF1Dgn4lYj6PrKKiXkU-JWA8auyfKxhIzIqYVeOFWIqnut_Y_M0xlmLJmB51729t9dCOnJE1sAZUVKusfKdtEB4rg6bWHssMTGNTOj-iy5KpnwmWIPBl5xJvo2tzjWT3Sy2jEylFBXNsLpxh",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      }
    );

    if (!response.ok) throw new Error("Form submission failed");

    setStatus("success");
    setEmail("");
  } catch (error) {
    console.error("Form submission error:", error);
    setStatus("error");
  } finally {
    setIsSubmitting(false);
  }
};


  return (
    <div className="w-full max-w-[540px] mx-auto text-center overflow-hidden">
      <div className="border border-[#C0CCD9] rounded-[10px] p-8 bg-transparent">
        {/* Error Message */}
        {status === "error" && (
          <div className="mb-6 p-4 bg-[#ffeded] border border-[#ff4949] rounded-[3px] text-[#661d1d] text-left">
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 512 512" className="w-6 h-6 flex-shrink-0" fill="currentColor">
                <path d="M256 40c118.621 0 216 96.075 216 216 0 119.291-96.61 216-216 216-119.244 0-216-96.562-216-216 0-119.203 96.602-216 216-216m0-32C119.043 8 8 119.083 8 256c0 136.997 111.043 248 248 248s248-111.003 248-248C504 119.083 392.957 8 256 8zm-11.49 120h22.979c6.823 0 12.274 5.682 11.99 12.5l-7 168c-.268 6.428-5.556 11.5-11.99 11.5h-8.979c-6.433 0-11.722-5.073-11.99-11.5l-7-168c-.283-6.818 5.167-12.5 11.99-12.5zM256 340c-15.464 0-28 12.536-28 28s12.536 28 28 28 28-12.536 28-28-12.536-28-28-28z" />
              </svg>
              <span>Your subscription could not be saved. Please try again.</span>
            </div>
          </div>
        )}

        {/* Success Message */}
        {status === "success" && (
          <div className="mb-6 p-4 bg-[#e7faf0] border border-[#13ce66] rounded-[3px] text-[#085229] text-left">
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 512 512" className="w-6 h-6 flex-shrink-0" fill="currentColor">
                <path d="M256 8C119.033 8 8 119.033 8 256s111.033 248 248 248 248-111.033 248-248S392.967 8 256 8zm0 464c-118.664 0-216-96.055-216-216 0-118.663 96.055-216 216-216 118.664 0 216 96.055 216 216 0 118.663-96.055 216-216 216zm141.63-274.961L217.15 376.071c-4.705 4.667-12.303 4.637-16.97-.068l-85.878-86.572c-4.667-4.705-4.637-12.303.068-16.97l8.52-8.451c4.705-4.667 12.303-4.637 16.97.068l68.976 69.533 163.441-162.13c4.705-4.667 12.303-4.637 16.97.068l8.451 8.52c4.668 4.705 4.637 12.303-.068 16.97z" />
              </svg>
              <span>Your subscription has been successful. Happy Trading!</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="flex">
            <div className="flex flex-col">
              {/* Title */}
              <div className="py-2">
                <span className="text-[1.5rem] font-bold font-sans text-[#fafafa] text-center">
                  Subscribe to our newsletter!
                </span>
              </div>

              {/* Description */}
              <div className="py-2">
                <p className="text-[1rem] text-base font-sans text-[#f6f7f9] text-center">
                  Subscribe to receive market updates daily.
                </p>
              </div>
            </div>

            {/* Email Input */}
            <div className="py-2 mt-4 flex justify-center flex-col">
              <input
                type="email"
                id="EMAIL"
                name="EMAIL"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="EMAIL"
                autoComplete="off"
                required
                disabled={isSubmitting}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-black"
              />
              <p className="text-xs text-[#f9f9fa] text-left mt-2">
                Provide your email address to subscribe. For e.g abc@xyz.com
              </p>
            </div>
          </div>

          {/* Hidden honeypot field */}
          <input type="text" name="email_address_check" value="" className="hidden" tabIndex={-1} autoComplete="off" />

          {/* Submit Button */}
          <div className="py-2 mt-4 flex-none">
            <div className="body-row-5 justify-center relative">
              <button
                type="submit"
                className="real-button"
                disabled={isSubmitting}
              >
                {isSubmitting && (
                  <svg
                    className="animate-spin h-5 w-5"
                    viewBox="0 0 512 512"
                    fill="currentColor"
                  >
                    <path d="M460.116 373.846l-20.823-12.022c-5.541-3.199-7.54-10.159-4.663-15.874 30.137-59.886 28.343-131.652-5.386-189.946-33.641-58.394-94.896-95.833-161.827-99.676C261.028 55.961 256 50.751 256 44.352V20.309c0-6.904 5.808-12.337 12.703-11.982 83.556 4.306 160.163 50.864 202.11 123.677 42.063 72.696 44.079 162.316 6.031 236.832-3.14 6.148-10.75 8.461-16.728 5.01z" />
                  </svg>
                )}
                {isSubmitting ? "SUBSCRIBING..." : "SUBSCRIBE"}
              </button>

              {/* Keep all your original glow/spin divs */}
              <div className="button-backdrop"></div>
              <div className="button-container">
                <div className="spin spin-blur"></div>
                <div className="spin spin-intense"></div>
                <div className="button-backdrop"></div>
                <div className="button-border">
                  <div className="spin spin-inside"></div>
                  <div className="button">Subscribe</div>
                </div>
              </div>

              {/* SVG Filters (original) */}
              <svg className="svg-style">
                <filter width="300%" x="-100%" height="300%" y="-100%" id="unopaq">
                  <feColorMatrix
                    values="1 0 0 0 0 
                            0 1 0 0 0 
                            0 0 1 0 0 
                            0 0 0 9 0"
                  ></feColorMatrix>
                </filter>
                <filter width="300%" x="-100%" height="300%" y="-100%" id="unopaq2">
                  <feColorMatrix
                    values="1 0 0 0 0 
                            0 1 0 0 0 
                            0 0 1 0 0 
                            0 0 0 3 0"
                  ></feColorMatrix>
                </filter>
                <filter width="300%" x="-100%" height="300%" y="-100%" id="unopaq3">
                  <feColorMatrix
                    values="1 0 0 0.2 0 
                            0 1 0 0.2 0 
                            0 0 1 0.2 0 
                            0 0 0 2 0"
                  ></feColorMatrix>
                </filter>
              </svg>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
