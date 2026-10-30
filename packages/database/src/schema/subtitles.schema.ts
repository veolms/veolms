export interface LessonSubtitleTable {
  id: string;
  lesson_id: string;
  /** The video the cue timings were made for; only offered while it is the lesson's video. */
  media_asset_id: string;
  /** BCP 47 language tag, such as `en`. */
  language: string;
  label: string;
  kind: "captions" | "subtitles";
  /** WebVTT file inside the video's protected output folder. */
  storage_key: string;
  /** Where the file came from, such as `tagmango` or `youtube`. */
  source: string;
  created_at: Date;
  updated_at: Date;
}
