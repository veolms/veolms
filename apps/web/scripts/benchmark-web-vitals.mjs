import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const origin = process.env.BENCHMARK_ORIGIN ?? "http://127.0.0.1:4173";
const samplesPerRoute = Number(process.env.BENCHMARK_SAMPLES ?? 3);
const outputPath = process.env.BENCHMARK_OUTPUT;
const cpuSlowdown = Number(process.env.BENCHMARK_CPU_SLOWDOWN ?? 4);
const throttleNetwork = process.env.BENCHMARK_NETWORK !== "off";

const routes = [
  {
    name: "Home",
    path: "/",
    ready: ".home-resume-card",
    interaction: ".mobile-bottom-nav button:last-child",
  },
  {
    name: "My Courses",
    path: "/my-courses",
    ready: ".my-courses-page",
    interaction: ".learning-filter-tabs button:nth-child(2)",
  },
  {
    name: "Explore Courses",
    path: "/explore-courses",
    ready: ".courses-grid",
    interaction: '[role="tablist"] [role="tab"]:nth-child(2)',
  },
  {
    name: "Settings",
    path: "/settings/appearance",
    ready: ".settings-content",
    interaction: ".settings-toggle",
  },
  {
    name: "Learning",
    path: "/learn/typescript-course/the-design-mindset?from=my-courses",
    ready: ".learning-workspace",
    interaction: ".lesson-tool-tab:nth-child(2)",
  },
];

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const round = (value) => Math.round(value * 10) / 10;

const browser = await chromium.launch({ headless: true });
const results = [];

for (const route of routes) {
  const samples = [];

  for (let sampleIndex = 0; sampleIndex < samplesPerRoute; sampleIndex += 1) {
    const context = await browser.newContext({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);

    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    if (throttleNetwork) {
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
        connectionType: "cellular4g",
      });
    }
    if (cpuSlowdown > 1) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuSlowdown });
    }

    await page.addInitScript(() => {
      window.__veolmsVitals = {
        cls: 0,
        interactionLatency: 0,
        interactionId: 0,
        interactionStart: 0,
        lcp: 0,
        longTaskCount: 0,
        tbt: 0,
      };

      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries.at(-1);
        if (lastEntry) window.__veolmsVitals.lcp = lastEntry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });

      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__veolmsVitals.cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });

      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__veolmsVitals.longTaskCount += 1;
          window.__veolmsVitals.tbt += Math.max(0, entry.duration - 50);
        }
      }).observe({ type: "longtask", buffered: true });

      const interactionEntries = new Map();
      let pendingInteractionStart = 0;
      let pendingInteractionEnd = 0;
      const eventTimingTypes = PerformanceObserver.supportedEntryTypes || [];
      if (eventTimingTypes.includes("event")) {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.interactionId) continue;
            const previous = interactionEntries.get(entry.interactionId);
            interactionEntries.set(entry.interactionId, {
              startTime: Math.min(
                previous?.startTime ?? entry.startTime,
                entry.startTime,
              ),
              duration: Math.max(previous?.duration ?? 0, entry.duration),
            });
            if (
              pendingInteractionStart > 0 &&
              entry.startTime >= pendingInteractionStart - 50 &&
              (pendingInteractionEnd === 0 ||
                entry.startTime <= pendingInteractionEnd + 500)
            ) {
              const currentId = window.__veolmsVitals.interactionId;
              const current = currentId
                ? interactionEntries.get(currentId)
                : undefined;
              if (!current || entry.startTime >= current.startTime) {
                window.__veolmsVitals.interactionId = entry.interactionId;
                window.__veolmsVitals.interactionLatency = Math.max(
                  0,
                  entry.duration,
                );
              }
            }
          }
        }).observe({ type: "event", durationThreshold: 16, buffered: true });
      }

      addEventListener(
        "pointerdown",
        () => {
          window.__veolmsVitals.interactionStart = performance.now();
          window.__veolmsVitals.interactionId = 0;
          window.__veolmsVitals.interactionLatency = 0;
          pendingInteractionStart = window.__veolmsVitals.interactionStart;
          pendingInteractionEnd = 0;
        },
        { capture: true },
      );
      addEventListener(
        "pointerup",
        () => {
          pendingInteractionEnd = performance.now();
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const candidate = [...interactionEntries.entries()]
                .filter(
                  ([, value]) =>
                    value.startTime >= pendingInteractionStart - 50 &&
                    value.startTime <= performance.now() + 500,
                )
                .sort(
                  ([, left], [, right]) => right.startTime - left.startTime,
                )[0];
              if (candidate) {
                const [interactionId, value] = candidate;
                window.__veolmsVitals.interactionId = interactionId;
                window.__veolmsVitals.interactionLatency = Math.max(
                  0,
                  value.duration,
                );
              }
            });
          });
        },
        { capture: true },
      );
    });

    const startedAt = Date.now();
    const response = await page.goto(`${origin}${route.path}`, {
      waitUntil: "load",
      timeout: 90_000,
    });
    if (!response?.ok()) {
      throw new Error(`${route.name} returned HTTP ${response?.status()}`);
    }
    await page.locator(route.ready).first().waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await page.waitForTimeout(1_000);

    const interactionTarget = page.locator(route.interaction).first();
    if (await interactionTarget.isVisible()) {
      await interactionTarget.click();
      await page.waitForTimeout(350);
    }

    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      const resources = performance.getEntriesByType("resource");
      const firstContentfulPaint = performance
        .getEntriesByType("paint")
        .find((entry) => entry.name === "first-contentful-paint");
      const jsResources = resources.filter(
        (entry) =>
          entry.initiatorType === "script" ||
          entry.name.includes(".js") ||
          entry.name.includes(".mjs"),
      );

      return {
        cls: window.__veolmsVitals.cls,
        domContentLoaded: navigation.domContentLoadedEventEnd,
        domNodes: document.getElementsByTagName("*").length,
        fcp: firstContentfulPaint?.startTime ?? 0,
        interactionLatency: window.__veolmsVitals.interactionLatency,
        jsRequests: jsResources.length,
        jsTransferBytes: jsResources.reduce(
          (total, entry) => total + entry.transferSize,
          0,
        ),
        lcp: window.__veolmsVitals.lcp,
        load: navigation.loadEventEnd,
        longTaskCount: window.__veolmsVitals.longTaskCount,
        requestCount: resources.length + 1,
        tbt: window.__veolmsVitals.tbt,
        transferBytes:
          navigation.transferSize +
          resources.reduce((total, entry) => total + entry.transferSize, 0),
        ttfb: navigation.responseStart,
      };
    });

    samples.push({
      ...Object.fromEntries(
        Object.entries(metrics).map(([key, value]) => [key, round(value)]),
      ),
      wallTime: Date.now() - startedAt,
    });
    await context.close();
  }

  const numericKeys = Object.keys(samples[0]);
  const medians = Object.fromEntries(
    numericKeys.map((key) => [
      key,
      round(median(samples.map((item) => item[key]))),
    ]),
  );
  results.push({ ...route, medians, samples });
}

await browser.close();

const report = {
  generatedAt: new Date().toISOString(),
  origin,
  profile: {
    cpuSlowdown,
    device: "412x915 @2x, Android mobile emulation",
    network: throttleNetwork
      ? "1.6 Mbps down, 750 Kbps up, 150 ms RTT"
      : "unthrottled",
    samplesPerRoute,
  },
  routes: results,
};

const output = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  const absoluteOutputPath = resolve(outputPath);
  await mkdir(dirname(absoluteOutputPath), { recursive: true });
  await writeFile(absoluteOutputPath, output, "utf8");
}
process.stdout.write(output);
