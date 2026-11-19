import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <div id="launch">
          <Hero />
          {/* Ticker, WaitCounters, Timeline and the CTAs come next (design/PROMPT.md stage 2). */}
        </div>

        {/* Placeholders so the header tabs and scroll-spy work; built in the next stages. */}
        <section id="signals" aria-label="Signals" className="min-h-[80vh] bg-band py-24" />
        <section id="compare" aria-label="Compare" className="min-h-[80vh]" />
      </main>
      <Footer />
    </>
  );
}
