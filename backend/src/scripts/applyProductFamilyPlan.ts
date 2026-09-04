import { readFileSync, statSync } from "node:fs";
import { parseProductFamilyPlanArgs, loadProductFamilyPlanConfig } from "../services/productFamilyPlan/config";
import { validateProductFamilyPlan } from "../services/productFamilyPlan/plan";
import { readOnlyFamilyPlanState } from "../services/productFamilyPlan/readState";
import { previewProductFamilies, executeProductFamilies } from "../services/productFamilyPlan/runner";
import { safeFamilyPlanError } from "../services/productFamilyPlan/safeError";

export async function runProductFamilyPlan(argv = process.argv.slice(2)) {
  const args = parseProductFamilyPlanArgs(argv);
  const stat = statSync(args.plan);
  if (!stat.isFile() || stat.size === 0 || stat.size > 2 * 1024 * 1024) throw new Error("FAMILY_PLAN_FILE_INVALID");
  // Schema, digest and expected counts are checked before reading credentials or connecting.
  const plan = validateProductFamilyPlan(readFileSync(args.plan), args.sha256, {
    families: args.expectedFamilies, variants: args.expectedVariants, individuals: args.expectedIndividuals,
  });
  const config = loadProductFamilyPlanConfig(args);
  let result;
  if (args.mode === "dry-run") {
    result = await previewProductFamilies(plan,
      () => readOnlyFamilyPlanState(config.connection, args.preMigration), args);
  } else {
    // No production application dotenv singleton and no writer import during preview.
    const { createFamilyPlanWriter } = await import("../services/productFamilyPlan/writer.js");
    const target = createFamilyPlanWriter(config, args);
    try { result = await executeProductFamilies(plan, target.writer, args); }
    finally { await target.disconnect(); }
  }
  const report = {
    operation: args.mode === "dry-run" ? "PRODUCT_FAMILIES_DRY_RUN" : "PRODUCT_FAMILIES_EXECUTE",
    environment: args.environment, projectRef: args.projectRef, planSha256: args.sha256,
    tlsCertificateValidation: "strict", ...result,
  };
  // Only the sanitized planner report. No rows, IDs, paths, connection objects or raw errors.
  process.stdout.write(JSON.stringify({
    operation: report.operation, environment: report.environment, projectRef: report.projectRef,
    planSha256: report.planSha256, tlsCertificateValidation: report.tlsCertificateValidation,
    schema: result.schema, ...result.report.summary, writeOperations: result.writeOperations,
    conflictDetails: result.report.conflicts,
  }, null, 2) + "\n");
  if (result.report.summary.conflicts !== 0) process.exitCode = 2;
  return report;
}

if (require.main === module) {
  runProductFamilyPlan().catch(error => {
    process.stderr.write(`ProductFamily abortado: ${safeFamilyPlanError(error)}\n`);
    process.exitCode = 1;
  });
}
