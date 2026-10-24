// Load local environment files exactly the way Next.js does (values are never printed).
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
