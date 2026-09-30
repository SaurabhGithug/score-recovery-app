import {
  Exam,
  ExamBranch,
  ExamCycle,
  ExamOrganizationRole,
  ExamPaper,
  ExamSection,
  ExamStage,
  Organization,
} from "./schema";

/**
 * Exam Brain
 *
 * Governs all examination structures, organizational roles, conducting agency evidence,
 * cycles, stages, papers, sections, duration, and negative marking rules.
 *
 * Distinct roles are modeled independently:
 * 1. Recruiting Organisation (e.g. SSC, ISRO ICRB)
 * 2. Exam Owner (e.g. Staff Selection Commission, ISRO HQ)
 * 3. Paper-Setting Organisation (e.g. Confidential Board / Academic Panel)
 * 4. Conducting Agency (e.g. Designated Commission / Authority)
 * 5. CBT / Platform Vendor (e.g. TCS iON, NSEIT, EdCIL - vendor of the screen, NOT the paper setter)
 */
export class ExamBrain {
  private organizations: Map<string, Organization> = new Map();
  private organizationRoles: ExamOrganizationRole[] = [];
  private exams: Map<string, Exam> = new Map();
  private cycles: Map<string, ExamCycle> = new Map();
  private branches: Map<string, ExamBranch[]> = new Map(); // examId -> ExamBranch[]
  private stages: Map<string, ExamStage[]> = new Map(); // cycleId -> ExamStage[]
  private papers: Map<string, ExamPaper[]> = new Map(); // stageId -> ExamPaper[]
  private sections: Map<string, ExamSection[]> = new Map(); // paperId -> ExamSection[]

  constructor() {
    this.seedDefaultOrganizations();
  }

  // --- Organizations & Roles ---

  public registerOrganization(org: Organization): void {
    this.organizations.set(org.id, org);
  }

  public getOrganization(id: string): Organization | undefined {
    return this.organizations.get(id);
  }

  public addOrganizationRole(role: ExamOrganizationRole): void {
    this.organizationRoles.push(role);
  }

  public getRolesForExam(examId: string): ExamOrganizationRole[] {
    return this.organizationRoles.filter((r) => r.examId === examId);
  }

  // --- Exams ---

  public registerExam(exam: Exam): void {
    this.exams.set(exam.id, exam);
  }

  public getExam(id: string): Exam | undefined {
    return this.exams.get(id);
  }

  public listExams(): Exam[] {
    return Array.from(this.exams.values()).filter((e) => e.isActive);
  }

  // --- Cycles ---

  public registerCycle(cycle: ExamCycle): void {
    this.cycles.set(cycle.id, cycle);
  }

  public getCycle(id: string): ExamCycle | undefined {
    return this.cycles.get(id);
  }

  public listCyclesForExam(examId: string): ExamCycle[] {
    return Array.from(this.cycles.values()).filter((c) => c.examId === examId);
  }

  // --- Branches ---

  public registerBranch(branch: ExamBranch): void {
    const list = this.branches.get(branch.examId) ?? [];
    if (!list.some((b) => b.branchCode === branch.branchCode)) {
      list.push(branch);
      this.branches.set(branch.examId, list);
    }
  }

  public getBranchesForExam(examId: string): ExamBranch[] {
    return this.branches.get(examId) ?? [];
  }

  // --- Stages, Papers, Sections ---

  public registerStage(stage: ExamStage): void {
    const list = this.stages.get(stage.cycleId) ?? [];
    list.push(stage);
    this.stages.set(stage.cycleId, list);
  }

  public getStagesForCycle(cycleId: string): ExamStage[] {
    return this.stages.get(cycleId) ?? [];
  }

  public registerPaper(paper: ExamPaper): void {
    const list = this.papers.get(paper.stageId) ?? [];
    list.push(paper);
    this.papers.set(paper.stageId, list);
  }

  public getPapersForStage(stageId: string, branchId?: string): ExamPaper[] {
    const all = this.papers.get(stageId) ?? [];
    if (!branchId) return all;
    // Returns branch-neutral common papers plus the matching branch paper
    return all.filter((p) => !p.branchId || p.branchId === branchId);
  }

  public registerSection(section: ExamSection): void {
    const list = this.sections.get(section.paperId) ?? [];
    list.push(section);
    this.sections.set(section.paperId, list);
  }

  public getSectionsForPaper(paperId: string): ExamSection[] {
    const list = this.sections.get(paperId) ?? [];
    return [...list].sort((a, b) => a.orderIndex - b.orderIndex);
  }

  /**
   * Seed standard public recruiting organizations
   */
  private seedDefaultOrganizations(): void {
    const orgs: Organization[] = [
      {
        id: "org-ssc",
        name: "Staff Selection Commission",
        shortCode: "SSC",
        officialWebsite: "https://ssc.gov.in",
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "org-isro-icrb",
        name: "ISRO Centralised Recruitment Board",
        shortCode: "ISRO ICRB",
        officialWebsite: "https://www.isro.gov.in",
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "org-isro-prl",
        name: "Physical Research Laboratory (Autonomous Unit of DOS/ISRO)",
        shortCode: "PRL",
        officialWebsite: "https://www.prl.res.in",
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "org-tcs-ion",
        name: "Tata Consultancy Services (iON CBT Platform)",
        shortCode: "TCS iON",
        officialWebsite: "https://www.tcsion.com",
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
    ];

    orgs.forEach((o) => this.registerOrganization(o));
  }
}

export const examBrain = new ExamBrain();
