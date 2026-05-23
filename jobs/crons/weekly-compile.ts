import { runWeeklyCompileForAllAccounts } from "@/lib/voice/weekly-compile";

export { runWeeklyCompileForAllAccounts };

if (process.argv[1]?.endsWith("weekly-compile.ts")) {
  runWeeklyCompileForAllAccounts()
    .then(() => undefined)
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
