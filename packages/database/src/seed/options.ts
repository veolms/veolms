export interface SeedOptions {
  courses: number;
  students: number;
  lessons: number;
  comments: number;
  questions: number;
  orders: number;
}

export function parseOptions(args: string[]): SeedOptions {
  const options: SeedOptions = {
    courses: 10,
    students: 50,
    lessons: 2,
    comments: 1,
    questions: 1,
    orders: 15,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--") continue;
    if (arg === "--help") {
      console.info(
        "Usage: pnpm db:seed -- [--courses N] [--students N] [--lessons N] [--comments N] [--questions N] [--orders N]",
      );
      process.exit(0);
    }
    const [rawKey, inline] = arg.split("=", 2);
    const key = rawKey?.replace(/^--/, "") as keyof SeedOptions;
    if (!rawKey?.startsWith("--") || !(key in options))
      throw new Error(`Unknown option: ${arg}`);
    const value = inline ?? args[++i];
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for --${key}`);
    {
      const number = Number(value);
      const min =
        key === "comments" || key === "questions" || key === "orders" ? 0 : 1;
      if (!Number.isSafeInteger(number) || number < min || number > 10000)
        throw new Error(
          `Invalid --${key}: expected an integer from ${min} to 10000`,
        );
      options[key] = number;
    }
  }
  return options;
}
