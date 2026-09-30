import { Question } from "../types";

export const quantQuestions: Question[] = [
  // ---------------------------------------------------------------------
  // 1. Percentage
  // ---------------------------------------------------------------------
  {
    id: "quant-percentage-1",
    section: "quant",
    concept: "Percentage",
    conceptLabel: { en: "Percentage", hi: "प्रतिशत" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "In an exam, a student secured 468 marks out of 650 total marks. What percentage of marks did the student secure?",
      hi: "एक परीक्षा में, एक छात्र ने कुल 650 अंकों में से 468 अंक प्राप्त किए। छात्र ने कितने प्रतिशत अंक प्राप्त किए?",
    },
    options: [
      { id: "A", text: { en: "72%", hi: "72%" } },
      { id: "B", text: { en: "68%", hi: "68%" } },
      { id: "C", text: { en: "28%", hi: "28%" } },
      { id: "D", text: { en: "78%", hi: "78%" } },
    ],
    correctOptionId: "A",
    explanation: {
      en: "Percentage secured = (Marks obtained / Total marks) × 100 = (468/650) × 100 = 72%.",
      hi: "प्राप्त प्रतिशत = (प्राप्त अंक / कुल अंक) × 100 = (468/650) × 100 = 72%।",
    },
    commonTrap: {
      en: "Calculating the percentage of marks LOST instead of marks secured: (650−468)/650 × 100 = 28% (option C), instead of finding the percentage actually obtained.",
      hi: "प्राप्त अंकों के प्रतिशत के बजाय खोए हुए अंकों का प्रतिशत निकालना: (650−468)/650 × 100 = 28% (विकल्प C), जबकि वास्तव में प्राप्त प्रतिशत ज्ञात करना था।",
    },
    expectedTimeSeconds: 55,
  },
  {
    id: "quant-percentage-2",
    section: "quant",
    concept: "Percentage",
    conceptLabel: { en: "Percentage", hi: "प्रतिशत" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    retestOf: "quant-percentage-1",
    text: {
      en: "In a village election, a candidate received 891 votes out of a total of 1,350 votes polled. What percentage of the votes did the candidate receive?",
      hi: "एक गाँव के चुनाव में, कुल 1,350 डाले गए वोटों में से एक उम्मीदवार को 891 वोट मिले। उम्मीदवार को कितने प्रतिशत वोट मिले?",
    },
    options: [
      { id: "A", text: { en: "34%", hi: "34%" } },
      { id: "B", text: { en: "74%", hi: "74%" } },
      { id: "C", text: { en: "66%", hi: "66%" } },
      { id: "D", text: { en: "60%", hi: "60%" } },
    ],
    correctOptionId: "C",
    explanation: {
      en: "Percentage of votes received = (891/1350) × 100 = 66%.",
      hi: "प्राप्त वोटों का प्रतिशत = (891/1350) × 100 = 66%।",
    },
    commonTrap: {
      en: "Calculating the percentage of votes NOT received instead of votes received: (1350−891)/1350 × 100 = 34% (option A), instead of the percentage the candidate actually got.",
      hi: "प्राप्त वोटों के प्रतिशत के बजाय न मिले वोटों का प्रतिशत निकालना: (1350−891)/1350 × 100 = 34% (विकल्प A), जबकि उम्मीदवार को वास्तव में मिले प्रतिशत की गणना करनी थी।",
    },
    expectedTimeSeconds: 55,
  },

  // ---------------------------------------------------------------------
  // 2. Profit and Loss
  // ---------------------------------------------------------------------
  {
    id: "quant-profit-loss-1",
    section: "quant",
    concept: "Profit and Loss",
    conceptLabel: { en: "Profit and Loss", hi: "लाभ और हानि" },
    difficulty: 1,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "A shopkeeper bought a table for ₹1,200 and sold it for ₹1,380. Find his profit percentage.",
      hi: "एक दुकानदार ने एक मेज़ ₹1,200 में खरीदी और उसे ₹1,380 में बेच दिया। उसका लाभ प्रतिशत ज्ञात कीजिए।",
    },
    options: [
      { id: "A", text: { en: "13%", hi: "13%" } },
      { id: "B", text: { en: "18%", hi: "18%" } },
      { id: "C", text: { en: "20%", hi: "20%" } },
      { id: "D", text: { en: "15%", hi: "15%" } },
    ],
    correctOptionId: "D",
    explanation: {
      en: "Profit = SP − CP = 1380 − 1200 = ₹180. Profit% = (Profit/CP) × 100 = (180/1200) × 100 = 15%.",
      hi: "लाभ = विक्रय मूल्य − क्रय मूल्य = 1380 − 1200 = ₹180। लाभ% = (लाभ/क्रय मूल्य) × 100 = (180/1200) × 100 = 15%।",
    },
    commonTrap: {
      en: "Calculating profit percentage on the selling price instead of the cost price: (180/1380) × 100 ≈ 13% (option A), instead of dividing by the cost price as the formula requires.",
      hi: "क्रय मूल्य के बजाय विक्रय मूल्य पर लाभ प्रतिशत निकालना: (180/1380) × 100 ≈ 13% (विकल्प A), जबकि सूत्र के अनुसार क्रय मूल्य से भाग देना चाहिए था।",
    },
    expectedTimeSeconds: 45,
  },
  {
    id: "quant-profit-loss-2",
    section: "quant",
    concept: "Profit and Loss",
    conceptLabel: { en: "Profit and Loss", hi: "लाभ और हानि" },
    difficulty: 1,
    marks: 2,
    negativeMarks: 0.5,
    retestOf: "quant-profit-loss-1",
    text: {
      en: "A vendor bought a bicycle for ₹1,750 and sold it at a loss for ₹1,470. Find his loss percentage.",
      hi: "एक विक्रेता ने एक साइकिल ₹1,750 में खरीदी और उसे हानि पर ₹1,470 में बेच दिया। उसका हानि प्रतिशत ज्ञात कीजिए।",
    },
    options: [
      { id: "A", text: { en: "14%", hi: "14%" } },
      { id: "B", text: { en: "16%", hi: "16%" } },
      { id: "C", text: { en: "19%", hi: "19%" } },
      { id: "D", text: { en: "20%", hi: "20%" } },
    ],
    correctOptionId: "B",
    explanation: {
      en: "Loss = CP − SP = 1750 − 1470 = ₹280. Loss% = (Loss/CP) × 100 = (280/1750) × 100 = 16%.",
      hi: "हानि = क्रय मूल्य − विक्रय मूल्य = 1750 − 1470 = ₹280। हानि% = (हानि/क्रय मूल्य) × 100 = (280/1750) × 100 = 16%।",
    },
    commonTrap: {
      en: "Calculating loss percentage on the selling price instead of the cost price: (280/1470) × 100 ≈ 19% (option C), instead of dividing by the cost price.",
      hi: "क्रय मूल्य के बजाय विक्रय मूल्य पर हानि प्रतिशत निकालना: (280/1470) × 100 ≈ 19% (विकल्प C), जबकि क्रय मूल्य से भाग देना चाहिए था।",
    },
    expectedTimeSeconds: 45,
  },

  // ---------------------------------------------------------------------
  // 3. Simple and Compound Interest
  // ---------------------------------------------------------------------
  {
    id: "quant-si-ci-1",
    section: "quant",
    concept: "Simple and Compound Interest",
    conceptLabel: { en: "Simple and Compound Interest", hi: "साधारण एवं चक्रवृद्धि ब्याज" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "Find the compound interest on ₹8,000 for 2 years at 10% per annum, compounded annually.",
      hi: "₹8,000 पर 10% वार्षिक दर से 2 वर्षों के लिए चक्रवृद्धि ब्याज ज्ञात कीजिए (वार्षिक रूप से चक्रवृद्धि)।",
    },
    options: [
      { id: "A", text: { en: "₹1,600", hi: "₹1,600" } },
      { id: "B", text: { en: "₹2,648", hi: "₹2,648" } },
      { id: "C", text: { en: "₹1,680", hi: "₹1,680" } },
      { id: "D", text: { en: "₹800", hi: "₹800" } },
    ],
    correctOptionId: "C",
    explanation: {
      en: "Amount = P(1+r/100)^n = 8000×(1.1)² = 8000×1.21 = ₹9,680. CI = Amount − P = 9680 − 8000 = ₹1,680.",
      hi: "मिश्रधन = P(1+r/100)^n = 8000×(1.1)² = 8000×1.21 = ₹9,680। चक्रवृद्धि ब्याज = मिश्रधन − मूलधन = 9680 − 8000 = ₹1,680।",
    },
    commonTrap: {
      en: "Applying the Simple Interest formula instead of compounding year-on-year: (8000×10×2)/100 = ₹1,600 (option A), instead of accounting for interest earned on the first year's interest too.",
      hi: "वर्ष-दर-वर्ष चक्रवृद्धि करने के बजाय साधारण ब्याज का सूत्र लगाना: (8000×10×2)/100 = ₹1,600 (विकल्प A), जबकि पहले वर्ष के ब्याज पर भी ब्याज जोड़ना चाहिए था।",
    },
    expectedTimeSeconds: 75,
  },
  {
    id: "quant-si-ci-2",
    section: "quant",
    concept: "Simple and Compound Interest",
    conceptLabel: { en: "Simple and Compound Interest", hi: "साधारण एवं चक्रवृद्धि ब्याज" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    retestOf: "quant-si-ci-1",
    text: {
      en: "Find the compound interest on ₹15,000 for 2 years at 20% per annum, compounded annually.",
      hi: "₹15,000 पर 20% वार्षिक दर से 2 वर्षों के लिए चक्रवृद्धि ब्याज ज्ञात कीजिए (वार्षिक रूप से चक्रवृद्धि)।",
    },
    options: [
      { id: "A", text: { en: "₹6,600", hi: "₹6,600" } },
      { id: "B", text: { en: "₹6,000", hi: "₹6,000" } },
      { id: "C", text: { en: "₹10,920", hi: "₹10,920" } },
      { id: "D", text: { en: "₹3,000", hi: "₹3,000" } },
    ],
    correctOptionId: "A",
    explanation: {
      en: "Amount = P(1+r/100)^n = 15000×(1.2)² = 15000×1.44 = ₹21,600. CI = 21600 − 15000 = ₹6,600.",
      hi: "मिश्रधन = P(1+r/100)^n = 15000×(1.2)² = 15000×1.44 = ₹21,600। चक्रवृद्धि ब्याज = 21600 − 15000 = ₹6,600।",
    },
    commonTrap: {
      en: "Applying the Simple Interest formula instead of compounding year-on-year: (15000×20×2)/100 = ₹6,000 (option B), instead of adding the interest earned on the first year's interest as well.",
      hi: "वर्ष-दर-वर्ष चक्रवृद्धि करने के बजाय साधारण ब्याज का सूत्र लगाना: (15000×20×2)/100 = ₹6,000 (विकल्प B), जबकि पहले वर्ष के ब्याज पर भी अर्जित ब्याज जोड़ना चाहिए था।",
    },
    expectedTimeSeconds: 75,
  },

  // ---------------------------------------------------------------------
  // 4. Time and Work
  // ---------------------------------------------------------------------
  {
    id: "quant-time-work-1",
    section: "quant",
    concept: "Time and Work",
    conceptLabel: { en: "Time and Work", hi: "समय और कार्य" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "A can complete a piece of work in 12 days and B can complete the same work in 18 days. If they work together, in how many days will the work be completed?",
      hi: "A किसी काम को 12 दिनों में पूरा कर सकता है और B उसी काम को 18 दिनों में पूरा कर सकता है। यदि वे दोनों मिलकर काम करें, तो काम कितने दिनों में पूरा होगा?",
    },
    options: [
      { id: "A", text: { en: "15 days", hi: "15 दिन" } },
      { id: "B", text: { en: "30 days", hi: "30 दिन" } },
      { id: "C", text: { en: "36 days", hi: "36 दिन" } },
      { id: "D", text: { en: "7.2 days", hi: "7.2 दिन" } },
    ],
    correctOptionId: "D",
    explanation: {
      en: "A's one day's work = 1/12; B's one day's work = 1/18. Combined one day's work = 1/12 + 1/18 = 3/36 + 2/36 = 5/36. Time taken together = 36/5 = 7.2 days.",
      hi: "A का एक दिन का कार्य = 1/12; B का एक दिन का कार्य = 1/18। दोनों का मिलाकर एक दिन का कार्य = 1/12 + 1/18 = 3/36 + 2/36 = 5/36। साथ में काम पूरा करने में लगा समय = 36/5 = 7.2 दिन।",
    },
    commonTrap: {
      en: "Averaging the two individual times instead of adding their work rates: (12+18)/2 = 15 days (option A), instead of combining how much work each does per day.",
      hi: "कार्य-दर जोड़ने के बजाय दोनों के अलग-अलग समय का औसत निकालना: (12+18)/2 = 15 दिन (विकल्प A), जबकि यह देखना चाहिए था कि दोनों मिलकर एक दिन में कितना काम करते हैं।",
    },
    expectedTimeSeconds: 65,
  },
  {
    id: "quant-time-work-2",
    section: "quant",
    concept: "Time and Work",
    conceptLabel: { en: "Time and Work", hi: "समय और कार्य" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    retestOf: "quant-time-work-1",
    text: {
      en: "Ravi can finish a task in 15 days and Suresh can finish the same task in 10 days. If they work together, in how many days will they finish it?",
      hi: "रवि किसी काम को 15 दिनों में पूरा कर सकता है और सुरेश उसी काम को 10 दिनों में पूरा कर सकता है। यदि वे दोनों मिलकर काम करें, तो वे इसे कितने दिनों में पूरा करेंगे?",
    },
    options: [
      { id: "A", text: { en: "12.5 days", hi: "12.5 दिन" } },
      { id: "B", text: { en: "6 days", hi: "6 दिन" } },
      { id: "C", text: { en: "25 days", hi: "25 दिन" } },
      { id: "D", text: { en: "30 days", hi: "30 दिन" } },
    ],
    correctOptionId: "B",
    explanation: {
      en: "Ravi's one day's work = 1/15; Suresh's one day's work = 1/10. Combined one day's work = 1/15 + 1/10 = 2/30 + 3/30 = 5/30 = 1/6. Time taken together = 6 days.",
      hi: "रवि का एक दिन का कार्य = 1/15; सुरेश का एक दिन का कार्य = 1/10। दोनों का मिलाकर एक दिन का कार्य = 1/15 + 1/10 = 2/30 + 3/30 = 5/30 = 1/6। साथ में काम पूरा करने में लगा समय = 6 दिन।",
    },
    commonTrap: {
      en: "Averaging the two individual times instead of adding their work rates: (15+10)/2 = 12.5 days (option A), instead of combining how much work each does per day.",
      hi: "कार्य-दर जोड़ने के बजाय दोनों के अलग-अलग समय का औसत निकालना: (15+10)/2 = 12.5 दिन (विकल्प A), जबकि यह देखना चाहिए था कि दोनों मिलकर एक दिन में कितना काम करते हैं।",
    },
    expectedTimeSeconds: 65,
  },

  // ---------------------------------------------------------------------
  // 5. Time, Speed and Distance
  // ---------------------------------------------------------------------
  {
    id: "quant-tsd-1",
    section: "quant",
    concept: "Time, Speed and Distance",
    conceptLabel: { en: "Time, Speed and Distance", hi: "समय, चाल और दूरी" },
    difficulty: 3,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "A train 150 metres long is running at a speed of 54 km/h. In how many seconds will it cross a platform 300 metres long?",
      hi: "150 मीटर लंबी एक रेलगाड़ी 54 किमी/घंटा की चाल से चल रही है। यह 300 मीटर लंबे एक प्लेटफ़ॉर्म को कितने सेकंड में पार करेगी?",
    },
    options: [
      { id: "A", text: { en: "30 seconds", hi: "30 सेकंड" } },
      { id: "B", text: { en: "10 seconds", hi: "10 सेकंड" } },
      { id: "C", text: { en: "20 seconds", hi: "20 सेकंड" } },
      { id: "D", text: { en: "8.3 seconds", hi: "8.3 सेकंड" } },
    ],
    correctOptionId: "A",
    explanation: {
      en: "Speed = 54 km/h = 54 × 5/18 = 15 m/s. Distance to be covered = length of train + length of platform = 150 + 300 = 450 m. Time = Distance/Speed = 450/15 = 30 seconds.",
      hi: "चाल = 54 किमी/घंटा = 54 × 5/18 = 15 मीटर/सेकंड। तय की जाने वाली दूरी = रेलगाड़ी की लंबाई + प्लेटफ़ॉर्म की लंबाई = 150 + 300 = 450 मीटर। समय = दूरी/चाल = 450/15 = 30 सेकंड।",
    },
    commonTrap: {
      en: "Using only the train's length (150 m) as the distance to be covered, forgetting that the train must also cover the platform's length: 150/15 = 10 seconds (option B), instead of the correct 450/15 = 30 seconds.",
      hi: "तय की जाने वाली दूरी के रूप में केवल रेलगाड़ी की लंबाई (150 मीटर) लेना और यह भूल जाना कि रेलगाड़ी को प्लेटफ़ॉर्म की लंबाई भी पार करनी है: 150/15 = 10 सेकंड (विकल्प B), जबकि सही उत्तर 450/15 = 30 सेकंड है।",
    },
    expectedTimeSeconds: 95,
  },
  {
    id: "quant-tsd-2",
    section: "quant",
    concept: "Time, Speed and Distance",
    conceptLabel: { en: "Time, Speed and Distance", hi: "समय, चाल और दूरी" },
    difficulty: 3,
    marks: 2,
    negativeMarks: 0.5,
    retestOf: "quant-tsd-1",
    text: {
      en: "A train 200 metres long is running at a speed of 72 km/h. In how many seconds will it cross a platform 250 metres long?",
      hi: "200 मीटर लंबी एक रेलगाड़ी 72 किमी/घंटा की चाल से चल रही है। यह 250 मीटर लंबे एक प्लेटफ़ॉर्म को कितने सेकंड में पार करेगी?",
    },
    options: [
      { id: "A", text: { en: "10 seconds", hi: "10 सेकंड" } },
      { id: "B", text: { en: "12.5 seconds", hi: "12.5 सेकंड" } },
      { id: "C", text: { en: "22.5 seconds", hi: "22.5 सेकंड" } },
      { id: "D", text: { en: "6.25 seconds", hi: "6.25 सेकंड" } },
    ],
    correctOptionId: "C",
    explanation: {
      en: "Speed = 72 km/h = 72 × 5/18 = 20 m/s. Distance to be covered = length of train + length of platform = 200 + 250 = 450 m. Time = Distance/Speed = 450/20 = 22.5 seconds.",
      hi: "चाल = 72 किमी/घंटा = 72 × 5/18 = 20 मीटर/सेकंड। तय की जाने वाली दूरी = रेलगाड़ी की लंबाई + प्लेटफ़ॉर्म की लंबाई = 200 + 250 = 450 मीटर। समय = दूरी/चाल = 450/20 = 22.5 सेकंड।",
    },
    commonTrap: {
      en: "Using only the train's length (200 m) instead of train + platform (450 m): 200/20 = 10 seconds (option A), instead of the correct 22.5 seconds.",
      hi: "रेलगाड़ी + प्लेटफ़ॉर्म (450 मीटर) के बजाय केवल रेलगाड़ी की लंबाई (200 मीटर) का उपयोग करना: 200/20 = 10 सेकंड (विकल्प A), जबकि सही उत्तर 22.5 सेकंड है।",
    },
    expectedTimeSeconds: 95,
  },

  // ---------------------------------------------------------------------
  // 6. Ratio and Proportion
  // ---------------------------------------------------------------------
  {
    id: "quant-ratio-1",
    section: "quant",
    concept: "Ratio and Proportion",
    conceptLabel: { en: "Ratio and Proportion", hi: "अनुपात और समानुपात" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    text: {
      en: "The ratio of the ages of A and B is 3:5. If the sum of their ages is 64 years, find B's age.",
      hi: "A और B की आयु का अनुपात 3:5 है। यदि उनकी आयु का योग 64 वर्ष है, तो B की आयु ज्ञात कीजिए।",
    },
    options: [
      { id: "A", text: { en: "24 years", hi: "24 वर्ष" } },
      { id: "B", text: { en: "40 years", hi: "40 वर्ष" } },
      { id: "C", text: { en: "32 years", hi: "32 वर्ष" } },
      { id: "D", text: { en: "8 years", hi: "8 वर्ष" } },
    ],
    correctOptionId: "B",
    explanation: {
      en: "Let A's age = 3x and B's age = 5x. Sum: 3x + 5x = 64 → 8x = 64 → x = 8. B's age = 5x = 5 × 8 = 40 years.",
      hi: "मान लीजिए A की आयु = 3x और B की आयु = 5x। योग: 3x + 5x = 64 → 8x = 64 → x = 8। B की आयु = 5x = 5 × 8 = 40 वर्ष।",
    },
    commonTrap: {
      en: "Solving for A's age (3x = 3×8 = 24) instead of B's age as asked, selecting option A instead of the correct 40 years.",
      hi: "प्रश्न में पूछी गई B की आयु के बजाय A की आयु (3x = 3×8 = 24) निकाल लेना, और सही उत्तर 40 वर्ष के बजाय विकल्प A चुन लेना।",
    },
    expectedTimeSeconds: 55,
  },
  {
    id: "quant-ratio-2",
    section: "quant",
    concept: "Ratio and Proportion",
    conceptLabel: { en: "Ratio and Proportion", hi: "अनुपात और समानुपात" },
    difficulty: 2,
    marks: 2,
    negativeMarks: 0.5,
    retestOf: "quant-ratio-1",
    text: {
      en: "Two numbers are in the ratio 4:7. If their sum is 99, find the larger number.",
      hi: "दो संख्याओं का अनुपात 4:7 है। यदि उनका योग 99 है, तो बड़ी संख्या ज्ञात कीजिए।",
    },
    options: [
      { id: "A", text: { en: "36", hi: "36" } },
      { id: "B", text: { en: "49.5", hi: "49.5" } },
      { id: "C", text: { en: "9", hi: "9" } },
      { id: "D", text: { en: "63", hi: "63" } },
    ],
    correctOptionId: "D",
    explanation: {
      en: "Let the numbers be 4x and 7x. Sum: 4x + 7x = 99 → 11x = 99 → x = 9. Larger number = 7x = 7 × 9 = 63.",
      hi: "मान लीजिए संख्याएँ 4x और 7x हैं। योग: 4x + 7x = 99 → 11x = 99 → x = 9। बड़ी संख्या = 7x = 7 × 9 = 63।",
    },
    commonTrap: {
      en: "Calculating the smaller number (4x = 4×9 = 36) instead of the larger number as asked, selecting option A instead of the correct 63.",
      hi: "प्रश्न में पूछी गई बड़ी संख्या के बजाय छोटी संख्या (4x = 4×9 = 36) निकाल लेना, और सही उत्तर 63 के बजाय विकल्प A चुन लेना।",
    },
    expectedTimeSeconds: 55,
  },
];
