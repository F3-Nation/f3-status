# F3 Nation — System Status 

A real-time status page for F3 Nation services, built with **TypeScript + Vite** and deployed to **GitHub Pages** at [status.f3nation.com](https://status.f3nation.com).

---

## Monitored Services

| Service                | URL                                      | Check Method                     |
| ---------------------- | ---------------------------------------- | -------------------------------- |
| F3 Nation Slack App    | `https://slackbot.f3nation.com/`         | Text match: "Service is running" |
| Slack                  | `https://slack-status.com/api/v2.0.0/current` | Slack Status API (JSON)    |
| F3 Nation API          | `https://api.f3nation.com/v1/ping`       | JSON alive + timestamp           |
| F3 Nation Map          | `https://map.f3nation.com`               | HTTP 200 OK                      |

---

## How It Works

When a user loads the status page, their browser directly pings each service endpoint. Results are displayed in real time as each check completes. The page auto-refreshes every 60 seconds and pauses when the browser tab is hidden.

For services behind CORS restrictions, the checker falls back to a `no-cors` fetch to verify basic reachability.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm

### Installation

```sh
git clone https://github.com/F3-Nation/f3-status.git
cd f3-status
npm install
```

### Development

```sh
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173).

### Build

```sh
npm run build
```

Output: `dist/`

### Tests

```sh
npm run test
```

---

## Deployment

Push to `main` → the GitHub Actions workflow builds and deploys to Pages automatically.

### Custom domain

1. In the repo's **Settings → Pages**, set the custom domain to `status.f3nation.com`.
2. Ensure a CNAME DNS record points `status.f3nation.com` to `f3-nation.github.io`.

---

## Project Structure

```
├── index.html               App entry point
├── src/
│   ├── main.ts              UI bootstrap & orchestration
│   ├── services.ts          Service definitions
│   ├── checker.ts           Health-check logic
│   ├── style.css            F3-branded styles
│   └── main.test.ts         Tests
├── public/                  Static assets
├── vite.config.ts           Vite configuration
├── .github/workflows/       CI/CD
└── README.md
```

---

## Adding a New Service

1. Add an entry to the `services` array in `src/services.ts`.
2. If the check type is new, implement a checker in `src/checker.ts`.
3. Commit and push — the page updates automatically.

---

## License

MIT
