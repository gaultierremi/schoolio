"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// 'dismissed' = popup appeared but user closed it without choosing
//   (navigator.permissions.query still returns 'prompt')
// 'denied'    = user explicitly blocked mic in browser settings
//   (navigator.permissions.query returns 'denied')
// 'unsupported' = navigator.permissions absent (iOS Safari 16.0–16.3, some WebViews)
//   → fallback: state is driven solely by SpeechRecognition onerror signals
export type MicPermissionState =
  | "prompt"
  | "granted"
  | "denied"
  | "dismissed"
  | "unsupported";

export type UseMicPermissionReturn = {
  state: MicPermissionState;
  // Re-query after the user manually resets permissions in browser settings.
  refresh: () => void;
  // Called by useMicCapture when SpeechRecognition fires onerror: "not-allowed".
  // Re-queries to distinguish 'dismissed' (query → prompt) from 'denied' (query → denied).
  reportNotAllowed: () => void;
};

function browserStateToMic(s: PermissionState): MicPermissionState {
  if (s === "granted") return "granted";
  if (s === "denied") return "denied";
  return "prompt";
}

export function useMicPermission(): UseMicPermissionReturn {
  const [state, setState] = useState<MicPermissionState>("prompt");

  useEffect(() => {
    if (typeof window === "undefined") return;

    // iOS Safari 16.0–16.3 and some legacy WebViews lack navigator.permissions.
    // Fallback: state stays 'prompt'; onerror from SpeechRecognition drives updates
    // via reportNotAllowed() below.
    if (!navigator.permissions) {
      setState("unsupported");
      return;
    }

    let cancelled = false;
    let permStatus: PermissionStatus | null = null;
    let changeHandler: (() => void) | null = null;

    // POINT 2: try/catch in case some browsers throw synchronously on query
    // (documented for a subset of iOS Safari builds).
    void navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((result) => {
        if (cancelled) return;
        permStatus = result;
        setState(browserStateToMic(result.state));

        // POINT 3: addEventListener/removeEventListener, never onchange = ...
        // (onchange assignment is not idempotent and breaks in React Strict Mode).
        changeHandler = () => setState(browserStateToMic(result.state));
        result.addEventListener("change", changeHandler);
      })
      .catch(() => {
        // iOS Safari async throw path — degrade gracefully.
        if (!cancelled) setState("unsupported");
      });

    return () => {
      cancelled = true;
      if (permStatus && changeHandler) {
        permStatus.removeEventListener("change", changeHandler);
      }
    };
  }, []);

  const refresh = useCallback(() => {
    if (typeof window === "undefined" || !navigator.permissions) return;
    void navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((result) => {
        // 'dismissed' can transition back to 'prompt' here after a browser-level reset.
        setState(browserStateToMic(result.state));
      })
      .catch(() => undefined);
  }, []);

  // POINT 4 / POINT 5: called from SpeechRecognition onerror="not-allowed".
  // Re-query to distinguish:
  //   query → 'denied'  = user explicitly blocked  → 'denied'
  //   query → 'prompt'  = user dismissed the popup  → 'dismissed'
  //   permissions API absent / throws → conservative fallback to 'denied'
  const reportNotAllowed = useCallback(() => {
    if (typeof window === "undefined" || !navigator.permissions) {
      setState("denied");
      return;
    }
    void navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((result) => {
        if (result.state === "prompt") {
          setState("dismissed");
        } else {
          setState(browserStateToMic(result.state));
        }
      })
      .catch(() => setState("denied"));
  }, []);

  return { state, refresh, reportNotAllowed };
}
