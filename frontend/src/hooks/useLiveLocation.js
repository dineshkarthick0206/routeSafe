import { useCallback, useEffect, useRef, useState } from "react";

export default function useLiveLocation() {
  const [position, setPosition] = useState(null); // { lat, lon, accuracy, heading }
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState(null);
  const watchIdRef = useRef(null);

  const getCurrentPositionOnce = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const err = "Geolocation is not supported by this browser.";
        setError(err);
        reject(new Error(err));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            heading: pos.coords.heading,
          };
          setPosition(p);
          setError(null);
          resolve(p);
        },
        (err) => {
          setError(err.message || "Could not get your location.");
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser.");
      return;
    }
    if (watchIdRef.current !== null) return; // already tracking
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
        });
        setError(null);
      },
      (err) => setError(err.message || "Live location tracking failed."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    setTracking(true);
  }, []);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return { position, tracking, error, getCurrentPositionOnce, startTracking, stopTracking };
}
