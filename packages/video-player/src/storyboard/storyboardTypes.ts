export interface StoryboardFrame {
  id: string;
  startTime: number;
  endTime: number;
  imageUrl: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface StoryboardTrack {
  frames: StoryboardFrame[];
}
