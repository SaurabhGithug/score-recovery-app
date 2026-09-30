import {
  Concept,
  ConceptPrerequisite,
  ExamConceptProfile,
  Subject,
  SyllabusNode,
} from "./schema";

/**
 * Universal Knowledge Brain
 *
 * Maintains the canonical taxonomy of subjects, topics, and concepts,
 * prerequisites, formulas, and misconceptions.
 *
 * Rules:
 * 1. Concepts are universal (physics, circuit theory, aptitude, fluid mechanics).
 * 2. An examination links to a universal concept via an ExamConceptProfile.
 * 3. Exam-specific parameters (weight, typical difficulty, target time) reside in the Exam Brain,
 *    never altering the universal concept definition.
 */
export class UniversalKnowledgeBrain {
  private subjects: Map<string, Subject> = new Map();
  private syllabusNodes: Map<string, SyllabusNode> = new Map();
  private concepts: Map<string, Concept> = new Map();
  private prerequisites: ConceptPrerequisite[] = [];
  private examProfiles: Map<string, ExamConceptProfile> = new Map(); // key: `${examId}:${conceptId}`

  constructor() {
    this.seedDefaultTaxonomy();
  }

  // --- Subjects & Syllabus Nodes ---

  public registerSubject(subject: Subject): void {
    this.subjects.set(subject.id, subject);
  }

  public getSubject(id: string): Subject | undefined {
    return this.subjects.get(id);
  }

  public listSubjects(): Subject[] {
    return Array.from(this.subjects.values());
  }

  public registerSyllabusNode(node: SyllabusNode): void {
    this.syllabusNodes.set(node.id, node);
  }

  public getSyllabusNode(id: string): SyllabusNode | undefined {
    return this.syllabusNodes.get(id);
  }

  public listNodesBySubject(subjectId: string): SyllabusNode[] {
    return Array.from(this.syllabusNodes.values()).filter((n) => n.subjectId === subjectId);
  }

  // --- Concepts ---

  public registerConcept(concept: Concept): void {
    this.concepts.set(concept.id, concept);
  }

  public getConcept(id: string): Concept | undefined {
    return this.concepts.get(id);
  }

  public getConceptByName(canonicalName: string): Concept | undefined {
    return Array.from(this.concepts.values()).find(
      (c) => c.canonicalName.toLowerCase() === canonicalName.toLowerCase()
    );
  }

  public listConcepts(): Concept[] {
    return Array.from(this.concepts.values());
  }

  // --- Prerequisites ---

  public addPrerequisite(prereq: ConceptPrerequisite): void {
    const exists = this.prerequisites.some(
      (p) => p.conceptId === prereq.conceptId && p.prerequisiteConceptId === prereq.prerequisiteConceptId
    );
    if (!exists) {
      this.prerequisites.push(prereq);
    }
  }

  public getPrerequisitesFor(conceptId: string): Concept[] {
    const prereqIds = this.prerequisites
      .filter((p) => p.conceptId === conceptId)
      .map((p) => p.prerequisiteConceptId);

    return prereqIds
      .map((id) => this.concepts.get(id))
      .filter((c): c is Concept => Boolean(c));
  }

  // --- Cross-Exam Mapping with Exam Concept Profiles ---

  public setExamConceptProfile(profile: ExamConceptProfile): void {
    const key = `${profile.examId}:${profile.conceptId}`;
    this.examProfiles.set(key, profile);
  }

  public getExamConceptProfile(examId: string, conceptId: string): ExamConceptProfile | undefined {
    return this.examProfiles.get(`${examId}:${conceptId}`);
  }

  public listConceptsForExam(examId: string): { concept: Concept; profile: ExamConceptProfile }[] {
    const results: { concept: Concept; profile: ExamConceptProfile }[] = [];
    for (const profile of this.examProfiles.values()) {
      if (profile.examId === examId) {
        const concept = this.concepts.get(profile.conceptId);
        if (concept) {
          results.push({ concept, profile });
        }
      }
    }
    return results;
  }

