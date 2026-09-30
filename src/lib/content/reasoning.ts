import { Question } from "../types";

export const reasoningQuestions: Question[] = [
  // ---------------------------------------------------------------------
  // 1. Blood Relations
  // ---------------------------------------------------------------------
  {
    id: "reasoning-blood-relations-1",
    section: "reasoning",
    concept: "Blood Relations",
    conceptLabel: { en: "Blood Relations", hi: "रक्त संबंध" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: `Pointing to a boy, Meena said, 'He is the son of the only daughter of my father's mother.' How is the boy related to Meena?`,
      hi: `एक लड़के की ओर इशारा करते हुए मीना ने कहा, 'वह मेरे पिता की माँ की इकलौती बेटी का बेटा है।' वह लड़का मीना से किस प्रकार संबंधित है?`,
    },
    options: [
      { id: "A", text: { en: "Nephew", hi: "भांजा" } },
      { id: "B", text: { en: "Cousin", hi: "फुफेरा भाई" } },
      { id: "C", text: { en: "Brother", hi: "भाई" } },
      { id: "D", text: { en: "Son", hi: "बेटा" } },
    ],
    correctOptionId: "B",
    explanation: {
      en: `'Father's mother' is Meena's paternal grandmother. Her 'only daughter' is Meena's father's sister, i.e. Meena's paternal aunt (bua). The boy is this aunt's son, which makes him Meena's cousin.`,
      hi: `'पिता की माँ' मीना की दादी है। दादी की 'इकलौती बेटी' मीना के पिता की बहन है, अर्थात् मीना की बुआ। यह लड़का बुआ का बेटा है, इसलिए वह मीना का फुफेरा भाई (कज़िन) हुआ।`,
    },
    commonTrap: {
      en: `Many students apply the rule 'sister's son = nephew' directly to this aunt's son, without noticing that the 'sister' here is actually the father's sister — one generation above Meena — which makes the boy Meena's cousin, not her nephew (option A).`,
      hi: `कई विद्यार्थी 'बहन का बेटा = भांजा' का नियम सीधे यहाँ भी लगा देते हैं, यह ध्यान दिए बिना कि यह 'बहन' असल में पिता की बहन (बुआ) है — मीना से एक पीढ़ी ऊपर — इसलिए वह लड़का मीना का भांजा (विकल्प A) नहीं, बल्कि फुफेरा भाई (कज़िन) है।`,
    },
    expectedTimeSeconds: 70,
  },
  {
    id: "reasoning-blood-relations-2",
    section: "reasoning",
    concept: "Blood Relations",
    conceptLabel: { en: "Blood Relations", hi: "रक्त संबंध" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: `Pointing to a girl, Arjun said, 'She is the daughter of the only son of my mother's father.' How is the girl related to Arjun?`,
      hi: `एक लड़की की ओर इशारा करते हुए अर्जुन ने कहा, 'वह मेरी माँ के पिता के इकलौते बेटे की बेटी है।' वह लड़की अर्जुन से किस प्रकार संबंधित है?`,
    },
    options: [
      { id: "A", text: { en: "Niece", hi: "भतीजी" } },
      { id: "B", text: { en: "Sister", hi: "बहन" } },
      { id: "C", text: { en: "Cousin", hi: "ममेरी बहन" } },
      { id: "D", text: { en: "Daughter", hi: "बेटी" } },
    ],
    correctOptionId: "C",
    explanation: {
      en: `'Mother's father' is Arjun's maternal grandfather. His 'only son' is Arjun's mother's brother, i.e. Arjun's maternal uncle (mama). The girl is this uncle's daughter, which makes her Arjun's cousin.`,
      hi: `'माँ का पिता' अर्जुन के नाना हैं। नाना का 'इकलौता बेटा' अर्जुन की माँ का भाई है, अर्थात् अर्जुन का मामा। यह लड़की मामा की बेटी है, इसलिए वह अर्जुन की ममेरी बहन (कज़िन) हुई।`,
    },
    commonTrap: {
      en: `Many students apply the rule 'brother's daughter = niece' directly to the maternal uncle's daughter, without noticing that this uncle is actually the mother's brother — one generation above Arjun — which makes the girl Arjun's cousin, not his niece (option A).`,
      hi: `कई विद्यार्थी 'भाई की बेटी = भतीजी' का नियम सीधे मामा की बेटी पर भी लगा देते हैं, यह भूलकर कि यह भाई असल में माँ का भाई है — अर्जुन से एक पीढ़ी ऊपर — इसलिए वह लड़की अर्जुन की भतीजी (विकल्प A) नहीं, बल्कि ममेरी बहन (कज़िन) है।`,
    },
    expectedTimeSeconds: 70,
    retestOf: "reasoning-blood-relations-1",
  },

  // ---------------------------------------------------------------------
  // 2. Coding-Decoding
  // ---------------------------------------------------------------------
  {
    id: "reasoning-coding-decoding-1",
    section: "reasoning",
    concept: "Coding-Decoding",
    conceptLabel: { en: "Coding-Decoding", hi: "कूट लेखन एवं कूट वाचन" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: `In a certain code language, 'FLOWER' is written as 'GMPXFS'. How will 'GARDEN' be written in that code?`,
      hi: `एक निश्चित कूट भाषा में, 'FLOWER' को 'GMPXFS' लिखा जाता है। उसी कूट में 'GARDEN' को कैसे लिखा जाएगा?`,
    },
    options: [
      { id: "A", text: { en: "HBSEFO", hi: "HBSEFO" } },
      { id: "B", text: { en: "FZQCDM", hi: "FZQCDM" } },
      { id: "C", text: { en: "ICTFGP", hi: "ICTFGP" } },
      { id: "D", text: { en: "HBSDEN", hi: "HBSDEN" } },
    ],
    correctOptionId: "A",
    explanation: {
      en: `Each letter of the word is shifted one step forward in the alphabet: F→G, L→M, O→P, W→X, E→F, R→S, giving FLOWER → GMPXFS. Applying the same rule to GARDEN: G→H, A→B, R→S, D→E, E→F, N→O, giving HBSEFO.`,
      hi: `शब्द के हर अक्षर को वर्णमाला में एक स्थान आगे खिसकाया गया है: F→G, L→M, O→P, W→X, E→F, R→S, जिससे FLOWER → GMPXFS बनता है। यही नियम GARDEN पर लगाने पर: G→H, A→B, R→S, D→E, E→F, N→O, अर्थात HBSEFO प्राप्त होता है।`,
    },
    commonTrap: {
      en: `A common mistake is to reverse the direction of the shift — subtracting one step instead of adding one — which produces FZQCDM (option B) instead of correctly moving each letter forward.`,
      hi: `एक आम गलती यह है कि खिसकाव की दिशा उल्टी मान ली जाती है — हर अक्षर को एक स्थान आगे बढ़ाने के बजाय एक स्थान पीछे कर दिया जाता है — जिससे सही उत्तर के बजाय FZQCDM (विकल्प B) प्राप्त होता है।`,
    },
    expectedTimeSeconds: 60,
  },
  {
    id: "reasoning-coding-decoding-2",
    section: "reasoning",
    concept: "Coding-Decoding",
    conceptLabel: { en: "Coding-Decoding", hi: "कूट लेखन एवं कूट वाचन" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: `In a certain code language, 'MARKET' is written as 'OCTMGV'. How will 'SILVER' be written in that code?`,
      hi: `एक निश्चित कूट भाषा में, 'MARKET' को 'OCTMGV' लिखा जाता है। उसी कूट में 'SILVER' को कैसे लिखा जाएगा?`,
    },
    options: [
      { id: "A", text: { en: "UKNXGT", hi: "UKNXGT" } },
      { id: "B", text: { en: "QGJTCP", hi: "QGJTCP" } },
      { id: "C", text: { en: "VLOYHU", hi: "VLOYHU" } },
      { id: "D", text: { en: "UKNXGS", hi: "UKNXGS" } },
    ],
    correctOptionId: "A",
    explanation: {
      en: `Each letter of the word is shifted two steps forward in the alphabet: M→O, A→C, R→T, K→M, E→G, T→V, giving MARKET → OCTMGV. Applying the same rule to SILVER: S→U, I→K, L→N, V→X, E→G, R→T, giving UKNXGT.`,
      hi: `शब्द के हर अक्षर को वर्णमाला में दो स्थान आगे खिसकाया गया है: M→O, A→C, R→T, K→M, E→G, T→V, जिससे MARKET → OCTMGV बनता है। यही नियम SILVER पर लगाने पर: S→U, I→K, L→N, V→X, E→G, R→T, अर्थात UKNXGT प्राप्त होता है।`,
    },
    commonTrap: {
      en: `A common mistake is to reverse the direction of the shift — subtracting two steps instead of adding two — which produces QGJTCP (option B) instead of correctly moving each letter forward.`,
      hi: `एक आम गलती यह है कि खिसकाव की दिशा उल्टी मान ली जाती है — हर अक्षर को दो स्थान आगे बढ़ाने के बजाय दो स्थान पीछे कर दिया जाता है — जिससे सही उत्तर के बजाय QGJTCP (विकल्प B) प्राप्त होता है।`,
    },
    expectedTimeSeconds: 60,
    retestOf: "reasoning-coding-decoding-1",
  },

  // ---------------------------------------------------------------------
  // 3. Series Completion
  // ---------------------------------------------------------------------
  {
    id: "reasoning-series-completion-1",
    section: "reasoning",
    concept: "Series Completion",
    conceptLabel: { en: "Series Completion", hi: "श्रृंखला पूर्ति" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: `Find the next number in the series: 5, 11, 23, 47, 95, ?`,
      hi: `निम्नलिखित श्रृंखला में अगली संख्या ज्ञात कीजिए: 5, 11, 23, 47, 95, ?`,
    },
    options: [
      { id: "A", text: { en: "189", hi: "189" } },
      { id: "B", text: { en: "190", hi: "190" } },
      { id: "C", text: { en: "191", hi: "191" } },
      { id: "D", text: { en: "192", hi: "192" } },
    ],
    correctOptionId: "C",
    explanation: {
      en: `Each term is obtained by doubling the previous term and adding 1: 5×2+1=11, 11×2+1=23, 23×2+1=47, 47×2+1=95, 95×2+1=191.`,
      hi: `प्रत्येक पद, पिछले पद को दोगुना करके उसमें 1 जोड़ने से प्राप्त होता है: 5×2+1=11, 11×2+1=23, 23×2+1=47, 47×2+1=95, 95×2+1=191।`,
    },
    commonTrap: {
      en: `A common mistake is to only double the previous term and forget to add 1, giving 95×2=190 (option B), which misses the constant addition in the pattern.`,
      hi: `एक आम गलती यह है कि पिछले पद को केवल दोगुना कर दिया जाता है और उसमें 1 जोड़ना भूल जाते हैं, जिससे 95×2=190 (विकल्प B) प्राप्त होता है, जबकि यह पैटर्न में जुड़ने वाले स्थिरांक (1) को नज़रअंदाज़ कर देता है।`,
    },
    expectedTimeSeconds: 55,
  },
  {
    id: "reasoning-series-completion-2",
    section: "reasoning",
    concept: "Series Completion",
    conceptLabel: { en: "Series Completion", hi: "श्रृंखला पूर्ति" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: `Find the next number in the series: 4, 11, 25, 53, 109, ?`,
      hi: `निम्नलिखित श्रृंखला में अगली संख्या ज्ञात कीजिए: 4, 11, 25, 53, 109, ?`,
    },
    options: [
      { id: "A", text: { en: "220", hi: "220" } },
      { id: "B", text: { en: "218", hi: "218" } },
      { id: "C", text: { en: "221", hi: "221" } },
      { id: "D", text: { en: "219", hi: "219" } },
    ],
    correctOptionId: "C",
    explanation: {
      en: `Each term is obtained by doubling the previous term and adding 3: 4×2+3=11, 11×2+3=25, 25×2+3=53, 53×2+3=109, 109×2+3=221.`,
      hi: `प्रत्येक पद, पिछले पद को दोगुना करके उसमें 3 जोड़ने से प्राप्त होता है: 4×2+3=11, 11×2+3=25, 25×2+3=53, 53×2+3=109, 109×2+3=221।`,
    },
    commonTrap: {
      en: `A common mistake is to only double the previous term and forget to add 3, giving 109×2=218 (option B), which misses the constant addition in the pattern.`,
      hi: `एक आम गलती यह है कि पिछले पद को केवल दोगुना कर दिया जाता है और उसमें 3 जोड़ना भूल जाते हैं, जिससे 109×2=218 (विकल्प B) प्राप्त होता है, जबकि यह पैटर्न में जुड़ने वाले स्थिरांक (3) को नज़रअंदाज़ कर देता है।`,
    },
    expectedTimeSeconds: 55,
    retestOf: "reasoning-series-completion-1",
  },

  // ---------------------------------------------------------------------
  // 4. Direction Sense
  // ---------------------------------------------------------------------
  {
    id: "reasoning-direction-sense-1",
    section: "reasoning",
    concept: "Direction Sense",
    conceptLabel: { en: "Direction Sense", hi: "दिशा ज्ञान" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: `Rahul starts from a point and walks 8 km towards North. He then turns right and walks 6 km. He then turns right again and walks 8 km. How far is he from his starting point, and in which direction?`,
      hi: `राहुल एक स्थान से चलना शुरू करता है और 8 km उत्तर की ओर चलता है। फिर वह दायें मुड़कर 6 km चलता है। फिर वह पुनः दायें मुड़कर 8 km चलता है। वह अपने प्रारंभिक स्थान से कितनी दूरी पर है, और किस दिशा में?`,
    },
    options: [
      { id: "A", text: { en: "6 km, West", hi: "6 km, पश्चिम" } },
      { id: "B", text: { en: "22 km, East", hi: "22 km, पूर्व" } },
      { id: "C", text: { en: "6 km, East", hi: "6 km, पूर्व" } },
      { id: "D", text: { en: "8 km, North", hi: "8 km, उत्तर" } },
    ],
    correctOptionId: "C",
    explanation: {
      en: `Take North as +y and East as +x. Start at (0,0). Walking 8 km North reaches (0,8). Facing North and turning right means now facing East; walking 6 km East reaches (6,8). Turning right again means now facing South; walking 8 km South reaches (6,0). The final point (6,0) is 6 km directly East of the start point (0,0).`,
      hi: `उत्तर को +y और पूर्व को +x मान लें। प्रारंभिक बिंदु (0,0) है। 8 km उत्तर चलने पर स्थिति (0,8) हो जाती है। उत्तर की ओर मुख करके दायें मुड़ने पर मुख अब पूर्व की ओर हो जाता है; 6 km पूर्व चलने पर स्थिति (6,8) हो जाती है। पुनः दायें मुड़ने पर मुख अब दक्षिण की ओर हो जाता है; 8 km दक्षिण चलने पर स्थिति (6,0) हो जाती है। अंतिम बिंदु (6,0), प्रारंभिक बिंदु (0,0) से ठीक 6 km पूर्व दिशा में है।`,
    },
    commonTrap: {
      en: `A common mistake is to add up the total distance actually walked (8+6+8=22 km) instead of calculating the straight-line displacement between the start and end points, leading to the wrong answer '22 km, East' (option B).`,
      hi: `एक आम गलती यह है कि शुरुआती और अंतिम बिंदु के बीच की सीधी दूरी निकालने के बजाय चली गई कुल दूरी (8+6+8=22 km) जोड़ दी जाती है, जिससे गलत उत्तर '22 km, पूर्व' (विकल्प B) चुन लिया जाता है।`,
    },
    expectedTimeSeconds: 65,
  },
  {
    id: "reasoning-direction-sense-2",
    section: "reasoning",
    concept: "Direction Sense",
    conceptLabel: { en: "Direction Sense", hi: "दिशा ज्ञान" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: `Priya starts from her house and walks 5 km towards South. She then turns left and walks 12 km. She then turns left again and walks 5 km. How far is she from her house, and in which direction?`,
      hi: `प्रिया अपने घर से चलना शुरू करती है और 5 km दक्षिण की ओर चलती है। फिर वह बायें मुड़कर 12 km चलती है। फिर वह पुनः बायें मुड़कर 5 km चलती है। वह अपने घर से कितनी दूरी पर है, और किस दिशा में?`,
    },
    options: [
      { id: "A", text: { en: "12 km, East", hi: "12 km, पूर्व" } },
      { id: "B", text: { en: "22 km, East", hi: "22 km, पूर्व" } },
      { id: "C", text: { en: "12 km, West", hi: "12 km, पश्चिम" } },
      { id: "D", text: { en: "5 km, South", hi: "5 km, दक्षिण" } },
    ],
    correctOptionId: "A",
    explanation: {
      en: `Take North as +y and East as +x. Start at (0,0). Walking 5 km South reaches (0,-5). Facing South and turning left means now facing East; walking 12 km East reaches (12,-5). Turning left again means now facing North; walking 5 km North reaches (12,0). The final point (12,0) is 12 km directly East of the house (0,0) — the two 5 km legs (South, then North) cancel each other out.`,
      hi: `उत्तर को +y और पूर्व को +x मान लें। प्रारंभिक बिंदु (घर) (0,0) है। 5 km दक्षिण चलने पर स्थिति (0,-5) हो जाती है। दक्षिण की ओर मुख करके बायें मुड़ने पर मुख अब पूर्व की ओर हो जाता है; 12 km पूर्व चलने पर स्थिति (12,-5) हो जाती है। पुनः बायें मुड़ने पर मुख अब उत्तर की ओर हो जाता है; 5 km उत्तर चलने पर स्थिति (12,0) हो जाती है। अंतिम बिंदु (12,0), घर (0,0) से ठीक 12 km पूर्व दिशा में है — दक्षिण और फिर उत्तर वाले दोनों 5 km के चरण एक-दूसरे को निरस्त कर देते हैं।`,
    },
    commonTrap: {
      en: `A common mistake is to add up the total distance actually walked (5+12+5=22 km) instead of calculating the net displacement from the house, leading to the wrong answer '22 km, East' (option B).`,
      hi: `एक आम गलती यह है कि घर से शुद्ध विस्थापन (नेट डिस्प्लेसमेंट) निकालने के बजाय चली गई कुल दूरी (5+12+5=22 km) जोड़ दी जाती है, जिससे गलत उत्तर '22 km, पूर्व' (विकल्प B) चुन लिया जाता है।`,
    },
    expectedTimeSeconds: 65,
    retestOf: "reasoning-direction-sense-1",
  },

  // ---------------------------------------------------------------------
  // 5. Syllogism
  // ---------------------------------------------------------------------
  {
    id: "reasoning-syllogism-1",
    section: "reasoning",
    concept: "Syllogism",
    conceptLabel: { en: "Syllogism", hi: "न्यायवाक्य" },
    difficulty: 3,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: `Statements: All pens are pencils. All pencils are erasers.\nConclusions: I. All pens are erasers. II. Some erasers are pens.\nWhich of the conclusions logically follow(s) from the statements?`,
      hi: `कथन: सभी पेन, पेंसिल हैं। सभी पेंसिल, रबड़ (इरेज़र) हैं।\nनिष्कर्ष: I. सभी पेन, रबड़ हैं। II. कुछ रबड़, पेन हैं।\nदिए गए कथनों के आधार पर कौन-सा/से निष्कर्ष तर्कसंगत रूप से निकलता/निकलते है/हैं?`,
    },
    options: [
      { id: "A", text: { en: "Both I and II follow", hi: "I और II दोनों निकलते हैं" } },
      { id: "B", text: { en: "Only I follows", hi: "केवल I निकलता है" } },
      { id: "C", text: { en: "Only II follows", hi: "केवल II निकलता है" } },
      { id: "D", text: { en: "Neither I nor II follows", hi: "न तो I और न ही II निकलता है" } },
    ],
    correctOptionId: "A",
    explanation: {
      en: `Since all pens are pencils, and all pencils are erasers, by transitivity all pens are erasers — so conclusion I follows. Also, since all pens are erasers, it follows that some erasers must be pens (a universal statement 'All A are B' always yields the particular conclusion 'Some B are A') — so conclusion II also follows. Hence both I and II follow.`,
      hi: `चूँकि सभी पेन, पेंसिल हैं और सभी पेंसिल, रबड़ हैं, इसलिए (सकर्मकता के नियम से) सभी पेन, रबड़ भी हैं — अतः निष्कर्ष I निकलता है। साथ ही, चूँकि सभी पेन, रबड़ हैं, इसलिए यह भी निश्चित है कि कुछ रबड़, पेन हैं (किसी सर्वव्यापी कथन 'सभी A, B हैं' से हमेशा विशेष निष्कर्ष 'कुछ B, A हैं' निकलता है) — अतः निष्कर्ष II भी निकलता है। इसलिए I और II दोनों निकलते हैं।`,
    },
    commonTrap: {
      en: `Many students accept only conclusion I and reject II, not realizing that a universal statement 'All A are B' always also yields the particular converse 'Some B are A' as a valid conclusion — this leads them to wrongly pick 'Only I follows' (option B).`,
      hi: `कई विद्यार्थी केवल निष्कर्ष I को स्वीकार करते हैं और II को अस्वीकार कर देते हैं, यह ध्यान दिए बिना कि किसी सर्वव्यापी कथन 'सभी A, B हैं' से हमेशा विलोम विशेष कथन 'कुछ B, A हैं' भी वैध निष्कर्ष के रूप में निकलता है — इस वजह से वे गलती से 'केवल I निकलता है' (विकल्प B) चुन लेते हैं।`,
    },
    expectedTimeSeconds: 85,
  },
  {
    id: "reasoning-syllogism-2",
    section: "reasoning",
    concept: "Syllogism",
    conceptLabel: { en: "Syllogism", hi: "न्यायवाक्य" },
    difficulty: 3,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: `Statements: All cups are plates. All plates are trays.\nConclusions: I. All cups are trays. II. Some trays are cups.\nWhich of the conclusions logically follow(s) from the statements?`,
      hi: `कथन: सभी कप, प्लेट हैं। सभी प्लेट, ट्रे हैं।\nनिष्कर्ष: I. सभी कप, ट्रे हैं। II. कुछ ट्रे, कप हैं।\nदिए गए कथनों के आधार पर कौन-सा/से निष्कर्ष तर्कसंगत रूप से निकलता/निकलते है/हैं?`,
    },
    options: [
      { id: "A", text: { en: "Only I follows", hi: "केवल I निकलता है" } },
      { id: "B", text: { en: "Both I and II follow", hi: "I और II दोनों निकलते हैं" } },
      { id: "C", text: { en: "Only II follows", hi: "केवल II निकलता है" } },
      { id: "D", text: { en: "Neither I nor II follows", hi: "न तो I और न ही II निकलता है" } },
    ],
    correctOptionId: "B",
    explanation: {
      en: `Since all cups are plates, and all plates are trays, by transitivity all cups are trays — so conclusion I follows. Also, since all cups are trays, it follows that some trays must be cups (a universal statement 'All A are B' always yields the particular conclusion 'Some B are A') — so conclusion II also follows. Hence both I and II follow.`,
      hi: `चूँकि सभी कप, प्लेट हैं और सभी प्लेट, ट्रे हैं, इसलिए (सकर्मकता के नियम से) सभी कप, ट्रे भी हैं — अतः निष्कर्ष I निकलता है। साथ ही, चूँकि सभी कप, ट्रे हैं, इसलिए यह भी निश्चित है कि कुछ ट्रे, कप हैं (किसी सर्वव्यापी कथन 'सभी A, B हैं' से हमेशा विशेष निष्कर्ष 'कुछ B, A हैं' निकलता है) — अतः निष्कर्ष II भी निकलता है। इसलिए I और II दोनों निकलते हैं।`,
    },
    commonTrap: {
      en: `Many students accept only conclusion I and reject II, not realizing that a universal statement 'All A are B' always also yields the particular converse 'Some B are A' as a valid conclusion — this leads them to wrongly pick 'Only I follows' (option A).`,
      hi: `कई विद्यार्थी केवल निष्कर्ष I को स्वीकार करते हैं और II को अस्वीकार कर देते हैं, यह ध्यान दिए बिना कि किसी सर्वव्यापी कथन 'सभी A, B हैं' से हमेशा विलोम विशेष कथन 'कुछ B, A हैं' भी वैध निष्कर्ष के रूप में निकलता है — इस वजह से वे गलती से 'केवल I निकलता है' (विकल्प A) चुन लेते हैं।`,
    },
    expectedTimeSeconds: 85,
    retestOf: "reasoning-syllogism-1",
  },

  // ---------------------------------------------------------------------
  // 6. Analogy
  // ---------------------------------------------------------------------
  {
    id: "reasoning-analogy-1",
    section: "reasoning",
    concept: "Analogy",
    conceptLabel: { en: "Analogy", hi: "सादृश्यता" },
    difficulty: 1,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: `Select the number that best completes the analogy: 8 : 64 :: 9 : ?`,
      hi: `उस संख्या का चयन करें जो निम्नलिखित सादृश्यता को पूर्ण करती है: 8 : 64 :: 9 : ?`,
    },
    options: [
      { id: "A", text: { en: "72", hi: "72" } },
      { id: "B", text: { en: "81", hi: "81" } },
      { id: "C", text: { en: "90", hi: "90" } },
      { id: "D", text: { en: "88", hi: "88" } },
    ],
    correctOptionId: "B",
    explanation: {
      en: `The relation is 'number : its square'. 8² = 64. Similarly, 9² = 81.`,
      hi: `यहाँ संबंध 'संख्या : उसका वर्ग' है। 8² = 64. इसी प्रकार, 9² = 81.`,
    },
    commonTrap: {
      en: `Students sometimes notice that 8×8=64 and mistakenly carry forward the multiplier 8 instead of recognizing the operation as squaring, computing 9×8=72 (option A) instead of 9²=81.`,
      hi: `कई विद्यार्थी यह देखकर कि 8×8=64 है, वर्ग (स्क्वायर) की क्रिया पहचानने के बजाय गुणक 8 को आगे भी उसी रूप में इस्तेमाल कर लेते हैं, जिससे वे 9²=81 के बजाय 9×8=72 (विकल्प A) निकाल लेते हैं।`,
    },
    expectedTimeSeconds: 45,
  },
  {
    id: "reasoning-analogy-2",
    section: "reasoning",
    concept: "Analogy",
    conceptLabel: { en: "Analogy", hi: "सादृश्यता" },
    difficulty: 1,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: `Select the number that best completes the analogy: 6 : 36 :: 11 : ?`,
      hi: `उस संख्या का चयन करें जो निम्नलिखित सादृश्यता को पूर्ण करती है: 6 : 36 :: 11 : ?`,
    },
    options: [
      { id: "A", text: { en: "121", hi: "121" } },
      { id: "B", text: { en: "66", hi: "66" } },
      { id: "C", text: { en: "111", hi: "111" } },
      { id: "D", text: { en: "132", hi: "132" } },
    ],
    correctOptionId: "A",
    explanation: {
      en: `The relation is 'number : its square'. 6² = 36. Similarly, 11² = 121.`,
      hi: `यहाँ संबंध 'संख्या : उसका वर्ग' है। 6² = 36. इसी प्रकार, 11² = 121.`,
    },
    commonTrap: {
      en: `Students sometimes notice that 6×6=36 and mistakenly carry forward the multiplier 6 instead of recognizing the operation as squaring, computing 11×6=66 (option B) instead of 11²=121.`,
      hi: `कई विद्यार्थी यह देखकर कि 6×6=36 है, वर्ग (स्क्वायर) की क्रिया पहचानने के बजाय गुणक 6 को आगे भी उसी रूप में इस्तेमाल कर लेते हैं, जिससे वे 11²=121 के बजाय 11×6=66 (विकल्प B) निकाल लेते हैं।`,
    },
    expectedTimeSeconds: 45,
    retestOf: "reasoning-analogy-1",
  },
];
