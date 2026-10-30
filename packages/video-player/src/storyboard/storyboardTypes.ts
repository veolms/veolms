export interface StoryboardFrame {
  id: string;
  startTime: number;
  endTime: number;
  imageUrl: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /**
   * Size of the whole sprite sheet in pixels, when known up front, so a
   * frame can be cropped from it without waiting for the image to load.
   */
  sheetWidth?: number;
  sheetHeight?: number;
}

export interface StoryboardTrack {
  frames: StoryboardFrame[];
}
