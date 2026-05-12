/**
 * Video provider service interface.
 * Replace the default implementation with your app's real disconnect/reconnect logic.
 */

export interface VideoProviderService {
  disconnect(): Promise<void>;
  reconnect(): Promise<void>;
}

/**
 * Default implementation: override in your app with actual API calls.
 * Example: call Supabase, Zoom/Meet SDK, or your backend endpoints.
 */
export const defaultVideoProviderService: VideoProviderService = {
  async disconnect() {
    // TODO: Wire to your app's disconnect (e.g. leave call, revoke session)
    await new Promise((resolve) => setTimeout(resolve, 300));
  },
  async reconnect() {
    // TODO: Wire to your app's reconnect (e.g. re-init provider, re-join)
    await new Promise((resolve) => setTimeout(resolve, 500));
  },
};

let serviceInstance: VideoProviderService = defaultVideoProviderService;

export function setVideoProviderService(service: VideoProviderService): void {
  serviceInstance = service;
}

export function getVideoProviderService(): VideoProviderService {
  return serviceInstance;
}
