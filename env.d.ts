/// <reference types="vite/client" />

declare module "@manifest" {
  export interface ManifestState {
    Name: string;
    Image?: string;
    TitleAlignment?: string;
    Title?: string;
  }

  export interface ManifestAction {
    UUID: string;
    Name: string;
    States: ManifestState[];
    Controllers?: string[];
  }

  export interface Manifest {
    Actions: ManifestAction[];
    Version: string;
    Name: string;
    Description: string;
    Author: string;
    Category: string;
    Icon: string;
    URL: string;
  }

  const manifest: Manifest;
  export default manifest;
}

declare module "snapsvg-cjs" {
  const Snap: unknown;
  export default Snap;
}

interface Window {
  connectElgatoStreamDeckSocket: (
    port: string,
    uuid: string,
    registerEvent: string,
    info: string,
    actionInfo?: string
  ) => void;
}