  /**
   * Seed baseline universal knowledge across quantitative aptitude, reasoning,
   * general awareness, and foundational engineering principles.
   */
  private seedDefaultTaxonomy(): void {
    // 1. Subjects
    const subjects: Subject[] = [
      {
        id: "subj-quant",
        code: "QUANT",
        name: { en: "Quantitative Aptitude", hi: "मात्रात्मक अभियोग्यता" },
        createdAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "subj-reasoning",
        code: "REASONING",
        name: { en: "General Intelligence & Reasoning", hi: "सामान्य बुद्धिमत्ता एवं तर्कशक्ति" },
        createdAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "subj-ga",
        code: "GENERAL_AWARENESS",
        name: { en: "General Awareness", hi: "सामान्य जागरूकता" },
        createdAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "subj-english",
        code: "ENGLISH",
        name: { en: "English Language & Comprehension", hi: "अंग्रेज़ी भाषा एवं समझ" },
        createdAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "subj-engineering-core",
        code: "ENG_CORE",
        name: { en: "Engineering Sciences Foundation", hi: "अभियांत्रिकी विज्ञान आधार" },
        createdAt: "2026-09-01T00:00:00Z",
      },
    ];
    subjects.forEach((s) => this.registerSubject(s));

    // 2. Syllabus Nodes
    const nodes: SyllabusNode[] = [
      {
        id: "node-arithmetic",
        subjectId: "subj-quant",
        nodeType: "unit",
        title: { en: "Arithmetic Systems", hi: "अंकगणितीय प्रणालियाँ" },
        orderIndex: 1,
      },
      {
        id: "node-percentages",
        subjectId: "subj-quant",
        parentId: "node-arithmetic",
        nodeType: "topic",
        title: { en: "Percentages & Applications", hi: "प्रतिशतता एवं अनुप्रयोग" },
        orderIndex: 2,
      },
      {
        id: "node-profit-loss",
        subjectId: "subj-quant",
        parentId: "node-arithmetic",
        nodeType: "topic",
        title: { en: "Profit, Loss & Discount", hi: "लाभ, हानि एवं छूट" },
        orderIndex: 3,
      },
      {
        id: "node-series-analogy",
        subjectId: "subj-reasoning",
        nodeType: "unit",
        title: { en: "Series & Analogy", hi: "श्रृंखला एवं सादृश्यता" },
        orderIndex: 1,
      },
      {
        id: "node-circuits",
        subjectId: "subj-engineering-core",
        nodeType: "unit",
        title: { en: "Basic Circuit Laws", hi: "मूल परिपथ नियम" },
        orderIndex: 1,
      },
      {
        id: "node-mechanics",
        subjectId: "subj-engineering-core",
        nodeType: "unit",
        title: { en: "Engineering Mechanics & Strength", hi: "अभियांत्रिकी यांत्रिकी एवं सामर्थ्य" },
        orderIndex: 2,
      },
    ];
    nodes.forEach((n) => this.registerSyllabusNode(n));

    // 3. Universal Concepts
    const concepts: Concept[] = [
      {
        id: "concept-percentage-base",
        syllabusNodeId: "node-percentages",
        subjectId: "subj-quant",
        canonicalName: "Percentage Base Identification",
        name: { en: "Percentage Base Identification", hi: "प्रतिशत आधार पहचान" },
        summary: {
          en: "Identifying the correct denominator base when computing percentage change or reverse percentages.",
          hi: "प्रतिशत परिवर्तन या विपरीत प्रतिशत की गणना करते समय सही हर आधार की पहचान करना।",
        },
        formulae: [
          {
            name: "Percentage Change",
            latex: "\\% \\text{ change} = \\frac{\\text{Final} - \\text{Initial}}{\\text{Initial}} \\times 100",
            variables: { Final: "Ending value", Initial: "Original reference base" },
            standardUnits: "%",
          },
        ],
        misconceptions: [
          {
            key: "reversed_denominator",
            title: { en: "Using Final value as base", hi: "अंतिम मान को आधार मानना" },
            description: {
              en: "Candidate divides by the new increased/decreased value instead of the original initial value.",
              hi: "अभ्यर्थी मूल प्रारंभिक मान के स्थान पर नए बढ़े या घटे मान से भाग दे देता है।",
            },
            typicalDistractorPattern: "Values scaled by (Final/Initial) instead of relative increase.",
            remedialAdvice: {
              en: "Always pinpoint 'compared to what' or 'than what' to isolate the denominator.",
              hi: "हमेशा 'किसकी तुलना में' शब्द की पहचान कर हर (आधार) को निश्चित करें।",
            },
          },
        ],
        questionArchetypes: [
          {
            id: "archetype-perc-1",
            title: "Successive Percentage Shift",
            cognitiveLevel: "apply",
            description: "Calculating net percentage shift across consecutive changes.",
          },
        ],
        createdAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "concept-profit-loss-cp-sp",
        syllabusNodeId: "node-profit-loss",
        subjectId: "subj-quant",
        canonicalName: "Profit and Loss Margin",
        name: { en: "Profit and Loss Margin on Cost Price", hi: "क्रय मूल्य पर लाभ एवं हानि मार्जिन" },
        summary: {
          en: "Computing true profit/loss percentage strictly on Cost Price unless specified otherwise.",
          hi: "जब तक अन्यथा निर्दिष्ट न हो, वास्तविक लाभ/हानि प्रतिशत की गणना केवल क्रय मूल्य पर करना।",
        },
        formulae: [
          {
            name: "Profit Percentage",
            latex: "P\\% = \\frac{SP - CP}{CP} \\times 100",
            variables: { SP: "Selling Price", CP: "Cost Price" },
          },
        ],
        misconceptions: [
          {
            key: "sp_margin_confusion",
            title: { en: "Confusing Margin on SP with Profit on CP", hi: "विक्रय मूल्य मार्जिन को क्रय मूल्य लाभ समझना" },
            description: {
              en: "Treating a markup or margin on selling price as if it were calculated on cost price.",
              hi: "विक्रय मूल्य पर आधारित मार्जिन को क्रय मूल्य पर आधारित लाभ मान लेना।",
            },
            typicalDistractorPattern: "Profit calculated as (SP - CP) / SP.",
            remedialAdvice: {
              en: "Re-anchor CP = SP / (1 + P%). Do not divide profit by SP.",
              hi: "CP = SP / (1 + P%) सूत्र का स्मरण करें, लाभ को SP से विभाजित न करें।",
            },
          },
        ],
        questionArchetypes: [
          {
            id: "archetype-pl-1",
            title: "Marked Price Discount with Profit",
            cognitiveLevel: "apply",
            description: "Finding profit when discount is given on marked price.",
          },
        ],
        createdAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "concept-ohms-law",
        syllabusNodeId: "node-circuits",
        subjectId: "subj-engineering-core",
        canonicalName: "Ohm's Law and Linear Resistance",
        name: { en: "Ohm's Law & Circuit Resistance", hi: "ओम का नियम एवं परिपथ प्रतिरोध" },
        summary: {
          en: "Fundamental relationship between voltage, current and linear ohmic resistance in DC circuits.",
          hi: "डीसी परिपथों में वोल्टता, धारा एवं रैखिक प्रतिरोध के बीच मौलिक संबंध।",
        },
        formulae: [
          {
            name: "Ohm's Law",
            latex: "V = I \\cdot R",
            variables: { V: "Potential Difference (Volts)", I: "Current (Amperes)", R: "Resistance (Ohms)" },
            standardUnits: "V, A, \\Omega",
          },
        ],
        misconceptions: [
          {
            key: "internal_resistance_neglect",
            title: { en: "Ignoring Source Internal Resistance", hi: "स्रोत के आंतरिक प्रतिरोध की अनदेखी" },
            description: {
              en: "Assuming terminal voltage equals electromotive force (EMF) without accounting for internal drop.",
              hi: "आंतरिक विभव पतन को शामिल किए बिना टर्मिनल वोल्टेज को ईएमएफ के बराबर मान लेना।",
            },
            typicalDistractorPattern: "V_terminal = E instead of E - I*r.",
            remedialAdvice: {
              en: "Always add internal resistance r in series with circuit resistance R.",
              hi: "हमेशा आंतरिक प्रतिरोध r को परिपथ प्रतिरोध R के साथ श्रेणीक्रम में जोड़ें।",
            },
          },
        ],
        questionArchetypes: [
          {
            id: "archetype-circ-1",
            title: "Equivalent Resistance with Non-ideal Source",
            cognitiveLevel: "apply",
            description: "Calculating circuit current considering internal battery resistance.",
          },
        ],
        createdAt: "2026-09-01T00:00:00Z",
      },
    ];
    concepts.forEach((c) => this.registerConcept(c));

    // 4. Prerequisites
    this.addPrerequisite({
      id: "prereq-pl-to-perc",
      conceptId: "concept-profit-loss-cp-sp",
      prerequisiteConceptId: "concept-percentage-base",
      isStrict: true,
    });
  }
}

// Export singleton instance for platform-wide reuse
export const universalKnowledgeBrain = new UniversalKnowledgeBrain();
