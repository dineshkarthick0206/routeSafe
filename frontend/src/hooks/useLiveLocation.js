import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

// Runs as a native Android/iOS app (Capacitor) vs. a regular website.
// Native builds use @capacitor/geolocation, which talks to the OS location
// APIs directly and handles the native permission prompt correctly. Web
// builds fall back to the standard browser Geolocation API, so the exact
// same component code works in both the deployed website and the app.
const isNative = Capacitor.isNativePlatform();

export default function useLiveLocation() {
  const [position, setPosition] = useState(null); // { lat, lon, accuracy, heading }
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState(null);
  const watchIdRef = useRef(null);

  const toPosition = (pos) => ({
    lat: pos.coords.latitude,
    lon: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    heading: pos.coords.heading,
  });

  const getCurrentPositionOnce = useCallback(async () => {
    try {
      if (isNative) {
        const perm = await Geolocation.requestPermissions();
        if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
          throw new Error("Location permission denied.");
        }
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
        const p = toPosition(pos);
        setPosition(p);
        setError(null);
        return p;
      }

      if (!navigator.geolocation) {
        throw new Error("Geolocation is not supported by this browser.");
      }
      return await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const p = toPosition(pos);
            setPosition(p);
            setError(null);
            resolve(p);
          },
          (err) => reject(new Error(err.message || "Could not get your location.")),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      });
    } catch (err) {
      setError(err.message || "Could not get your location.");
      throw err;
    }
  }, []);

  const startTracking = useCallback(async () => {
    if (watchIdRef.current !== null) return; // already tracking

    if (isNative) {
      try {
        const perm = await Geolocation.requestPermissions();
        if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
          setError("Location permission denied.");
          return;
        }
        watchIdRef.current = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 15000 },
          (pos, err) => {
            if (err) {
              setError(err.message || "Live location tracking failed.");
              return;
            }
            if (pos) {
              setPosition(toPosition(pos));
              setError(null);
            }
          }
        );
        setTracking(true);
      } catch (err) {
        setError(err.message || "Live location tracking failed.");
      }
      return;
    }

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser.");
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition(toPosition(pos));
        setError(null);
      },
      (err) => setError(err.message || "Live location tracking failed."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    setTracking(true);
  }, []);

  const stopTracking = useCallback(async () => {
    if (watchIdRef.current !== null) {
      if (isNative) {
        await Geolocation.clearWatch({ id: watchIdRef.current });
      } else {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
    }
    setTracking(false);
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        if (isNative) {
          Geolocation.clearWatch({ id: watchIdRef.current });
        } else {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
      }
    };
  }, []);

  return { position, tracking, error, getCurrentPositionOnce, startTracking, stopTracking };
}
