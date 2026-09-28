import appBaseStylesheet from "./styles.css?url";

export { appBaseStylesheet };

// Vite serves this URL directly in development. Keeping it as a development
// URL instead of a static ?url import prevents the full aggregate sheet from
// being emitted or referenced by the production application graph.
export const fullAppStylesheet = `${import.meta.env.BASE_URL}src/full-app.css`;
