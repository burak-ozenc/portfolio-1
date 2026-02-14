/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_MOSHI_ENDPOINT: string;
    readonly VITE_MOSHI_WS: string;
    readonly VITE_AICOUSTICS_KEY: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
