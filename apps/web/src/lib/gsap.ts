"use client";
/** Single place where GSAP plugins are registered (client only). */
import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase, useGSAP);

CustomEase.create("molten", "0.65,0,0.15,1");
CustomEase.create("stamp", "M0,0 C0.3,0 0.4,1.18 0.62,1.08 0.78,1 0.86,1 1,1");

export const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export { gsap, ScrollTrigger, SplitText, useGSAP };
