import { getCurrentUser, getCurrentMember } from './authorization';

declare global {
  interface Window {
    posthog?: {
      capture: (eventName: string, properties?: Record<string, any>) => void;
      identify: (distinctId: string, properties?: Record<string, any>) => void;
      reset: () => void;
      register: (properties: Record<string, any>) => void;
    };
  }
}

const getPosthog = () => {
  if (typeof window === 'undefined') return undefined;
  return window.posthog;
};

export function captureEvent(eventName: string, properties?: Record<string, any>) {
  const posthog = getPosthog();
  if (!posthog?.capture) return;
  try {
    posthog.capture(eventName, properties);
  } catch (error) {
    console.error('PostHog capture failed:', error);
  }
}

export function identifyUser(distinctId: string, properties?: Record<string, any>) {
  const posthog = getPosthog();
  if (!posthog?.identify) return;
  try {
    posthog.identify(distinctId, properties);
  } catch (error) {
    console.error('PostHog identify failed:', error);
  }
}

export function trackPageview(path = window.location.pathname, title = document.title, search = window.location.search) {
  captureEvent('$pageview', { path, title, search });
}

export function identifyCurrentUser() {
  const user = getCurrentUser();
  if (user) {
    identifyUser(user.id, {
      username: user.username,
      name: user.name,
      email: user.email || undefined,
      role: user.role,
      memberId: user.memberId || undefined,
    });
    return;
  }

  const member = getCurrentMember();
  if (member) {
    identifyUser(member.id, {
      name: member.name,
      phoneNumber: member.phoneNumber || undefined,
    });
  }
}
