import { Question } from "../types";

export const englishQuestions: Question[] = [
  // ---------------------------------------------------------------------
  // 1. Reading Comprehension
  // ---------------------------------------------------------------------
  {
    id: "english-reading-comprehension-1",
    section: "english",
    concept: "Reading Comprehension",
    conceptLabel: { en: "Reading Comprehension", hi: "अपठित गद्यांश" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "Read the following passage and answer the question that follows.\n\nFor centuries, coral reefs have supported nearly a quarter of all marine species despite covering less than one percent of the ocean floor. Rising sea temperatures, however, cause corals to expel the algae living in their tissues, turning the reefs white in a process called bleaching. A bleached coral is not dead, but it is under severe stress and more likely to die if conditions do not improve quickly. Scientists warn that repeated bleaching events, occurring closer together each decade, leave reefs with less time to recover.\n\nQuestion: According to the passage, what happens to a coral during bleaching?",
      hi: "निम्नलिखित गद्यांश (अंग्रेज़ी में) पढ़िए और उसके बाद दिए गए प्रश्न का उत्तर दीजिए।\n\nFor centuries, coral reefs have supported nearly a quarter of all marine species despite covering less than one percent of the ocean floor. Rising sea temperatures, however, cause corals to expel the algae living in their tissues, turning the reefs white in a process called bleaching. A bleached coral is not dead, but it is under severe stress and more likely to die if conditions do not improve quickly. Scientists warn that repeated bleaching events, occurring closer together each decade, leave reefs with less time to recover.\n\nप्रश्न: गद्यांश के अनुसार, कोरल (प्रवाल) में bleaching के दौरान क्या होता है?",
    },
    options: [
      {
        id: "A",
        text: {
          en: "It dies immediately and cannot recover",
          hi: "इसकी तुरंत मृत्यु हो जाती है और यह पुनः स्वस्थ नहीं हो सकता",
        },
      },
      {
        id: "B",
        text: {
          en: "It expels the algae living in its tissues and turns white",
          hi: "यह अपने ऊतकों में रहने वाले शैवाल (algae) को बाहर निकाल देता है और सफेद पड़ जाता है",
        },
      },
      {
        id: "C",
        text: {
          en: "It grows additional algae to survive higher temperatures",
          hi: "यह अधिक तापमान से बचने के लिए अतिरिक्त शैवाल उगाता है",
        },
      },
      {
        id: "D",
        text: {
          en: "It sinks to a deeper, cooler part of the ocean",
          hi: "यह समुद्र के गहरे, ठंडे भाग में चला जाता है",
        },
      },
    ],
    correctOptionId: "B",
    explanation: {
      en: "The passage directly states that rising temperatures cause corals to 'expel the algae living in their tissues, turning the reefs white' — this is the definition of bleaching given in the passage. Option A is wrong because the passage explicitly says a bleached coral 'is not dead'. Always match comprehension answers to what the passage actually states, not to outside knowledge.",
      hi: "गद्यांश में स्पष्ट रूप से कहा गया है कि तापमान बढ़ने पर कोरल (प्रवाल) अपने ऊतकों (tissues) में रहने वाले शैवाल (algae) को बाहर निकाल देते हैं, जिससे वे सफेद पड़ जाते हैं — इसी प्रक्रिया को bleaching कहा गया है। विकल्प A गलत है क्योंकि गद्यांश स्पष्ट रूप से कहता है कि bleached coral 'मरा हुआ नहीं' होता। Reading Comprehension में उत्तर हमेशा गद्यांश में लिखी गई बात पर आधारित होना चाहिए, बाहरी सामान्य ज्ञान पर नहीं।",
    },
    commonTrap: {
      en: "Students conflate 'bleaching' with death because the passage mentions severe stress and a higher chance of dying, and wrongly pick option A. But the passage explicitly distinguishes between being bleached (stressed, discoloured) and being dead — these are two different stages, and only the first is described by the bleaching process itself.",
      hi: "छात्र अक्सर bleaching को मृत्यु के समान समझ लेते हैं क्योंकि गद्यांश में तनाव (stress) और मरने की अधिक संभावना का उल्लेख है, और गलती से विकल्प A चुन लेते हैं। जबकि गद्यांश स्पष्ट रूप से 'bleached होना' (तनावग्रस्त, सफेद पड़ जाना) और 'मर जाना' के बीच अंतर बताता है — ये दो अलग स्थितियाँ हैं, और bleaching की प्रक्रिया केवल पहली स्थिति का वर्णन करती है।",
    },
    expectedTimeSeconds: 90,
  },
  {
    id: "english-reading-comprehension-2",
    section: "english",
    concept: "Reading Comprehension",
    conceptLabel: { en: "Reading Comprehension", hi: "अपठित गद्यांश" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    retestOf: "english-reading-comprehension-1",
    text: {
      en: "Read the following passage and answer the question that follows.\n\nUrban beekeeping has grown rapidly in cities around the world over the last decade. Rooftop hives allow bees to pollinate parks, gardens, and street trees, which in turn boosts flowering plant yields nearby. Unlike rural hives, however, city bees face unique risks such as pesticide residue from ornamental plants and a limited foraging range due to concrete cover. Beekeeping associations now train volunteers to monitor hive health monthly so early signs of disease can be caught before they spread.\n\nQuestion: Based on the passage, what is one specific risk that urban bees face but rural bees typically do not encounter?",
      hi: "निम्नलिखित गद्यांश (अंग्रेज़ी में) पढ़िए और उसके बाद दिए गए प्रश्न का उत्तर दीजिए।\n\nUrban beekeeping has grown rapidly in cities around the world over the last decade. Rooftop hives allow bees to pollinate parks, gardens, and street trees, which in turn boosts flowering plant yields nearby. Unlike rural hives, however, city bees face unique risks such as pesticide residue from ornamental plants and a limited foraging range due to concrete cover. Beekeeping associations now train volunteers to monitor hive health monthly so early signs of disease can be caught before they spread.\n\nप्रश्न: गद्यांश के अनुसार, वह कौन-सा विशेष जोखिम है जो शहरी मधुमक्खियों (urban bees) को होता है परंतु सामान्यतः ग्रामीण मधुमक्खियों (rural bees) को नहीं होता?",
    },
    options: [
      {
        id: "A",
        text: { en: "Predation by birds", hi: "पक्षियों द्वारा शिकार किया जाना" },
      },
      {
        id: "B",
        text: {
          en: "Pesticide residue from ornamental plants",
          hi: "सजावटी पौधों (ornamental plants) से कीटनाशक के अवशेष",
        },
      },
      {
        id: "C",
        text: { en: "Extreme heat during summer", hi: "गर्मियों में अत्यधिक तापमान" },
      },
      {
        id: "D",
        text: {
          en: "Lack of any flowering plants nearby",
          hi: "आसपास फूल वाले पौधों का पूर्णतः न होना",
        },
      },
    ],
    correctOptionId: "B",
    explanation: {
      en: "The passage explicitly lists 'pesticide residue from ornamental plants' as one of the unique risks urban bees face, in direct contrast to rural hives. This is a directly stated fact, so the correct option must match the passage's exact wording rather than a plausible-sounding but unstated risk.",
      hi: "गद्यांश में स्पष्ट रूप से बताया गया है कि शहरी मधुमक्खियों के लिए pesticide residue from ornamental plants एक विशेष जोखिम है, जो ग्रामीण मधुमक्खी-पालन से अलग है। यह गद्यांश में सीधे लिखा गया तथ्य है, इसलिए सही उत्तर वही होगा जो गद्यांश के शब्दों से मेल खाता हो, न कि कोई प्रशंसनीय लेकिन अलिखित (unstated) जोखिम।",
    },
    commonTrap: {
      en: "Students often pick option D by over-extending the phrase 'limited foraging range due to concrete cover' to mean 'no flowering plants at all nearby' — but the passage only says the range is limited, not that flowering plants are absent. This is a classic misreading trap: turning a qualified statement ('limited') into an absolute one ('none').",
      hi: "छात्र प्रायः विकल्प D चुन लेते हैं क्योंकि वे 'limited foraging range due to concrete cover' पंक्ति का अति-सामान्यीकरण करके यह मान लेते हैं कि आसपास फूल वाले पौधे बिल्कुल नहीं हैं — जबकि गद्यांश केवल इतना कहता है कि दायरा सीमित है, यह नहीं कि पौधे पूरी तरह अनुपस्थित हैं। यह एक सामान्य misreading जाल है: एक सीमित (qualified) कथन को पूर्ण/निरपेक्ष (absolute) कथन मान लेना।",
    },
    expectedTimeSeconds: 95,
  },

  // ---------------------------------------------------------------------
  // 2. Error Spotting
  // ---------------------------------------------------------------------
  {
    id: "english-error-spotting-1",
    section: "english",
    concept: "Error Spotting",
    conceptLabel: { en: "Error Spotting", hi: "त्रुटि पहचानना" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "Read the sentence divided into three parts (A), (B) and (C). Identify which part contains a grammatical error. If the sentence has no error, choose option (D).\n\n(A) Each of the boys (B) have completed (C) his homework.",
      hi: "नीचे दिए गए वाक्य को तीन भागों (A), (B) और (C) में बाँटा गया है। यह पहचानिए कि किस भाग में व्याकरण संबंधी त्रुटि है। यदि वाक्य में कोई त्रुटि नहीं है, तो विकल्प (D) चुनिए। (वाक्य अंग्रेज़ी में ही दिया गया है)\n\n(A) Each of the boys (B) have completed (C) his homework.",
    },
    options: [
      { id: "A", text: { en: "Each of the boys", hi: "Each of the boys" } },
      { id: "B", text: { en: "have completed", hi: "have completed" } },
      { id: "C", text: { en: "his homework", hi: "his homework" } },
      { id: "D", text: { en: "No error", hi: "कोई त्रुटि नहीं" } },
    ],
    correctOptionId: "B",
    explanation: {
      en: "'Each' is a singular indefinite pronoun and always takes a singular verb, no matter how many nouns follow it in the 'of the ___' phrase. So the subject here is 'Each' (singular), and the verb must be 'has', not 'have'. The correct sentence is: 'Each of the boys has completed his homework.'",
      hi: "'Each' एक एकवचन (singular) indefinite pronoun है और इसके बाद 'of the ___' में चाहे जितने भी बहुवचन संज्ञा (plural noun) क्यों न आएं, क्रिया (verb) हमेशा एकवचन ही होगी। यहाँ वाक्य का वास्तविक कर्ता (subject) 'Each' है, इसलिए क्रिया 'has' होनी चाहिए, 'have' नहीं। सही वाक्य होगा: 'Each of the boys has completed his homework.'",
    },
    commonTrap: {
      en: "Students apply 'proximity agreement' — they match the verb to the noun physically closest to it ('boys', which is plural) instead of to the true grammatical subject ('Each', which is singular). This 'each/every/either/neither + of + plural noun' pattern is one of the most frequently tested subject-verb agreement traps in SSC exams.",
      hi: "छात्र प्रायः 'निकटता का नियम' (proximity agreement) लगा बैठते हैं — वे क्रिया को वाक्य के वास्तविक कर्ता 'Each' (एकवचन) के बजाय क्रिया के सबसे पास वाली संज्ञा 'boys' (बहुवचन) से मिला देते हैं। 'each/every/either/neither + of + plural noun' वाला यह प्रकार SSC परीक्षाओं में सबसे अधिक पूछे जाने वाले subject-verb agreement जालों में से एक है।",
    },
    expectedTimeSeconds: 60,
  },
  {
    id: "english-error-spotting-2",
    section: "english",
    concept: "Error Spotting",
    conceptLabel: { en: "Error Spotting", hi: "त्रुटि पहचानना" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    retestOf: "english-error-spotting-1",
    text: {
      en: "Read the sentence divided into three parts (A), (B) and (C). Identify which part contains a grammatical error. If the sentence has no error, choose option (D).\n\n(A) Neither of the answers (B) are correct (C) according to the teacher.",
      hi: "नीचे दिए गए वाक्य को तीन भागों (A), (B) और (C) में बाँटा गया है। यह पहचानिए कि किस भाग में व्याकरण संबंधी त्रुटि है। यदि वाक्य में कोई त्रुटि नहीं है, तो विकल्प (D) चुनिए। (वाक्य अंग्रेज़ी में ही दिया गया है)\n\n(A) Neither of the answers (B) are correct (C) according to the teacher.",
    },
    options: [
      { id: "A", text: { en: "Neither of the answers", hi: "Neither of the answers" } },
      { id: "B", text: { en: "are correct", hi: "are correct" } },
      { id: "C", text: { en: "according to the teacher", hi: "according to the teacher" } },
      { id: "D", text: { en: "No error", hi: "कोई त्रुटि नहीं" } },
    ],
    correctOptionId: "B",
    explanation: {
      en: "'Neither' (like 'each', 'every', 'either') is a singular indefinite pronoun and takes a singular verb, even when followed by a plural noun in an 'of the ___' phrase. The true subject here is 'Neither', so the verb must be 'is', not 'are'. The correct sentence is: 'Neither of the answers is correct according to the teacher.'",
      hi: "'Neither' (जैसे 'each', 'every', 'either') एक एकवचन indefinite pronoun है और इसके बाद भले ही 'of the ___' में बहुवचन संज्ञा (plural noun) आए, क्रिया एकवचन ही रहेगी। यहाँ वाक्य का वास्तविक कर्ता 'Neither' है, इसलिए क्रिया 'is' होनी चाहिए, 'are' नहीं। सही वाक्य होगा: 'Neither of the answers is correct according to the teacher.'",
    },
    commonTrap: {
      en: "As with 'each of', students match the verb to the nearer plural noun ('answers') instead of the singular subject 'Neither', producing 'are' instead of 'is'. Recognising that 'neither/either/each/every + of + plural noun' is always grammatically singular is the key fix for this recurring error.",
      hi: "'each of' की तरह ही, छात्र क्रिया को नज़दीकी बहुवचन संज्ञा 'answers' से मिला देते हैं, न कि एकवचन कर्ता 'Neither' से, जिससे वे गलती से 'are' चुन लेते हैं। यह याद रखना कि 'neither/either/each/every + of + plural noun' हमेशा व्याकरणिक रूप से एकवचन (singular) होता है, इस बार-बार होने वाली त्रुटि से बचने की कुंजी है।",
    },
    expectedTimeSeconds: 55,
  },

  // ---------------------------------------------------------------------
  // 3. Fill in the Blanks (Vocabulary/usage)
  // ---------------------------------------------------------------------
  {
    id: "english-fill-in-the-blanks-1",
    section: "english",
    concept: "Fill in the Blanks",
    conceptLabel: { en: "Fill in the Blanks", hi: "रिक्त स्थान भरें" },
    difficulty: 1,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "Fill in the blank with the most appropriate word.\n\nHe is married _______ a doctor.",
      hi: "रिक्त स्थान के लिए सबसे उपयुक्त शब्द चुनिए। (वाक्य अंग्रेज़ी में ही है; अर्थ: 'उसका विवाह एक डॉक्टर से हुआ है।' — यहाँ 'married' के साथ सही preposition/पूर्वसर्ग चुनना है)\n\nHe is married _______ a doctor.",
    },
    options: [
      { id: "A", text: { en: "with", hi: "with" } },
      { id: "B", text: { en: "to", hi: "to" } },
      { id: "C", text: { en: "by", hi: "by" } },
      { id: "D", text: { en: "for", hi: "for" } },
    ],
    correctOptionId: "B",
    explanation: {
      en: "'Married' takes the preposition 'to' when stating who a person is married to: 'married to a doctor/an engineer/each other.' 'Married with' is a common error — the only correct use of 'with' in this context is the fixed phrase 'married with children' (meaning 'having children'), which is a different construction altogether.",
      hi: "जब यह बताना हो कि किसी व्यक्ति की शादी किससे हुई है, तो 'married' के साथ preposition 'to' आता है: 'married to a doctor/an engineer/each other.' 'married with' एक आम गलती है — 'with' का सही प्रयोग केवल स्थिर वाक्यांश 'married with children' (अर्थात 'जिसके बच्चे हैं') में होता है, जो एक बिल्कुल अलग संरचना है।",
    },
    commonTrap: {
      en: "Students pick 'with' because it feels natural for togetherness/companionship, and because they half-remember the common idiom 'married with children' and wrongly generalise it to mean 'married with [any noun]'. The fixed collocation for a spouse is always 'married to'.",
      hi: "छात्र 'with' चुन लेते हैं क्योंकि यह साथ होने के भाव में स्वाभाविक लगता है, और वे प्रचलित मुहावरे 'married with children' को अधूरा याद रखकर इसे गलत तरीके से 'married with [कोई भी संज्ञा]' मान लेते हैं। जीवनसाथी (spouse) के लिए सही स्थिर संयोजन (collocation) हमेशा 'married to' ही है।",
    },
    expectedTimeSeconds: 40,
  },
  {
    id: "english-fill-in-the-blanks-2",
    section: "english",
    concept: "Fill in the Blanks",
    conceptLabel: { en: "Fill in the Blanks", hi: "रिक्त स्थान भरें" },
    difficulty: 1,
    marks: 2,
    negativeMarks: 0.5,
    retestOf: "english-fill-in-the-blanks-1",
    text: {
      en: "Fill in the blank with the most appropriate word.\n\nThe students were praised _______ their excellent performance in the annual sports meet.",
      hi: "रिक्त स्थान के लिए सबसे उपयुक्त शब्द चुनिए। (वाक्य अंग्रेज़ी में ही है; अर्थ: 'वार्षिक खेल दिवस में उनके उत्कृष्ट प्रदर्शन के लिए विद्यार्थियों की प्रशंसा की गई।' — यहाँ 'praised' के साथ सही preposition/पूर्वसर्ग चुनना है)\n\nThe students were praised _______ their excellent performance in the annual sports meet.",
    },
    options: [
      { id: "A", text: { en: "of", hi: "of" } },
      { id: "B", text: { en: "for", hi: "for" } },
      { id: "C", text: { en: "at", hi: "at" } },
      { id: "D", text: { en: "with", hi: "with" } },
    ],
    correctOptionId: "B",
    explanation: {
      en: "The verb 'praise' takes the preposition 'for' when specifying the reason or cause: 'praised for their performance/effort/courage.' This is a fixed collocation tested frequently in SSC exams.",
      hi: "क्रिया 'praise' के साथ जब कारण (reason) बताना हो, तो preposition 'for' आता है: 'praised for their performance/effort/courage.' यह एक स्थिर collocation है जो SSC परीक्षाओं में अक्सर पूछी जाती है।",
    },
    commonTrap: {
      en: "Students often pick 'at', wrongly transferring the pattern from the unrelated phrase 'good at something', or pick 'of' by loosely associating it with phrases like 'proud of'. Neither preposition combines correctly with 'praised' — the fixed pairing is always 'praised for'.",
      hi: "छात्र प्रायः 'at' चुन लेते हैं, क्योंकि वे इसे असंबंधित वाक्यांश 'good at something' के ढाँचे से जोड़ बैठते हैं, या 'of' चुन लेते हैं क्योंकि यह 'proud of' जैसे वाक्यांशों से मिलता-जुलता लगता है। इनमें से कोई भी preposition 'praised' के साथ सही ढंग से नहीं जुड़ता — सही और स्थिर संयोजन हमेशा 'praised for' ही है।",
    },
    expectedTimeSeconds: 40,
  },

  // ---------------------------------------------------------------------
  // 4. Synonym / Antonym
  // ---------------------------------------------------------------------
  {
    id: "english-synonym-antonym-1",
    section: "english",
    concept: "Synonym-Antonym",
    conceptLabel: { en: "Synonym / Antonym", hi: "पर्यायवाची / विलोम शब्द" },
    difficulty: 1,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "Select the word that is most nearly SIMILAR in meaning to the word given in capital letters, as used in the sentence below.\n\nCANDID\n\nSentence: The interviewer appreciated her CANDID response.",
      hi: "नीचे दिए गए वाक्य में प्रयुक्त बड़े अक्षरों वाले शब्द के सबसे निकट समानार्थी (synonym) शब्द का चयन कीजिए।\n\nCANDID (हिंदी अर्थ: स्पष्टवादी, निष्कपट, खरा)\n\nवाक्य: The interviewer appreciated her CANDID response.",
    },
    options: [
      { id: "A", text: { en: "Frank", hi: "Frank" } },
      { id: "B", text: { en: "Confused", hi: "Confused" } },
      { id: "C", text: { en: "Rude", hi: "Rude" } },
      { id: "D", text: { en: "Lengthy", hi: "Lengthy" } },
    ],
    correctOptionId: "A",
    explanation: {
      en: "'Candid' means truthful, sincere, and straightforward, without hiding one's real opinion. 'Frank' means exactly this — open and honest in expression — making it the correct synonym. It carries no negative connotation of impoliteness.",
      hi: "'Candid' का अर्थ है सच्चा, निष्कपट और स्पष्ट — अपनी वास्तविक राय को बिना छुपाए कहना। 'Frank' का भी ठीक यही अर्थ है — खुलकर और ईमानदारी से बात कहना — इसलिए यह सही समानार्थी शब्द है। इसमें असभ्यता (impoliteness) जैसा कोई नकारात्मक भाव नहीं है।",
    },
    commonTrap: {
      en: "Students confuse 'candid' (honest and open) with 'rude' (blunt and disrespectful) because both can involve saying something direct — but 'candid' is a positive quality (sincerity), while 'rude' is a negative one (lack of manners). The two are not interchangeable.",
      hi: "छात्र 'candid' (ईमानदार और खुला) को 'rude' (रूखा और असभ्य) समझ बैठते हैं, क्योंकि दोनों में सीधी बात कहना शामिल हो सकता है — लेकिन 'candid' एक सकारात्मक गुण (सच्चाई) है, जबकि 'rude' एक नकारात्मक गुण (शिष्टाचार की कमी) है। दोनों शब्द एक-दूसरे के स्थान पर प्रयोग नहीं किए जा सकते।",
    },
    expectedTimeSeconds: 40,
  },
  {
    id: "english-synonym-antonym-2",
    section: "english",
    concept: "Synonym-Antonym",
    conceptLabel: { en: "Synonym / Antonym", hi: "पर्यायवाची / विलोम शब्द" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    retestOf: "english-synonym-antonym-1",
    text: {
      en: "Select the word that is most nearly OPPOSITE in meaning to the word given in capital letters, as used in the sentence below.\n\nDILIGENT\n\nSentence: The manager was impressed by his DILIGENT approach to every task.",
      hi: "नीचे दिए गए वाक्य में प्रयुक्त बड़े अक्षरों वाले शब्द के सबसे निकट विलोम (antonym) शब्द का चयन कीजिए।\n\nDILIGENT (हिंदी अर्थ: परिश्रमी, मेहनती, सावधान)\n\nवाक्य: The manager was impressed by his DILIGENT approach to every task.",
    },
    options: [
      { id: "A", text: { en: "Careless", hi: "Careless" } },
      { id: "B", text: { en: "Sincere", hi: "Sincere" } },
      { id: "C", text: { en: "Punctual", hi: "Punctual" } },
      { id: "D", text: { en: "Skilled", hi: "Skilled" } },
    ],
    correctOptionId: "A",
    explanation: {
      en: "'Diligent' means showing careful and persistent effort in one's work. Its direct opposite is 'careless' — showing a lack of attention or effort. 'Sincere', 'punctual' and 'skilled' describe other, unrelated positive qualities and are not opposites of 'diligent'.",
      hi: "'Diligent' का अर्थ है अपने कार्य में सावधानी और निरंतर प्रयास दिखाना। इसका सीधा विलोम 'careless' है — जिसका अर्थ है ध्यान या प्रयास की कमी। 'Sincere', 'punctual' और 'skilled' अन्य असंबंधित सकारात्मक गुणों को दर्शाते हैं और ये 'diligent' के विलोम नहीं हैं।",
    },
    commonTrap: {
      en: "Students sometimes pick 'skilled' or 'punctual', reasoning that since these are 'different' from diligence they must be its opposite. But an antonym must directly negate the core meaning of the word (careful effort), not simply be an unrelated trait — only 'careless' does that.",
      hi: "छात्र कभी-कभी 'skilled' या 'punctual' चुन लेते हैं, यह सोचकर कि चूँकि ये diligence से अलग हैं इसलिए इसके विलोम होंगे। लेकिन विलोम (antonym) वह शब्द होता है जो मूल शब्द के मूल भाव (सावधानीपूर्ण प्रयास) को सीधे नकारता हो, केवल कोई असंबंधित गुण नहीं — यह काम केवल 'careless' ही करता है।",
    },
    expectedTimeSeconds: 45,
  },

  // ---------------------------------------------------------------------
  // 5. Sentence Improvement
  // ---------------------------------------------------------------------
  {
    id: "english-sentence-improvement-1",
    section: "english",
    concept: "Sentence Improvement",
    conceptLabel: { en: "Sentence Improvement", hi: "वाक्य सुधार" },
    difficulty: 3,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "Select the most appropriate improvement for the underlined part of the sentence. If the sentence is already correct, select option (D) 'No improvement'.\n\nSentence: If I would have known about the traffic, I would have left earlier.\n(Underlined part: 'If I would have known')",
      hi: "वाक्य के रेखांकित (underlined) भाग के लिए सबसे उपयुक्त सुधार चुनिए। यदि वाक्य पहले से ही सही है, तो विकल्प (D) 'No improvement' चुनिए। (वाक्य अंग्रेज़ी में ही है)\n\nवाक्य: If I would have known about the traffic, I would have left earlier.\n(रेखांकित भाग: 'If I would have known')",
    },
    options: [
      { id: "A", text: { en: "If I had known", hi: "If I had known" } },
      { id: "B", text: { en: "If I have known", hi: "If I have known" } },
      { id: "C", text: { en: "If I would know", hi: "If I would know" } },
      { id: "D", text: { en: "No improvement", hi: "No improvement" } },
    ],
    correctOptionId: "A",
    explanation: {
      en: "This is a third conditional sentence, used for an unreal/hypothetical situation in the past. Its correct structure is: 'If + subject + had + past participle, subject + would have + past participle.' So the 'if' clause must use 'had known', not 'would have known'. Correct sentence: 'If I had known about the traffic, I would have left earlier.'",
      hi: "यह एक third conditional वाक्य है, जिसका प्रयोग अतीत की किसी काल्पनिक/अवास्तविक स्थिति के लिए होता है। इसकी सही संरचना है: 'If + subject + had + past participle, subject + would have + past participle।' इसलिए 'if' वाले खंड (clause) में 'had known' आना चाहिए, 'would have known' नहीं। सही वाक्य: 'If I had known about the traffic, I would have left earlier.'",
    },
    commonTrap: {
      en: "Students assume both clauses should use 'would have' for the sake of parallelism/consistency, not realising that in conditional sentences the 'if' clause and the main clause follow different, fixed patterns — 'had + past participle' in the if-clause, and 'would have + past participle' only in the main clause. Using 'would have' in the if-clause ('would have known') is one of the most common conditional-sentence errors, even in casual native speech.",
      hi: "छात्र यह मान लेते हैं कि दोनों खंडों (clauses) में एकरूपता (parallelism) बनाए रखने के लिए 'would have' आना चाहिए, यह न समझते हुए कि conditional वाक्यों में 'if' वाला खंड और मुख्य खंड (main clause) अलग-अलग निश्चित पैटर्न का पालन करते हैं — if-clause में 'had + past participle' और केवल main clause में 'would have + past participle'। if-clause में 'would have' का प्रयोग ('would have known') सबसे आम conditional-sentence त्रुटियों में से एक है, यहाँ तक कि सामान्य बोलचाल में भी।",
    },
    expectedTimeSeconds: 75,
  },
  {
    id: "english-sentence-improvement-2",
    section: "english",
    concept: "Sentence Improvement",
    conceptLabel: { en: "Sentence Improvement", hi: "वाक्य सुधार" },
    difficulty: 3,
    marks: 2,
    negativeMarks: 0.5,
    retestOf: "english-sentence-improvement-1",
    text: {
      en: "Select the most appropriate improvement for the underlined part of the sentence. If the sentence is already correct, select option (D) 'No improvement'.\n\nSentence: If she would have studied harder, she would have passed the exam.\n(Underlined part: 'If she would have studied harder')",
      hi: "वाक्य के रेखांकित (underlined) भाग के लिए सबसे उपयुक्त सुधार चुनिए। यदि वाक्य पहले से ही सही है, तो विकल्प (D) 'No improvement' चुनिए। (वाक्य अंग्रेज़ी में ही है)\n\nवाक्य: If she would have studied harder, she would have passed the exam.\n(रेखांकित भाग: 'If she would have studied harder')",
    },
    options: [
      { id: "A", text: { en: "If she had studied harder", hi: "If she had studied harder" } },
      { id: "B", text: { en: "If she has studied harder", hi: "If she has studied harder" } },
      { id: "C", text: { en: "If she would study harder", hi: "If she would study harder" } },
      { id: "D", text: { en: "No improvement", hi: "No improvement" } },
    ],
    correctOptionId: "A",
    explanation: {
      en: "As in every third conditional sentence, the 'if' clause needs 'had + past participle' ('had studied'), while 'would have + past participle' belongs only in the main clause ('would have passed'). Correct sentence: 'If she had studied harder, she would have passed the exam.'",
      hi: "हर third conditional वाक्य की तरह, 'if' वाले खंड में 'had + past participle' ('had studied') आना चाहिए, जबकि 'would have + past participle' केवल main clause में आता है ('would have passed')। सही वाक्य: 'If she had studied harder, she would have passed the exam.'",
    },
    commonTrap: {
      en: "As before, students mistakenly repeat 'would have' in the if-clause for apparent consistency with the main clause, instead of switching to the required 'had + past participle' form. Recognising this exact if-clause/main-clause split is the key skill being retested here.",
      hi: "पहले जैसी गलती दोहराते हुए, छात्र main clause से एकरूपता दिखाने के लिए if-clause में भी गलती से 'would have' दोहरा देते हैं, जबकि वहाँ आवश्यक रूप 'had + past participle' होना चाहिए। if-clause और main clause के इसी सटीक विभाजन को पहचानना ही यहाँ दोबारा परखा जा रहा कौशल है।",
    },
    expectedTimeSeconds: 75,
  },

  // ---------------------------------------------------------------------
  // 6. One Word Substitution
  // ---------------------------------------------------------------------
  {
    id: "english-one-word-substitution-1",
    section: "english",
    concept: "One Word Substitution",
    conceptLabel: { en: "One Word Substitution", hi: "एक शब्द प्रतिस्थापन" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "Choose the one word which can most appropriately replace the given phrase.\n\nA person who can speak many languages.",
      hi: "दिए गए वाक्यांश के लिए सबसे उपयुक्त एक शब्द चुनिए।\n\nA person who can speak many languages. (हिंदी अर्थ: वह व्यक्ति जो कई भाषाएँ बोल सकता है)",
    },
    options: [
      { id: "A", text: { en: "Linguist", hi: "Linguist" } },
      { id: "B", text: { en: "Polyglot", hi: "Polyglot" } },
      { id: "C", text: { en: "Bilingual", hi: "Bilingual" } },
      { id: "D", text: { en: "Translator", hi: "Translator" } },
    ],
    correctOptionId: "B",
    explanation: {
      en: "'Polyglot' precisely means a person who knows or can speak several languages. 'Linguist' studies the science of language and need not speak many languages; 'bilingual' refers to only two languages, not many; and a 'translator' converts text from one language into another, which is a different skill.",
      hi: "'Polyglot' का सटीक अर्थ है वह व्यक्ति जो कई भाषाएँ जानता या बोल सकता है। 'Linguist' भाषा-विज्ञान (भाषा के वैज्ञानिक अध्ययन) से जुड़ा व्यक्ति होता है, जरूरी नहीं कि वह कई भाषाएँ बोलता हो; 'bilingual' केवल दो भाषाओं को दर्शाता है, कई को नहीं; और 'translator' एक भाषा के पाठ को दूसरी भाषा में बदलने वाला व्यक्ति होता है, जो एक अलग कौशल है।",
    },
    commonTrap: {
      en: "Students often confuse 'polyglot' with 'linguist' because both words relate to language, but a linguist is an academic who studies the structure and science of language(s), which is entirely different from being able to actually speak many languages fluently.",
      hi: "छात्र प्रायः 'polyglot' को 'linguist' समझ बैठते हैं क्योंकि दोनों शब्द भाषा से संबंधित हैं, लेकिन 'linguist' एक ऐसा विद्वान होता है जो भाषा (भाषाओं) की संरचना और विज्ञान का अध्ययन करता है, जो वास्तव में कई भाषाएँ धाराप्रवाह बोल पाने की क्षमता से बिल्कुल अलग बात है।",
    },
    expectedTimeSeconds: 45,
  },
  {
    id: "english-one-word-substitution-2",
    section: "english",
    concept: "One Word Substitution",
    conceptLabel: { en: "One Word Substitution", hi: "एक शब्द प्रतिस्थापन" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    retestOf: "english-one-word-substitution-1",
    text: {
      en: "Choose the one word which can most appropriately replace the given phrase.\n\nA person who loves and collects books.",
      hi: "दिए गए वाक्यांश के लिए सबसे उपयुक्त एक शब्द चुनिए।\n\nA person who loves and collects books. (हिंदी अर्थ: वह व्यक्ति जिसे पुस्तकें पसंद हैं और वह उन्हें एकत्र करता है)",
    },
    options: [
      { id: "A", text: { en: "Philanthropist", hi: "Philanthropist" } },
      { id: "B", text: { en: "Bibliophile", hi: "Bibliophile" } },
      { id: "C", text: { en: "Bibliographer", hi: "Bibliographer" } },
      { id: "D", text: { en: "Antiquarian", hi: "Antiquarian" } },
    ],
    correctOptionId: "B",
    explanation: {
      en: "'Bibliophile' means a person who loves or collects books ('biblio-' = book, '-phile' = lover of). A 'bibliographer' compiles lists of books/references but doesn't necessarily love or collect them; an 'antiquarian' collects old or rare objects in general, not specifically books; and a 'philanthropist' is someone who donates to charitable causes, unrelated to books.",
      hi: "'Bibliophile' का अर्थ है वह व्यक्ति जो पुस्तकों से प्रेम करता है या उन्हें एकत्र करता है ('biblio-' = पुस्तक, '-phile' = प्रेमी)। 'Bibliographer' पुस्तकों/संदर्भों की सूची (bibliography) तैयार करता है, जरूरी नहीं कि वह उनसे प्रेम करे या उन्हें एकत्र करे; 'antiquarian' सामान्यतः पुरानी या दुर्लभ वस्तुओं का संग्रहकर्ता होता है, विशेष रूप से पुस्तकों का नहीं; और 'philanthropist' परोपकारी कार्यों के लिए दान देने वाला व्यक्ति होता है, जिसका पुस्तकों से कोई संबंध नहीं।",
    },
    commonTrap: {
      en: "Students confuse 'bibliophile' with 'bibliographer' because both share the root 'biblio-' (book), without noticing that the suffixes carry very different meanings: '-phile' means 'lover of', while '-grapher' means 'one who writes/compiles' — a bibliographer catalogues books professionally, but may feel no personal love for them at all.",
      hi: "छात्र 'bibliophile' को 'bibliographer' समझ बैठते हैं क्योंकि दोनों में 'biblio-' (पुस्तक) मूल (root) समान है, यह ध्यान दिए बिना कि प्रत्यय (suffix) का अर्थ बिल्कुल अलग है: '-phile' का अर्थ है 'प्रेमी', जबकि '-grapher' का अर्थ है 'लिखने/संकलित करने वाला' — एक bibliographer व्यावसायिक रूप से पुस्तकों की सूची बनाता है, पर हो सकता है उसे उनसे कोई व्यक्तिगत लगाव न हो।",
    },
    expectedTimeSeconds: 45,
  },
];
