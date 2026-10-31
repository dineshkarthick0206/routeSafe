import { useEffect, useRef, useState } from "react";
import { haversineMeters, nearestVertex, spokenDuration } from "../utils/geo";

// Spoken guidance while live-tracking along the selected route:
// start summary, progress milestones with distance left, off-route warning,
// arrival. (Text-to-speech via the browser's speechSynthesis; no turn-by-turn
// instructions, since the routing service is asked for geometry only.)
export default function useVoiceNavigation({ enabled, position, route, destination, offRoute }) {
  const [supported] = useState(
    () => typeof window !== "undefined" && "speechSynthesis" in window
  );
  const [status, setStatus] = useState("Voice guidance is off");
  const lastMilestoneRef = useRef(-1);
  const startedRef = useRef(false);
  const arrivedRef = useRef(false);
  const offRouteSpokenRef = useRef(false);

  const speak = (text) => {
    if (!supported || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  };

  // Reset when switched off or when a different route is chosen.
  useEffect(() => {
    startedRef.current = false;
    arrivedRef.current = false;
    lastMilestoneRef.current = -1;
    offRouteSpokenRef.current = false;
    if (!enabled) {
      window.speechSynthesis?.cancel();
      setStatus("Voice guidance is off");
    }
  }, [enabled, route]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  useEffect(() => {
    if (!enabled) return;
    if (!supported) {
      setStatus("Voice guidance is not supported in this browser");
      return;
    }
    if (!route?.geometry?.length || !position) {
      setStatus("Waiting for a route and your live location...");
      return;
    }

    if (!startedRef.current) {
      startedRef.current = true;
      setStatus("Guiding you along the selected route");
      speak(
        `Voice guidance started. The route is ${route.distance_km} kilometres, about ${spokenDuration(route.duration_min)}. Follow the highlighted route.`
      );
    }

    const here = [position.lat, position.lon];
    const { index } = nearestVertex(here, route.geometry);
    const progress = route.geometry.length > 1 ? index / (route.geometry.length - 1) : 1;
    const remainingKm = Math.max(0, route.distance_km * (1 - progress));

    const milestone = Math.floor(progress * 4);
    if (milestone > lastMilestoneRef.current && milestone > 0 && milestone < 4) {
      lastMilestoneRef.current = milestone;
      const where = ["", "one quarter of the way", "halfway", "three quarters of the way"][milestone];
      speak(`You are ${where} there. About ${Math.round(remainingKm)} kilometres remaining.`);
    }

    if (offRoute && !offRouteSpokenRef.current) {
      offRouteSpokenRef.current = true;
      speak("You seem to be off the recommended route. You can recalculate from here.");
    } else if (!offRoute) {
      offRouteSpokenRef.current = false;
    }

    if (destination && !arrivedRef.current) {
      if (haversineMeters(here, [destination.lat, destination.lon]) <= 60) {
        arrivedRef.current = true;
        setStatus("You have arrived");
        speak("You have arrived at your destination.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, supported, position, route, destination, offRoute]);

  return { supported, status, speak };
}
