import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { DocumentRepository } from "../repositories/document-repo";
import { QuestionRepository } from "../repositories/question-repo";
import { PreparationContextRepository } from "../repositories/preparation-context-repo";

export class ProcessingQueue {
  private static activeJobs = new Map<string, { status: string; progress: number }>();

  public static getJobStatus(documentId: string) {
    return this.activeJobs.get(documentId) || null;
  }

  public static enqueueDocument(
    documentId: string,
    userId: string,
    filePath: string,
    preparationContextId?: string | null
  ) {
    this.activeJobs.set(documentId, { status: "QUEUED", progress: 5 });

    // Process asynchronously out-of-band so the HTTP request returns immediately
    setImmediate(() => {
      this.processJob(documentId, userId, filePath, preparationContextId).catch((err) => {
        console.error(`[Queue] Failed processing job for ${documentId}:`, err);
        void DocumentRepository.updateStatus(documentId, "FAILED", err.message);
        this.activeJobs.delete(documentId);
      });
    });
  }

  private static async processJob(
    documentId: string,
    userId: string,
    filePath: string,
    preparationContextId?: string | null
  ) {
    try {
      // 1. Mark PROCESSING
      await DocumentRepository.updateStatus(documentId, "PROCESSING", "Inspecting document structure...");
      this.activeJobs.set(documentId, { status: "INSPECTING", progress: 20 });

      const pythonScript = path.resolve(process.cwd(), "services", "document-intelligence", "run_pipeline.py");
      const cropsDir = path.resolve(process.cwd(), "data", "storage", "crops");
      const tempOutputDir = path.resolve(process.cwd(), "data", "storage", "temp");

      if (!fs.existsSync(tempOutputDir)) {
        fs.mkdirSync(tempOutputDir, { recursive: true });
      }

      const outputFile = path.join(tempOutputDir, `${documentId}_result.json`);

      // Retrieve context details for discipline compatibility check
      let targetBranch = "";
      let contextName = "";
      if (preparationContextId) {
        const ctx = await PreparationContextRepository.findById(preparationContextId, userId);
        if (ctx) {
          targetBranch = ctx.branch || "";
          contextName = ctx.name || "";
        }
      }

      // 2. Invoke Python Document Intelligence CLI
      this.activeJobs.set(documentId, { status: "EXTRACTING", progress: 45 });
      await DocumentRepository.updateStatus(documentId, "PROCESSING", "Extracting content & parsing layout...");

      const args = [
        pythonScript,
        "--input", filePath,
        "--doc-id", documentId,
        "--user-id", userId,
        "--crops-dir", cropsDir,
        "--output", outputFile,
      ];

      if (targetBranch) {
        args.push("--target-branch", targetBranch);
      }
      if (contextName) {
        args.push("--context-name", contextName);
      }

      await new Promise<void>((resolve, reject) => {
        const proc = spawn("python3", args);

        let stderr = "";
        proc.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });

        proc.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Document intelligence pipeline exited with code ${code}: ${stderr}`));
          }
        });

        proc.on("error", (err) => {
          reject(err);
        });
      });

      // 3. Read output JSON and ingest into SQLite
      this.activeJobs.set(documentId, { status: "INGESTING", progress: 85 });
      await DocumentRepository.updateStatus(documentId, "PROCESSING", "Validating questions & writing to library...");

      if (!fs.existsSync(outputFile)) {
        throw new Error("Pipeline output file not generated");
      }

      const rawJson = await fs.promises.readFile(outputFile, "utf-8");
      const data = JSON.parse(rawJson);

      // Insert pages
      if (data.pages && Array.isArray(data.pages)) {
        await DocumentRepository.insertPages(data.pages);
      }

      // Insert questions with preparationContextId
      if (data.questions && Array.isArray(data.questions)) {
        const questionsWithContext = data.questions.map((q: Record<string, unknown>) => ({
          ...q,
          preparationContextId: preparationContextId ?? null,
        }));
        await QuestionRepository.createMany(questionsWithContext);
      }

      // Update study document summary
      const finalStatus = data.questionsCount === 0 && data.pageCount > 0 ? "PARTIAL" : "READY";
      const statusMessage = finalStatus === "PARTIAL"
        ? "Document processed: learning material detected without structured questions."
        : `Ready for practice (${data.readyCount} ready, ${data.reviewCount} need review).`;

      await DocumentRepository.updateStatus(documentId, finalStatus, statusMessage, data.parserUsed);
      await DocumentRepository.updateCountsAndDetails(documentId, {
        pageCount: data.pageCount,
        questionsCount: data.questionsCount,
        readyQuestionsCount: data.readyCount,
        reviewQuestionsCount: data.reviewCount,
        documentType: data.documentType,
        parserUsed: data.parserUsed,
        metadata: {
          inferredBranch: data.inferredBranch,
          branchCompatibility: data.branchCompatibility,
        },
      });

      // Clean up temporary output json
      await fs.promises.unlink(outputFile).catch(() => {});

      this.activeJobs.set(documentId, { status: "READY", progress: 100 });
      setTimeout(() => {
        this.activeJobs.delete(documentId);
      }, 10000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Processing failed";
      await DocumentRepository.updateStatus(documentId, "FAILED", message);
      this.activeJobs.delete(documentId);
      throw err;
    }
  }
}
