import { createVeoLMSWeb } from "@veolms/web-core";

const customRoutesFile = process.env["VEO_ROUTES_FILE"];

export default customRoutesFile
  ? (await import(/* @vite-ignore */ customRoutesFile)).default
  : createVeoLMSWeb();
