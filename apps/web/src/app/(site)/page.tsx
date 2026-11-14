import { Cta, PlayChapter, Rules } from "@/components/landing/closing";
import { Hero } from "@/components/landing/hero";
import { Noise } from "@/components/landing/noise";
import { ParakhChapter } from "@/components/landing/parakh-chapter";
import { RoomChapter } from "@/components/landing/room-chapter";
import { Split } from "@/components/landing/split";

export default function Home() {
  return (
    <>
      <Hero />
      <Noise />
      <Split />
      <ParakhChapter />
      <RoomChapter />
      <PlayChapter />
      <Rules />
      <Cta />
    </>
  );
}
