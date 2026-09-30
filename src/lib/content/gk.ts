import { Question } from "../types";

// General Awareness (GK) question bank.
// 6 concepts x 2 questions each (12 total). Each pair is a "diagnostic" question
// followed by a delayed, unseen "retest" variant (same concept, a genuinely
// different underlying fact) — the retest question sets `retestOf` to the
// diagnostic question's id.
//
// Every fact below is a well-established, stable/evergreen fact (no current
// affairs, no "current officeholder" claims, nothing that can go stale).

export const gkQuestions: Question[] = [
  // ---------------------------------------------------------------------
  // 1. Indian History
  // ---------------------------------------------------------------------
  {
    id: "gk-indian-history-1",
    section: "gk",
    concept: "Indian History",
    conceptLabel: { en: "Indian History", hi: "भारतीय इतिहास" },
    difficulty: 1,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "Who founded the Mauryan Empire, which was later expanded by his grandson Ashoka?",
      hi: "मौर्य साम्राज्य की स्थापना किसने की थी, जिसका विस्तार बाद में उनके पौत्र अशोक ने किया?",
    },
    options: [
      { id: "A", text: { en: "Bindusara", hi: "बिन्दुसार" } },
      { id: "B", text: { en: "Chandragupta Maurya", hi: "चंद्रगुप्त मौर्य" } },
      { id: "C", text: { en: "Chandragupta II", hi: "चंद्रगुप्त द्वितीय" } },
      { id: "D", text: { en: "Samudragupta", hi: "समुद्रगुप्त" } },
    ],
    correctOptionId: "B",
    explanation: {
      en: "Chandragupta Maurya founded the Mauryan Empire around 322 BCE with the guidance of Chanakya, after overthrowing the Nanda dynasty. His grandson Ashoka later expanded it into one of the largest empires in ancient India.",
      hi: "चंद्रगुप्त मौर्य ने चाणक्य के मार्गदर्शन में नंद वंश को हराकर लगभग 322 ईसा पूर्व मौर्य साम्राज्य की स्थापना की थी। उनके पौत्र अशोक ने बाद में इसे प्राचीन भारत के सबसे बड़े साम्राज्यों में से एक बना दिया।",
    },
    commonTrap: {
      en: "Students often confuse Chandragupta Maurya (founder of the Mauryan Empire, 4th century BCE) with Chandragupta II 'Vikramaditya' of the Gupta dynasty, who ruled centuries later and belonged to a completely different empire.",
      hi: "छात्र प्रायः मौर्य साम्राज्य के संस्थापक चंद्रगुप्त मौर्य (चौथी शताब्दी ईसा पूर्व) को गुप्त वंश के चंद्रगुप्त द्वितीय 'विक्रमादित्य' समझ लेते हैं, जो सदियों बाद एक बिल्कुल अलग साम्राज्य के शासक थे।",
    },
    expectedTimeSeconds: 35,
  },
  {
    id: "gk-indian-history-2",
    section: "gk",
    concept: "Indian History",
    conceptLabel: { en: "Indian History", hi: "भारतीय इतिहास" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "The mass uprising of 1857, widely regarded as India's First War of Independence, is generally said to have begun with a sepoy mutiny at which garrison town?",
      hi: "1857 का व्यापक विद्रोह, जिसे प्रायः भारत का प्रथम स्वतंत्रता संग्राम कहा जाता है, सामान्यतः किस छावनी शहर में सैनिकों के विद्रोह से प्रारंभ हुआ माना जाता है?",
    },
    options: [
      { id: "A", text: { en: "Barrackpore", hi: "बैरकपुर" } },
      { id: "B", text: { en: "Lucknow", hi: "लखनऊ" } },
      { id: "C", text: { en: "Meerut", hi: "मेरठ" } },
      { id: "D", text: { en: "Kanpur", hi: "कानपुर" } },
    ],
    correctOptionId: "C",
    explanation: {
      en: "The 1857 uprising is generally dated to 10 May 1857, when sepoys at Meerut mutinied, freed their imprisoned comrades, and marched to Delhi. This is treated as the formal start of the widespread rebellion.",
      hi: "1857 के विद्रोह की शुरुआत सामान्यतः 10 मई 1857 से मानी जाती है, जब मेरठ में सैनिकों ने विद्रोह कर अपने बंदी साथियों को रिहा किया और दिल्ली की ओर कूच किया। इसे व्यापक विद्रोह की औपचारिक शुरुआत माना जाता है।",
    },
    commonTrap: {
      en: "Students often confuse this with Barrackpore, where sepoy Mangal Pandey individually defied orders in March 1857 — an important early precursor, but the organised mass mutiny that triggered the wider rebellion is credited to Meerut in May 1857.",
      hi: "छात्र प्रायः इसे बैरकपुर समझ लेते हैं, जहाँ सैनिक मंगल पांडे ने मार्च 1857 में अकेले आदेश की अवहेलना की थी — यह एक महत्वपूर्ण प्रारंभिक घटना थी, परंतु व्यापक विद्रोह को जन्म देने वाला संगठित सामूहिक विद्रोह मई 1857 में मेरठ से जुड़ा माना जाता है।",
    },
    expectedTimeSeconds: 45,
    retestOf: "gk-indian-history-1",
  },

  // ---------------------------------------------------------------------
  // 2. Geography (Indian, physical/political)
  // ---------------------------------------------------------------------
  {
    id: "gk-geography-1",
    section: "gk",
    concept: "Geography",
    conceptLabel: { en: "Geography", hi: "भूगोल" },
    difficulty: 1,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "Which river is generally regarded as the longest river flowing within India?",
      hi: "किस नदी को सामान्यतः भारत के भीतर बहने वाली सबसे लंबी नदी माना जाता है?",
    },
    options: [
      { id: "A", text: { en: "Ganga", hi: "गंगा" } },
      { id: "B", text: { en: "Godavari", hi: "गोदावरी" } },
      { id: "C", text: { en: "Yamuna", hi: "यमुना" } },
      { id: "D", text: { en: "Narmada", hi: "नर्मदा" } },
    ],
    correctOptionId: "A",
    explanation: {
      en: "The Ganga, originating from the Gangotri glacier in the Himalayas, flows for about 2,525 km almost entirely within India and is regarded as the longest river in the country.",
      hi: "गंगा नदी हिमालय के गंगोत्री हिमनद से निकलकर लगभग 2,525 किलोमीटर तक बहती है, जो लगभग पूरी तरह भारत के भीतर ही है, और इसे देश की सबसे लंबी नदी माना जाता है।",
    },
    commonTrap: {
      en: "Some students pick the Indus instead, since its total length (including the part in Pakistan) is greater than the Ganga's — but only a small stretch of the Indus actually flows within India, so within Indian territory the Ganga is longer.",
      hi: "कुछ छात्र सिंधु नदी को चुन लेते हैं, क्योंकि उसकी कुल लंबाई (पाकिस्तान वाले हिस्से सहित) गंगा से अधिक है — परंतु सिंधु का केवल एक छोटा हिस्सा ही भारत में बहता है, इसलिए भारतीय क्षेत्र में गंगा ही अधिक लंबी नदी है।",
    },
    expectedTimeSeconds: 40,
  },
  {
    id: "gk-geography-2",
    section: "gk",
    concept: "Geography",
    conceptLabel: { en: "Geography", hi: "भूगोल" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "Which peak, located on the India-Nepal border in Sikkim, is the highest mountain peak lying within Indian territory?",
      hi: "सिक्किम में भारत-नेपाल सीमा पर स्थित कौन-सी चोटी भारतीय क्षेत्र में स्थित सबसे ऊँची पर्वत चोटी है?",
    },
    options: [
      { id: "A", text: { en: "Nanda Devi", hi: "नंदा देवी" } },
      { id: "B", text: { en: "Mount Everest", hi: "माउंट एवरेस्ट" } },
      { id: "C", text: { en: "K2 (Godwin Austen)", hi: "के2 (गॉडविन ऑस्टिन)" } },
      { id: "D", text: { en: "Kangchenjunga", hi: "कंचनजंगा" } },
    ],
    correctOptionId: "D",
    explanation: {
      en: "Kangchenjunga, on the Sikkim-Nepal border, is 8,586 m high and is the highest peak located within India as well as the third-highest peak in the world.",
      hi: "कंचनजंगा, जो सिक्किम-नेपाल सीमा पर स्थित है, 8,586 मीटर ऊँची है और यह भारत में स्थित सबसे ऊँची चोटी होने के साथ-साथ विश्व की तीसरी सबसे ऊँची चोटी भी है।",
    },
    commonTrap: {
      en: "Many students wrongly pick Mount Everest, believing it lies in India — Everest is actually the world's highest peak, but it sits on the Nepal-China (Tibet) border, entirely outside Indian territory.",
      hi: "कई छात्र गलती से माउंट एवरेस्ट चुन लेते हैं, यह मानकर कि वह भारत में स्थित है — एवरेस्ट वास्तव में विश्व की सबसे ऊँची चोटी है, परंतु यह नेपाल-चीन (तिब्बत) सीमा पर स्थित है, जो पूरी तरह भारतीय क्षेत्र से बाहर है।",
    },
    expectedTimeSeconds: 40,
    retestOf: "gk-geography-1",
  },

  // ---------------------------------------------------------------------
  // 3. Polity and Constitution
  // ---------------------------------------------------------------------
  {
    id: "gk-polity-1",
    section: "gk",
    concept: "Polity and Constitution",
    conceptLabel: { en: "Polity and Constitution", hi: "राजव्यवस्था और संविधान" },
    difficulty: 3,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "As per the Indian Constitution currently in force, how many Fundamental Rights are guaranteed to citizens?",
      hi: "वर्तमान में लागू भारतीय संविधान के अनुसार, नागरिकों को कितने मौलिक अधिकार प्रदान किए गए हैं?",
    },
    options: [
      { id: "A", text: { en: "7", hi: "7" } },
      { id: "B", text: { en: "6", hi: "6" } },
      { id: "C", text: { en: "9", hi: "9" } },
      { id: "D", text: { en: "5", hi: "5" } },
    ],
    correctOptionId: "B",
    explanation: {
      en: "The Constitution currently guarantees 6 Fundamental Rights: Right to Equality, Right to Freedom, Right against Exploitation, Right to Freedom of Religion, Cultural and Educational Rights, and Right to Constitutional Remedies. The Right to Property, originally a Fundamental Right, was removed by the 44th Amendment (1978) and made a legal right under Article 300A.",
      hi: "संविधान वर्तमान में 6 मौलिक अधिकारों की गारंटी देता है: समता का अधिकार, स्वतंत्रता का अधिकार, शोषण के विरुद्ध अधिकार, धार्मिक स्वतंत्रता का अधिकार, संस्कृति और शिक्षा संबंधी अधिकार, तथा संवैधानिक उपचारों का अधिकार। संपत्ति का अधिकार, जो मूल रूप से एक मौलिक अधिकार था, 44वें संशोधन (1978) द्वारा हटाकर अनुच्छेद 300A के अंतर्गत एक विधिक अधिकार बना दिया गया।",
    },
    commonTrap: {
      en: "Many students still answer '7', recalling the original count from before 1978 — they forget that the 44th Constitutional Amendment removed the Right to Property from the list of Fundamental Rights, bringing the current total down to 6.",
      hi: "कई छात्र अब भी '7' उत्तर देते हैं, क्योंकि उन्हें 1978 से पहले की मूल संख्या याद रहती है — वे यह भूल जाते हैं कि 44वें संविधान संशोधन द्वारा संपत्ति के अधिकार को मौलिक अधिकारों की सूची से हटा दिया गया था, जिससे वर्तमान संख्या घटकर 6 रह गई।",
    },
    expectedTimeSeconds: 50,
  },
  {
    id: "gk-polity-2",
    section: "gk",
    concept: "Polity and Constitution",
    conceptLabel: { en: "Polity and Constitution", hi: "राजव्यवस्था और संविधान" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "Who is popularly known as the 'Father of the Indian Constitution' for chairing the Drafting Committee of the Constituent Assembly?",
      hi: "संविधान सभा की प्रारूप समिति (ड्राफ्टिंग कमेटी) की अध्यक्षता करने के कारण किसे 'भारतीय संविधान का जनक' कहा जाता है?",
    },
    options: [
      { id: "A", text: { en: "Dr. B.R. Ambedkar", hi: "डॉ. बी.आर. अंबेडकर" } },
      { id: "B", text: { en: "Dr. Rajendra Prasad", hi: "डॉ. राजेंद्र प्रसाद" } },
      { id: "C", text: { en: "Jawaharlal Nehru", hi: "जवाहरलाल नेहरू" } },
      { id: "D", text: { en: "Sardar Vallabhbhai Patel", hi: "सरदार वल्लभभाई पटेल" } },
    ],
    correctOptionId: "A",
    explanation: {
      en: "Dr. B.R. Ambedkar chaired the Drafting Committee of the Constituent Assembly and played the central role in drafting the Constitution, earning him the title 'Father of the Indian Constitution'.",
      hi: "डॉ. बी.आर. अंबेडकर ने संविधान सभा की प्रारूप समिति की अध्यक्षता की और संविधान के निर्माण में केंद्रीय भूमिका निभाई, जिसके कारण उन्हें 'भारतीय संविधान का जनक' कहा जाता है।",
    },
    commonTrap: {
      en: "Students often confuse this with Dr. Rajendra Prasad, who was the President of the Constituent Assembly (its overall presiding officer) — a different role from chairing the Drafting Committee, which was Ambedkar's specific responsibility.",
      hi: "छात्र प्रायः इसे डॉ. राजेंद्र प्रसाद समझ लेते हैं, जो संविधान सभा के अध्यक्ष (सभा के समग्र पीठासीन अधिकारी) थे — यह प्रारूप समिति की अध्यक्षता से भिन्न भूमिका है, जो विशेष रूप से अंबेडकर की जिम्मेदारी थी।",
    },
    expectedTimeSeconds: 35,
    retestOf: "gk-polity-1",
  },

  // ---------------------------------------------------------------------
  // 4. Static GK (national symbols, awards, books & authors)
  // ---------------------------------------------------------------------
  {
    id: "gk-static-1",
    section: "gk",
    concept: "Static GK",
    conceptLabel: { en: "Static GK", hi: "स्थैतिक सामान्य ज्ञान" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "Who wrote the book 'The Discovery of India'?",
      hi: "'द डिस्कवरी ऑफ इंडिया' (भारत की खोज) पुस्तक किसने लिखी थी?",
    },
    options: [
      { id: "A", text: { en: "Mahatma Gandhi", hi: "महात्मा गांधी" } },
      { id: "B", text: { en: "Rabindranath Tagore", hi: "रवींद्रनाथ टैगोर" } },
      { id: "C", text: { en: "Sarojini Naidu", hi: "सरोजिनी नायडू" } },
      { id: "D", text: { en: "Jawaharlal Nehru", hi: "जवाहरलाल नेहरू" } },
    ],
    correctOptionId: "D",
    explanation: {
      en: "Jawaharlal Nehru wrote 'The Discovery of India' during his imprisonment at Ahmednagar Fort in the 1940s. The book traces India's history and civilisation from ancient times to the freedom struggle.",
      hi: "जवाहरलाल नेहरू ने 1940 के दशक में अहमदनगर किले में अपनी कैद के दौरान 'द डिस्कवरी ऑफ इंडिया' पुस्तक लिखी थी। यह पुस्तक प्राचीन काल से लेकर स्वतंत्रता संग्राम तक भारत के इतिहास और सभ्यता का वर्णन करती है।",
    },
    commonTrap: {
      en: "Students often mix this up with Mahatma Gandhi's autobiography, 'The Story of My Experiments with Truth' — both are major freedom-struggle-era books written in captivity or reflection, but they have different authors and different subject matter.",
      hi: "छात्र प्रायः इसे महात्मा गांधी की आत्मकथा 'सत्य के प्रयोग' (द स्टोरी ऑफ माई एक्सपेरिमेंट्स विद ट्रुथ) समझ लेते हैं — दोनों ही स्वतंत्रता संग्राम युग की प्रमुख पुस्तकें हैं, परंतु इनके लेखक और विषय-वस्तु अलग-अलग हैं।",
    },
    expectedTimeSeconds: 35,
  },
  {
    id: "gk-static-2",
    section: "gk",
    concept: "Static GK",
    conceptLabel: { en: "Static GK", hi: "स्थैतिक सामान्य ज्ञान" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "Which animal has been declared the National Aquatic Animal of India?",
      hi: "भारत के राष्ट्रीय जलीय पशु (नेशनल एक्वेटिक एनिमल) के रूप में किस जीव को घोषित किया गया है?",
    },
    options: [
      { id: "A", text: { en: "Royal Bengal Tiger", hi: "रॉयल बंगाल टाइगर" } },
      { id: "B", text: { en: "Gharial", hi: "घड़ियाल" } },
      { id: "C", text: { en: "Ganges River Dolphin", hi: "गंगा नदी डॉल्फिन" } },
      { id: "D", text: { en: "Olive Ridley Turtle", hi: "ऑलिव रिडले कछुआ" } },
    ],
    correctOptionId: "C",
    explanation: {
      en: "The Ganges River Dolphin was declared India's National Aquatic Animal in 2010. It is found mainly in the Ganga-Brahmaputra river system and is regarded as a strong indicator of river health.",
      hi: "गंगा नदी डॉल्फिन को वर्ष 2010 में भारत का राष्ट्रीय जलीय पशु घोषित किया गया था। यह मुख्यतः गंगा-ब्रह्मपुत्र नदी तंत्र में पाई जाती है और नदी के स्वास्थ्य का एक सशक्त संकेतक मानी जाती है।",
    },
    commonTrap: {
      en: "Students often answer 'Tiger', confusing the National Aquatic Animal with India's well-known National Animal (the Royal Bengal Tiger) — the two are separate categories of national symbols.",
      hi: "छात्र प्रायः 'टाइगर' उत्तर दे देते हैं, क्योंकि वे राष्ट्रीय जलीय पशु को भारत के सुप्रसिद्ध राष्ट्रीय पशु (रॉयल बंगाल टाइगर) से भ्रमित कर लेते हैं — ये राष्ट्रीय प्रतीकों की दो अलग-अलग श्रेणियाँ हैं।",
    },
    expectedTimeSeconds: 35,
    retestOf: "gk-static-1",
  },

  // ---------------------------------------------------------------------
  // 5. Basic Science
  // ---------------------------------------------------------------------
  {
    id: "gk-science-1",
    section: "gk",
    concept: "Basic Science",
    conceptLabel: { en: "Basic Science", hi: "सामान्य विज्ञान" },
    difficulty: 1,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "Deficiency of which vitamin causes the disease scurvy, marked by bleeding gums and weakness?",
      hi: "किस विटामिन की कमी से स्कर्वी रोग होता है, जिसमें मसूड़ों से खून आना और कमजोरी जैसे लक्षण दिखाई देते हैं?",
    },
    options: [
      { id: "A", text: { en: "Vitamin C", hi: "विटामिन C" } },
      { id: "B", text: { en: "Vitamin D", hi: "विटामिन D" } },
      { id: "C", text: { en: "Vitamin B12", hi: "विटामिन B12" } },
      { id: "D", text: { en: "Vitamin K", hi: "विटामिन K" } },
    ],
    correctOptionId: "A",
    explanation: {
      en: "Scurvy is caused by a deficiency of Vitamin C (ascorbic acid), which is essential for collagen formation. Citrus fruits like lemon and orange are rich sources of Vitamin C.",
      hi: "स्कर्वी रोग विटामिन C (एस्कॉर्बिक एसिड) की कमी से होता है, जो कोलेजन के निर्माण के लिए आवश्यक है। नींबू और संतरे जैसे खट्टे फल विटामिन C के समृद्ध स्रोत हैं।",
    },
    commonTrap: {
      en: "Students often confuse this with Vitamin D deficiency, which instead causes rickets in children and osteomalacia in adults — a different vitamin linked to a different set of bone-related diseases.",
      hi: "छात्र प्रायः इसे विटामिन D की कमी समझ लेते हैं, जिससे वास्तव में बच्चों में रिकेट्स और वयस्कों में ऑस्टियोमलेशिया (अस्थिमृदुता) होता है — यह एक अलग विटामिन है जो हड्डियों से जुड़े अलग रोगों से संबंधित है।",
    },
    expectedTimeSeconds: 35,
  },
  {
    id: "gk-science-2",
    section: "gk",
    concept: "Basic Science",
    conceptLabel: { en: "Basic Science", hi: "सामान्य विज्ञान" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "What is the SI unit of electric current?",
      hi: "विद्युत धारा (इलेक्ट्रिक करंट) का SI मात्रक क्या है?",
    },
    options: [
      { id: "A", text: { en: "Volt", hi: "वोल्ट" } },
      { id: "B", text: { en: "Ampere", hi: "एम्पियर" } },
      { id: "C", text: { en: "Ohm", hi: "ओम" } },
      { id: "D", text: { en: "Watt", hi: "वाट" } },
    ],
    correctOptionId: "B",
    explanation: {
      en: "The SI unit of electric current is the Ampere (A), named after French physicist André-Marie Ampère. It measures the rate of flow of electric charge.",
      hi: "विद्युत धारा का SI मात्रक एम्पियर (A) है, जिसका नाम फ्रांसीसी भौतिक विज्ञानी आंद्रे-मैरी एम्पियर के नाम पर रखा गया है। यह विद्युत आवेश के प्रवाह की दर को मापता है।",
    },
    commonTrap: {
      en: "Students often mix this up with Volt, which is actually the unit of electric potential difference (voltage), not current — a very common current-versus-voltage unit confusion.",
      hi: "छात्र प्रायः इसे वोल्ट समझ लेते हैं, जो वास्तव में विद्युत विभवांतर (वोल्टेज) का मात्रक है, न कि धारा का — यह धारा और वोल्टेज के मात्रकों के बीच होने वाली एक सामान्य भ्रांति है।",
    },
    expectedTimeSeconds: 30,
    retestOf: "gk-science-1",
  },

  // ---------------------------------------------------------------------
  // 6. General Knowledge — evergreen ("largest/longest/first" static facts)
  // ---------------------------------------------------------------------
  {
    id: "gk-evergreen-1",
    section: "gk",
    concept: "General Knowledge",
    conceptLabel: { en: "General Knowledge", hi: "सामान्य ज्ञान" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "Which is the largest Indian state by area?",
      hi: "क्षेत्रफल की दृष्टि से भारत का सबसे बड़ा राज्य कौन-सा है?",
    },
    options: [
      { id: "A", text: { en: "Madhya Pradesh", hi: "मध्य प्रदेश" } },
      { id: "B", text: { en: "Maharashtra", hi: "महाराष्ट्र" } },
      { id: "C", text: { en: "Rajasthan", hi: "राजस्थान" } },
      { id: "D", text: { en: "Uttar Pradesh", hi: "उत्तर प्रदेश" } },
    ],
    correctOptionId: "C",
    explanation: {
      en: "Rajasthan is the largest Indian state by area, covering about 3.42 lakh sq km, roughly a tenth of India's total land area.",
      hi: "राजस्थान क्षेत्रफल की दृष्टि से भारत का सबसे बड़ा राज्य है, जिसका क्षेत्रफल लगभग 3.42 लाख वर्ग किलोमीटर है, जो भारत के कुल भूभाग का लगभग दसवां हिस्सा है।",
    },
    commonTrap: {
      en: "Students sometimes pick Madhya Pradesh, which was the largest state before the year 2000, when Chhattisgarh was carved out of it — after that split, Rajasthan became the largest state by area.",
      hi: "छात्र कभी-कभी मध्य प्रदेश चुन लेते हैं, जो वर्ष 2000 से पहले, जब उससे छत्तीसगढ़ को अलग किया गया था, सबसे बड़ा राज्य था — उस विभाजन के बाद राजस्थान क्षेत्रफल की दृष्टि से सबसे बड़ा राज्य बन गया।",
    },
    expectedTimeSeconds: 35,
  },
  {
    id: "gk-evergreen-2",
    section: "gk",
    concept: "General Knowledge",
    conceptLabel: { en: "General Knowledge", hi: "सामान्य ज्ञान" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "Which is the most populous state in India, as recorded in the 2011 Census, India's most recent census?",
      hi: "भारत की सबसे हाल की जनगणना, 2011 की जनगणना के अनुसार, भारत का सबसे अधिक जनसंख्या वाला राज्य कौन-सा है?",
    },
    options: [
      { id: "A", text: { en: "Maharashtra", hi: "महाराष्ट्र" } },
      { id: "B", text: { en: "Bihar", hi: "बिहार" } },
      { id: "C", text: { en: "West Bengal", hi: "पश्चिम बंगाल" } },
      { id: "D", text: { en: "Uttar Pradesh", hi: "उत्तर प्रदेश" } },
    ],
    correctOptionId: "D",
    explanation: {
      en: "Uttar Pradesh is India's most populous state, with a population of about 19.98 crore as per the 2011 Census — well ahead of the second-most populous state, Maharashtra.",
      hi: "उत्तर प्रदेश भारत का सबसे अधिक जनसंख्या वाला राज्य है, जिसकी जनसंख्या 2011 की जनगणना के अनुसार लगभग 19.98 करोड़ है — जो दूसरे स्थान पर रहने वाले महाराष्ट्र से काफी अधिक है।",
    },
    commonTrap: {
      en: "Students often pick Maharashtra, since it is India's leading state by economic output and home to Mumbai — but by sheer population, Uttar Pradesh ranks well above it.",
      hi: "छात्र प्रायः महाराष्ट्र चुन लेते हैं, क्योंकि यह आर्थिक उत्पादन के मामले में भारत का अग्रणी राज्य है और मुंबई का घर है — परंतु शुद्ध जनसंख्या के मामले में उत्तर प्रदेश इससे कहीं आगे है।",
    },
    expectedTimeSeconds: 40,
    retestOf: "gk-evergreen-1",
  },
];
