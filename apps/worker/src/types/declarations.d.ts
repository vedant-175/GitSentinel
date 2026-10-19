declare module 'eslint' {
  export class ESLint {
    constructor(options?: any);
    lintText(code: string, options?: any): Promise<any[]>;
    calculateConfigForFile(filePath: string): Promise<any>;
    isPathIgnored(filePath: string): Promise<boolean>;
    loadFormatter(name?: string): Promise<any>;
    [key: string]: any;
  }
  export const Linter: any;
  export const RuleTester: any;
}
