import type { Experiment, ExperimentResult, WeekMetrics } from "./weekly-math";

export type LessonBody = { intro: string; sections: { heading: string; text: string }[]; personal: string; takeaway: string };
export type QuizItem = { question: string; options: string[]; answer: number; explanation: string };
export type Lesson = {
  id: string; slug: string; phase: number; sort_order: number; title: string; summary: string | null;
  outline: { [k: string]: string | string[] } | null; status: "available" | "coming_soon";
};

export type GetLessonResult =
  | { status: "ok"; lesson: Lesson; body: LessonBody; quiz: QuizItem[] }
  | { status: "unavailable"; lesson: Lesson | null }
  | { status: "error"; message: string };

export type ReportNarrative = { summary: string; highlights: string[]; experiment_reason: string };
export type WeeklyReport = {
  id: string; week_start: string; week_end: string; metrics: WeekMetrics; narrative: ReportNarrative | null;
  experiment: Experiment | null; experiment_result: ExperimentResult | null; created_at: string;
};
export type WeeklyReportResult =
  | { status: "ok"; report: WeeklyReport; cached: boolean }
  | { status: "insufficient"; metrics: WeekMetrics; min: number }
  | { status: "error"; message: string };
