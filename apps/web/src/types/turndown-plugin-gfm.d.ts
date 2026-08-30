declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";

  export const gfm: TurndownService.Plugin;
  export const tables: TurndownService.Plugin;
  export const strikethrough: TurndownService.Plugin;
  export const taskListItems: TurndownService.Plugin;
}

declare module "iso-639-1" {
  export interface LanguageData {
    code: string;
    name: string;
    nativeName: string;
  }

  export default class ISO6391 {
    static getName(code: string): string;
    static getNativeName(code: string): string;
    static getCode(name: string): string;
    static getAllNames(): string[];
    static getAllNativeNames(): string[];
    static getAllCodes(): string[];
    static validate(code: string): boolean;
    static getLanguages(codes: readonly string[]): LanguageData[];
  }
}

