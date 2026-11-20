import { Compare } from "@/components/compare/Compare";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { Ticker } from "@/components/launch/Ticker";
import { Timeline } from "@/components/launch/Timeline";
import { WaitCounters } from "@/components/launch/WaitCounters";
import { Signals } from "@/components/signals/Signals";
import { loadPageData } from "@/lib/data/load";

export default async function Home() {
  const data = await loadPageData();
  return (
    <>
      <Header />
      <main>
        <div id="launch">
          <Hero />
          <Ticker twitch={data.twitch} trailers={data.trailers} languages={data.wikipedia} />
          <WaitCounters />
          <Timeline />
        </div>
        <Signals data={data} />
        <Compare games={data.steam} />
      </main>
      <Footer />
    </>
  );
}
