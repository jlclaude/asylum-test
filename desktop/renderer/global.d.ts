export {};

declare global {
  interface Window {
    asylumDesktop: {
      version(): Promise<string>;
      layout: { update(layout: DesktopLayout): Promise<void> };
      host: { retry(): Promise<void> };
      facebook: {
        back(): Promise<void>;
        forward(): Promise<void>;
        reload(): Promise<void>;
        retry(): Promise<void>;
        openGroup(): Promise<void>;
        openExternal(): Promise<void>;
        clearSession(): Promise<void>;
      };
      integration: {
        copyGameLink(): Promise<boolean>;
        copyFacebookPost(): Promise<boolean>;
      };
      onStatus(callback: (status: DesktopStatus) => void): () => void;
    };
  }
  interface DesktopLayout {
    host: { x: number; y: number; width: number; height: number };
    facebook: { x: number; y: number; width: number; height: number } | null;
  }
  interface DesktopStatus {
    target: "host" | "facebook";
    state: "loading" | "ready" | "failed" | "crashed";
  }
}
