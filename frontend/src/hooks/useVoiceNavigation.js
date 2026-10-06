import { useEffect, useRef, useState } from "react";
import { haversineMeters } from "../utils/geo";

export default function useVoiceNavigation({ enabled, position, route, destination }) {
  const [supported] = useState(() =>
    typeof window !== "undefined" && "speechSynthesis" in window
  );
  const [status, setStatus] = useState("Voice navigation is off");
  const lastProgressRef = useRef(-1);
  const startedRef = useRef(false);
  const arrivedRef = useRef(false);

  const speak = (text) => {
    if (!supported || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (!enabled) {
      window.speechSynthesis?.cancel();
      startedRef.current = false;
      arrivedRef.current = false;
      lastProgressRef.current = -1;
      setStatus("Voice navigation is off");
      return;
    }

    if (!supported) {
      setStatus("Voice navigation is not supported in this browser");
      return;
    }

    if (!route?.geometry?.length || !position) {
      setStatus("Waiting for route and live location...");
      return;
    }

    if (!startedRef.current) {
      startedRef.current = true;
      setStatus("Voice navigation started");
      speak("Voice navigation started. Follow the highlighted safe route.");
    }

    const geometry = route.geometry;
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    geometry.forEach((point, index) => {
      const distance = haversineMeters(
        [position.lat, position.lon],
        point
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    const progress = geometry.length > 1
      ? nearestIndex / (geometry.length - 1)
      : 1;

    const milestone = Math.floor(progress * 4);
    if (milestone > lastProgressRef.current && milestone < 4) {
      lastProgressRef.current = milestone;
      if (milestone === 1) speak("You are about one quarter of the way to your destination.");
      if (milestone === 2) speak("You are halfway to your destination.");
      if (milestone === 3) speak("You are about three quarters of the way to your destination.");
    }

    if (destination && !arrivedRef.current) {
      const distanceToDestination = haversineMeters(
        [position.lat, position.lon],
        destination
      );
      if (distanceToDestination <= 60) {
        arrivedRef.current = true;
        setStatus("You have arrived");
        speak("You have arrived at your destination.");
      }
    }
  }, [enabled, supported, position, route, destination]);

  return { supported, status, speak };
}
