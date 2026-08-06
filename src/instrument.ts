import * as Sentry from "@sentry/react";
import { reactRouterV6BrowserTracingIntegration } from "@sentry/react";
import React from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";

const SENTRY_DSN =
  import.meta.env.VITE_SENTRY_DSN ??
  "https://3b97a7ba36c7dd7b2ebcf47d2d2d40a1@o4511863266738176.ingest.de.sentry.io/4511863282073680";

const APP_ORIGIN = import.meta.env.VITE_APP_URL ?? "https://malangawelfare.co.ke";

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION,

    dataCollection: {
      // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
      // https://docs.sentry.io/platforms/javascript/guides/react/configuration/options/#dataCollection
      // userInfo: false,
      // httpBodies: [],
    },

    integrations: [
      reactRouterV6BrowserTracingIntegration({
        useEffect: React.useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Tracing
    tracesSampleRate: 1.0, // lower to 0.1–0.2 in production
    tracePropagationTargets: ["localhost", APP_ORIGIN],

    // Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Enable logs to be sent to Sentry
    enableLogs: true,
  });
}
