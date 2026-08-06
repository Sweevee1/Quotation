import { Router } from "express";
import { quoteImportSchema } from "@quotation/shared";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { createBackup, getBackupData, importBackup, listBackups, restoreBackup } from "../services/backupService.js";
import { publishEvent } from "../events/bus.js";

export const backupsRouter = Router();
backupsRouter.use(requireAuth);

backupsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await listBackups());
  }),
);

backupsRouter.post(
  "/",
  asyncHandler(async (_req, res) => {
    const backup = await createBackup("manual");
    publishEvent("status", `Manual backup created (${backup.quoteCount} quotes)`);
    res.status(201).json(backup);
  }),
);

backupsRouter.post(
  "/import",
  asyncHandler(async (req, res) => {
    const parsed = quoteImportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid import payload" });
      return;
    }
    const backup = await importBackup(parsed.data.quotes);
    publishEvent("status", `Backup imported from file (${backup.quoteCount} quotes)`);
    res.status(201).json(backup);
  }),
);

backupsRouter.get(
  "/:id/export",
  asyncHandler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid backup id" });
      return;
    }
    const items = await getBackupData(id);
    if (!items) {
      res.status(404).json({ error: "Backup not found" });
      return;
    }
    res.setHeader("Content-Disposition", `attachment; filename="backup-${id}.json"`);
    res.json({ quotes: items });
  }),
);

backupsRouter.post(
  "/:id/restore",
  asyncHandler(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid backup id" });
      return;
    }
    const skipSafetyBackup = req.body?.skipSafetyBackup === true;
    try {
      const result = await restoreBackup(id, { skipSafetyBackup });
      publishEvent("status", `Restored backup #${id} (${result.restoredCount} quotes)`);
      res.json(result);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : "Restore failed" });
    }
  }),
);
