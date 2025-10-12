import LotSizeCalculator from "@/components/lot-size-calculator-2";
import ParticlesBackground from "@/components/particles";

export default function Page() {
  return (
    <main className="relative min-h-screen flex flex-col items-center">
      {/* Particles background behind everything */}
      <ParticlesBackground />

      {/* Lot Size Calculator content */}
      <div className="flex-1 w-full flex flex-col justify-center items-center">
        <LotSizeCalculator />
      </div>
    </main>
  );
}
