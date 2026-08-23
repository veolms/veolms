export function generateUniqueUsername(displayName: string): string {
  const firstName = displayName.trim().split(/\s+/)[0] || "";
  const cleaned = firstName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const base = cleaned.length >= 2 ? cleaned.slice(0, 24) : "user";

  const charset = "abcdefghijklmnopqrstuvwxyz0123456789";
  let randomSuffix = "";

  const randomBuffer = new Uint8Array(5);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(randomBuffer);
    for (let i = 0; i < 5; i++) {
      const randomValue = randomBuffer[i] ?? 0;
      randomSuffix += charset[randomValue % charset.length];
    }
  } else {
    for (let i = 0; i < 5; i++) {
      randomSuffix += charset[Math.floor(Math.random() * charset.length)];
    }
  }

  return `${base}_${randomSuffix}`;
}
