import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
// import { ThemeSwitcher } from "@/components/theme-switcher";

import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { LotSizeCalculator } from "@/components/lot-size-calculator";
import Image from 'next/image';
import IntelliTradeLogo from '@/assets/images/intelliTrade.png';
import ParticlesBackground from "@/components/particles";



export default function Home() {
  return (
    
    <main className="relative min-h-screen flex flex-col items-center">
      <ParticlesBackground />
      <div className="flex-1 w-full flex flex-col justify-content items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16 z-[3]">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
            <Link href={"/"}><Image
      src={IntelliTradeLogo}
      width={500}
      height={500}
      className="nav-header-logo"
      alt="IntelliTrade"
    /></Link>
              
            </div>
            {!hasEnvVars ? <EnvVarWarning /> : <AuthButton />}
          </div>
        </nav>
        <div className="lot-size-calculator-container">
          
          <LotSizeCalculator/>
          
        </div>
        </div>
        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-16">
          <p>
            Powered by {"IntelliTrade"}
          </p>
          {/* <ThemeSwitcher /> */}
        </footer>
    </main>
  );
}
