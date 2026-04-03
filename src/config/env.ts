import dotenv from "dotenv";
dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  port: parseInt(optional("PORT", "5000")),
  nodeEnv: optional("NODE_ENV", "development"),
  isProd: process.env["NODE_ENV"] === "production",

  databaseUrl: required("DATABASE_URL"),

  jwt: {
    accessSecret: required("JWT_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    accessExpiresIn: optional("JWT_ACCESS_EXPIRES_IN", "15m"),
    refreshExpiresIn: optional("JWT_REFRESH_EXPIRES_IN", "7d"),
  },
  qf: {
    clientId: required("QF_CLIENT_ID"),
    clientSecret: required("QF_CLIENT_SECRET"),
    redirectUri: required("QF_REDIRECT_URI"),
    baseUrl: required("QF_BASE_URL"),
  },
};
