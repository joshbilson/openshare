import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily cache/data cleanup of playlists older than the retention window.
crons.interval(
  "cleanup-old-playlists",
  { hours: 24 },
  internal.maintenance.cleanup,
  {},
);

export default crons;
