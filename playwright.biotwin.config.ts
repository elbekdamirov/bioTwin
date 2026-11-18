import { defineConfig } from '@playwright/test';

const server = process.env.BIOTWIN_E2E_URL;
export default defineConfig({
  testDir: './e2e',
  testMatch: ['biotwin.spec.ts', 'tour.spec.ts', 'forecast.spec.ts', 'medicines.spec.ts', 'records.spec.ts'],
  timeout: 150_000,
  expect: { timeout: 25000 },
  workers: 1,
  use: {
    baseURL: server ?? 'http://localhost:4174',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    screenshot: 'only-on-failure',
  },
  webServer: server ? undefined : [{command:'npm run dev:api',url:'http://127.0.0.1:8788/api/records/status',env:{PORT:'8788',BIOTWIN_DB_PATH:'data/browser-qa.sqlite'},timeout:30000}, {
    command: 'npm run build && npm exec vite -- preview --port 4174 --strictPort',
    url: 'http://localhost:4174',
    timeout: 180_000,
    env:{PORT:'8788'},
  }],
});
