import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

function buildPrompt(totalMarks: number) {
  return `You are an experienced languages examiner marking a CSEC Spanish structured test.

I am providing you with two images:
- The FIRST image is the marking scheme / answer key
- The SECOND image is a student's handwritten answer sheet

IMPORTANT: This test is out of ${totalMarks} marks total. The sum of all marks_awarded MUST NOT exceed ${totalMarks}. The sum of all marks_available MUST NOT exceed ${totalMarks}. If the marking scheme implies more marks than ${totalMarks}, scale or cap so the total stays within ${totalMarks}.

For each question and sub-question:
1. Read the student's written response carefully
2. Compare it against the acceptable answers in the marking scheme
3. Award marks based on how many marking points the student addressed
4. Accept reasonable variations in Spanish — minor spelling errors, accent mistakes, or alternative correct phrasings should still receive marks if the meaning is clearly correct
5. Do not penalise for poor handwriting — award marks for correct content only
6. If a student's answer is partially correct, award partial marks as defined by the marking scheme
7. For translation questions, award marks if the meaning is conveyed correctly even if the phrasing differs from the model answer
8. For written response questions, award marks for correct vocabulary, grammar structures, and content points as indicated in the marking scheme
9. For -zar verbs (like empezar, comenzar, alcanzar), the spelling change z→c before the letter e is a standard orthographic rule in Spanish. Accept both spellings — e.g. "empezase" and "empecase" are both correct for the imperfect subjunctive of empezar. Do not penalise for this.

Return ONLY a valid JSON object in this exact format, with no extra text before or after:

{
  "student_name": "name from the paper if visible, otherwise Unknown",
  "student_results": [
    {
      "question": "1(a)",
      "marks_available": 3,
      "marks_awarded": 2,
      "student_answer_summary": "Brief summary of what the student wrote",
      "marking_notes": "Why these marks were awarded or withheld"
    }
  ],
  "total_score": 6,
  "total_available": ${totalMarks}
}`;
}

function capMarks(parsed: Record<string, unknown>, totalMarks: number) {
  if (!parsed.student_results || !Array.isArray(parsed.student_results)) return parsed;

  let runningTotal = 0;
  for (const q of parsed.student_results as Record<string, number>[]) {
    if (typeof q.marks_awarded === "number" && typeof q.marks_available === "number") {
      q.marks_awarded = Math.min(q.marks_awarded, q.marks_available);
      if (runningTotal + q.marks_awarded > totalMarks) {
        q.marks_awarded = Math.max(0, totalMarks - runningTotal);
      }
      runningTotal += q.marks_awarded;
    }
  }

  parsed.total_score = runningTotal;
  parsed.total_available = totalMarks;
  return parsed;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const answerKey = formData.get("answer_key") as File;
    const studentPaper = formData.get("student_paper") as File;
    const studentNameField = formData.get("student_name");
    const studentName =
      typeof studentNameField === "string" ? studentNameField.trim() : "";
    const totalMarksField = formData.get("total_marks");
    const totalMarks =
      totalMarksField ? Math.max(1, parseInt(String(totalMarksField), 10) || 30) : 30;

    const answerKeyBuffer = await answerKey.arrayBuffer();
    const answerKeyBase64 = Buffer.from(answerKeyBuffer).toString("base64");

    const studentPaperBuffer = await studentPaper.arrayBuffer();
    const studentPaperBase64 = Buffer.from(studentPaperBuffer).toString("base64");

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const contentParts = [
      { inlineData: { mimeType: answerKey.type, data: answerKeyBase64 } },
      { inlineData: { mimeType: studentPaper.type, data: studentPaperBase64 } },
      { text: buildPrompt(totalMarks) },
    ];

    const MAX_RETRIES = 3;
    let lastError: unknown = null;
    let responseText = "";

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await model.generateContent(contentParts);
        responseText = result.response.text();
        lastError = null;
        break;
      } catch (err: unknown) {
        lastError = err;
        const isRetryable =
          err instanceof Error &&
          (err.message.includes("503") ||
            err.message.includes("429") ||
            err.message.includes("high demand") ||
            err.message.includes("RESOURCE_EXHAUSTED"));
        if (!isRetryable || attempt === MAX_RETRIES - 1) throw err;
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
    if (lastError) throw lastError;

    const cleaned = responseText.replace(/```json|```/g, "").trim();
    let parsed = JSON.parse(cleaned) as Record<string, unknown>;

    parsed = capMarks(parsed, totalMarks);

    if (studentName) {
      parsed.student_name = studentName;
    }

    return NextResponse.json(parsed);

  } catch (error) {
    console.error("Marking error:", error);
    return NextResponse.json(
      { error: "Marking failed — manual review required" },
      { status: 500 }
    );
  }
}
