import path from "path";
import { IsroJpaImporter } from "./importer";

function main() {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes("--live");

  const baseDir = process.cwd();
  const csvPath = path.join(baseDir, "docs/isro-jpa-analysis/question-locations.csv");
  const jsonlPath = path.join(baseDir, "docs/isro-jpa-analysis/question-blocks.jsonl");

  console.log("===============================================================");
  console.log("ISRO JPA Artifacts Idempotent Importer");
  console.log(`Execution Mode: ${isDryRun ? "DRY-RUN (Simulated, No DB write)" : "LIVE"}`);
  console.log(`Locations CSV: ${csvPath}`);
  console.log(`Blocks JSONL:  ${jsonlPath}`);
  console.log("===============================================================");

  const report = IsroJpaImporter.run({
    locationsCsvPath: csvPath,
    questionBlocksJsonlPath: jsonlPath,
    dryRun: isDryRun,
  });

  console.log("\n--- Import Summary Report ---");
  console.log(`CSV Location Records Read:    ${report.totalCsvRows}`);
  console.log(`JSONL Question Blocks Read:   ${report.totalJsonlRows}`);
  console.log(`Valid Records Extracted:      ${report.validRecords}`);
  console.log(`Invalid / Rejected Records:   ${report.invalidRecords}`);
  console.log(`Official Papers (ICRB/PRL):   ${report.officialRecords}`);
  console.log(`Third-Party Scan Records:     ${report.thirdPartyRecords}`);
  console.log("\nPublishing Status Breakdown (Strict Rights Gating):");
  console.log(`- Draft (Restricted scans):   ${report.publishingStatusCounts.draft}`);
  console.log(`- Machine-Validated:          ${report.publishingStatusCounts.machine_validated}`);
  console.log(`- Expert-Reviewed:            ${report.publishingStatusCounts.expert_reviewed}`);
  console.log(`- Published:                  ${report.publishingStatusCounts.published}`);

  if (report.errors.length > 0) {
    console.log(`\nValidation Discrepancies (${report.errors.length} total, first 5 shown):`);
    report.errors.slice(0, 5).forEach((e) => console.log(`  ! ${e}`));
  }

  if (report.importedItems.length > 0) {
    const sample = report.importedItems[0];
    console.log("\nSample Validated Domain Record:");
    console.log(JSON.stringify(sample, null, 2));
  }

  console.log("\n[SUCCESS] Import execution completed without crashing.");
}

main();
