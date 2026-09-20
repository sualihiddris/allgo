import {
  defineRailway,
  github,
  mysql,
  project,
  redis,
  service,
} from "railway/iac";

export default defineRailway((ctx) => {
  const database = mysql("MySQL");
  const cache = redis("Redis");

  const api = service("AllGo API", {
    source: github("sualihiddris/allgo", {
      branch: "main",
    }),

    build:
      "npm --workspace @allgo/server exec -- prisma generate && npm run build --workspace=@allgo/server",

    preDeploy:
      "npm --workspace @allgo/server exec -- prisma migrate deploy",

    start:
      "npm run start --workspace=@allgo/server",

    healthcheck: "/api/v1/health",
    healthcheckTimeout: 300,

    env: {
      NODE_ENV: "production",

      DATABASE_URL: database.env.MYSQL_URL,
      REDIS_URL: cache.env.REDIS_URL,

      JWT_SECRET: ctx.shared.JWT_SECRET,
      JWT_ACCESS_SECRET: ctx.shared.JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET: ctx.shared.JWT_REFRESH_SECRET,
      JWT_TOTP_SECRET: ctx.shared.JWT_TOTP_SECRET,

      CORS_ORIGINS: ctx.shared.CORS_ORIGINS,
    },
  });

  return project("AllGo Staging", {
    resources: [
      database,
      cache,
      api,
    ],
  });
});
