import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { AI, GoogleAIBackend, getAI } from 'firebase/ai';
import {
  AppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  initializeAppCheck
} from 'firebase/app-check';

export interface FirebaseConfigSummary {
  configured: boolean;
  appCheckEnabled: boolean;
  cloudModel: string;
  projectId: string | null;
  initError: string | null;
}

interface AppCheckDebugScope {
  FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
}

const DEFAULT_CLOUD_MODEL = 'gemini-2.5-flash';

function readEnv(key: keyof ImportMetaEnv): string {
  const value = import.meta.env[key];
  return typeof value === 'string' ? value.trim() : '';
}

function isPlaceholderValue(value: string): boolean {
  return (
    value.length === 0 ||
    value.startsWith('your-') ||
    value.includes('000000000000')
  );
}

export function isFirebaseConfigured(): boolean {
  const apiKey = readEnv('VITE_FIREBASE_API_KEY');
  const projectId = readEnv('VITE_FIREBASE_PROJECT_ID');
  const appId = readEnv('VITE_FIREBASE_APP_ID');

  return (
    !isPlaceholderValue(apiKey) &&
    !isPlaceholderValue(projectId) &&
    !isPlaceholderValue(appId)
  );
}

export function getCloudModelName(): string {
  const configuredModel = readEnv('VITE_CLOUD_GEMINI_MODEL');
  return configuredModel.length > 0 ? configuredModel : DEFAULT_CLOUD_MODEL;
}

let cachedApp: FirebaseApp | null = null;
let cachedAppCheck: AppCheck | null = null;
let cachedAi: AI | null = null;
let lastInitError: string | null = null;

function configureAppCheckDebugToken(): void {
  const debugToken = readEnv('VITE_FIREBASE_APPCHECK_DEBUG_TOKEN');
  if (!debugToken || typeof self === 'undefined') {
    return;
  }

  const debugScope = self as unknown as AppCheckDebugScope;
  if (debugToken === 'true') {
    debugScope.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  } else if (debugToken !== 'false') {
    debugScope.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }
}

export function getFirebaseApp(): FirebaseApp | null {
  if (cachedApp) {
    return cachedApp;
  }

  if (!isFirebaseConfigured()) {
    lastInitError =
      'Firebase environment variables are not configured. Cloud inference is disabled until .env is populated.';
    return null;
  }

  try {
    cachedApp =
      getApps().length > 0
        ? getApp()
        : initializeApp({
            apiKey: readEnv('VITE_FIREBASE_API_KEY'),
            authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN'),
            projectId: readEnv('VITE_FIREBASE_PROJECT_ID'),
            storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET'),
            messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
            appId: readEnv('VITE_FIREBASE_APP_ID')
          });

    const siteKey = readEnv('VITE_FIREBASE_RECAPTCHA_SITE_KEY');
    if (!cachedAppCheck && !isPlaceholderValue(siteKey) && typeof window !== 'undefined') {
      configureAppCheckDebugToken();
      const providerMode = readEnv('VITE_FIREBASE_APPCHECK_PROVIDER').toLowerCase();
      const provider =
        providerMode === 'v3'
          ? new ReCaptchaV3Provider(siteKey)
          : new ReCaptchaEnterpriseProvider(siteKey);

      cachedAppCheck = initializeAppCheck(cachedApp, {
        provider,
        isTokenAutoRefreshEnabled: true
      });
    }

    lastInitError = null;
    return cachedApp;
  } catch (error) {
    lastInitError = error instanceof Error ? error.message : String(error);
    return null;
  }
}

export function getFirebaseAI(): AI | null {
  if (cachedAi) {
    return cachedAi;
  }

  const app = getFirebaseApp();
  if (!app) {
    return null;
  }

  try {
    cachedAi = getAI(app, { backend: new GoogleAIBackend() });
    return cachedAi;
  } catch (error) {
    lastInitError = error instanceof Error ? error.message : String(error);
    return null;
  }
}

export function getFirebaseInitStatus(): FirebaseConfigSummary {
  const projectId = readEnv('VITE_FIREBASE_PROJECT_ID');
  return {
    configured: isFirebaseConfigured(),
    appCheckEnabled: cachedAppCheck !== null,
    cloudModel: getCloudModelName(),
    projectId: isPlaceholderValue(projectId) ? null : projectId,
    initError: lastInitError
  };
}
