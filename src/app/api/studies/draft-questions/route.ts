import { NextResponse } from "next/server";
import { getLLMProvider } from "@/llm";
import { draftPreInterviewQuestions } from "@/study-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    title?: string;
    description?: string;
  } | null;

  if (!body?.title || !body.description) {
    return NextResponse.json({ error: "title and description are required" }, { status: 400 });
  }

  try {
    const questions = await draftPreInterviewQuestions(
      { llm: getLLMProvider() },
      { title: body.title, description: body.description },
    );
    return NextResponse.json(questions);
  } catch (error) {
    console.error("Failed to draft pre-interview questions:", error);
    return NextResponse.json({ error: "Failed to draft pre-interview questions" }, { status: 500 });
  }
}
