import { Compare } from "@/components/compare/Compare";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { Ticker } from "@/components/launch/Ticker";
import { Timeline } from "@/components/launch/Timeline";
import { WaitCounters } from "@/components/launch/WaitCounters";
import { LiveSignals } from "@/components/live/LiveSignals";
import { Signals } from "@/components/signals/Signals";
import { loadPageData } from "@/lib/data/load";

export default async function Home() {
  const { data, url } = await loadPageData();
  return (
    <LiveSignals initial={data} url={url}>
      <Header />
      <main>
        <div id="launch">
          <Hero />
          <Ticker />
          <WaitCounters />
          <Timeline />
        </div>
        <Signals wikipedia={data.wikipedia} />
        <Compare />
      </main>
      <Footer />
    </LiveSignals>
  );
}
